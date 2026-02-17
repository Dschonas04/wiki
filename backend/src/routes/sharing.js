/**
 * Seitenfreigaben (Legacy – Veraltet)
 *
 * Die wiki_page_shares-Tabelle existiert nicht mehr.
 * Das Teilen von Seiten wird jetzt über space_memberships verwaltet.
 *
 * Alle Endpunkte in dieser Datei geben 410 Gone zurück und verweisen
 * auf die neuen Space-Membership-Endpunkte.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const GONE_MESSAGE = {
  error: 'Gone',
  message: 'Page-level sharing has been removed. Sharing is now managed through space memberships. Use the /api/spaces endpoints instead.',
};

router.get('/pages/:id/shares', authenticate, (req, res) => res.status(410).json(GONE_MESSAGE));
router.post('/pages/:id/shares', authenticate, (req, res) => res.status(410).json(GONE_MESSAGE));
router.delete('/pages/:id/shares/:userId', authenticate, (req, res) => res.status(410).json(GONE_MESSAGE));
router.get('/shared', authenticate, (req, res) => res.status(410).json(GONE_MESSAGE));

module.exports = router;
