/**
 * Knowledge Graph – Daten für die Wissenslandkarte
 * Nur Seiten und Parent-Child-Verbindungen (keine Tags)
 *
 * Diese Datei stellt den Endpunkt für den Wissensgraph (Knowledge Graph) bereit.
 * Der Graph visualisiert die Beziehungen zwischen Wiki-Seiten als Netzwerk
 * aus Knoten (Nodes) und Kanten (Edges). Aktuell werden nur Parent-Child-Beziehungen
 * zwischen Seiten dargestellt (keine Tag-Verbindungen).
 *
 * Endpunkte:
 *   GET /graph – Graph-Daten (Knoten und Kanten) für die Wissenslandkarte abrufen
 *
 * Berechtigungen:
 *   - Erfordert Authentifizierung + 'pages.read'-Berechtigung
 *
 * Sichtbarkeitsregeln:
 *   - Admins sehen alle nicht-gelöschten Seiten
 *   - Normale Benutzer sehen nur veröffentlichte Seiten in ihren Spaces, eigene Seiten
 *     und Seiten in ihren privaten Spaces
 *
 * Antwortformat:
 *   {
 *     nodes: [{ id, pageId, label, type, workflowStatus, author, updatedAt }],
 *     edges: [{ source, target, type }]
 *   }
 *
 * Datenbanktabellen: wiki_pages, users, space_memberships, private_spaces
 */

const express = require('express');
const router = express.Router();

// Datenbankverbindung importieren
const { getPool } = require('../database');
// Authentifizierungs- und Berechtigungs-Middleware
const { authenticate, requirePermission } = require('../middleware/auth');

// ============================================================================
// GET /graph – Graph-Daten für die Wissenslandkarte abrufen
// Gibt alle sichtbaren Seiten als Knoten (Nodes) und ihre hierarchischen
// Beziehungen als Kanten (Edges) zurück. Wird im Frontend für die
// interaktive Visualisierung des Wissensgraphen verwendet.
// Erfordert: Authentifizierung + 'pages.read'-Berechtigung
// Antwort: { nodes: [...], edges: [...] }
// ============================================================================
router.get('/graph', authenticate, requirePermission('pages.read'), async (req, res) => {
  // Datenbankpool holen
  const pool = getPool();
  // Prüfen, ob die Datenbank verbunden ist
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  // Prüfen, ob der aktuelle Benutzer ein Admin ist (bestimmt die Sichtbarkeit)
  const isAdmin = req.user.global_role === 'admin';

  try {
    // Alle sichtbaren Seiten aus der Datenbank abfragen
    // Sichtbarkeitsregeln:
    //   - Admins: Alle nicht-gelöschten Seiten (WHERE TRUE)
    //   - Normale Benutzer: Nur veröffentlichte Seiten ('published'),
    //     eigene Seiten oder Seiten, die per Freigabe geteilt wurden
    const pagesResult = await pool.query(`
      SELECT p.id, p.title, p.parent_id, p.workflow_status, p.content_type,
             p.created_by, u.username AS created_by_name,
             p.updated_at
      FROM wiki_pages p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.deleted_at IS NULL
        AND ${isAdmin ? 'TRUE' : `(
          (p.workflow_status = 'published' AND p.space_id IS NOT NULL AND EXISTS (SELECT 1 FROM space_memberships sm WHERE sm.space_id = p.space_id AND sm.user_id = $1))
          OR p.created_by = $1
          OR p.private_space_id IN (SELECT id FROM private_spaces WHERE user_id = $1)
        )`}
      ORDER BY p.title ASC`,
      isAdmin ? [] : [req.user.id]
    );

    // Knoten (Nodes) erstellen – jede Seite wird zu einem Knoten im Graph
    // Die ID wird mit dem Präfix 'page-' versehen, um Namenskonflikte zu vermeiden
    // (z.B. falls in Zukunft auch Tags als Knoten hinzugefügt werden)
    const nodes = pagesResult.rows.map(p => ({
      id: `page-${p.id}`,        // Eindeutige Knoten-ID mit Typ-Präfix
      pageId: p.id,               // Original-Seiten-ID für Verlinkung
      label: p.title,             // Anzeigename im Graph
      type: 'page',               // Knotentyp (aktuell nur 'page')
      workflowStatus: p.workflow_status,   // Workflow-Status der Seite
      author: p.created_by_name,  // Name des Erstellers
      updatedAt: p.updated_at,    // Letztes Aktualisierungsdatum
    }));

    // Kanten (Edges) erstellen – nur Parent-Child-Beziehungen zwischen Seiten
    // Jede Kante verbindet eine Elternseite (source) mit einer Kindseite (target)
    const edges = [];
    for (const page of pagesResult.rows) {
      // Nur Seiten mit einer Elternseite erzeugen eine Kante
      if (page.parent_id) {
        // Sicherstellen, dass die Elternseite auch im sichtbaren Bereich liegt
        // (verhindert Kanten zu Seiten, die der Benutzer nicht sehen darf)
        const parentExists = pagesResult.rows.some(p => p.id === page.parent_id);
        if (parentExists) {
          edges.push({
            source: `page-${page.parent_id}`,  // Ausgangsknoten (Elternseite)
            target: `page-${page.id}`,          // Zielknoten (Kindseite)
            type: 'parent',                     // Kantentyp (hierarchische Beziehung)
          });
        }
      }
    }

    // Graph-Daten (Knoten und Kanten) als JSON zurückgeben
    res.json({ nodes, edges });
  } catch (err) {
    // Fehlerbehandlung bei Datenbankfehlern
    console.error('Error building graph:', err.message);
    res.status(500).json({ error: 'Failed to build knowledge graph' });
  }
});

// Router-Modul exportieren, damit es in der Hauptanwendung eingebunden werden kann
module.exports = router;
