/**
 * Genehmigungs-Routen (Legacy – Veraltet)
 *
 * Die approval_requests-Tabelle existiert nicht mehr.
 * Der Genehmigungs-/Veröffentlichungsworkflow wird jetzt über die
 * publish_requests-Tabelle und die Endpunkte in publishing.js abgewickelt.
 *
 * Alle Endpunkte in dieser Datei geben 410 Gone zurück und verweisen
 * auf die neuen Publishing-Endpunkte.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const GONE_MESSAGE = {
  error: 'Gone',
  message: 'The approval workflow has been replaced. Use the /api/publishing endpoints instead.',
};

router.post('/pages/:id/request-approval', authenticate, (req, res) => res.status(410).json(GONE_MESSAGE));
router.post('/pages/:id/cancel-approval', authenticate, (req, res) => res.status(410).json(GONE_MESSAGE));
router.get('/approvals', authenticate, (req, res) => res.status(410).json(GONE_MESSAGE));
router.get('/approvals/count', authenticate, (req, res) => res.status(410).json(GONE_MESSAGE));
router.post('/approvals/:id/approve', authenticate, (req, res) => res.status(410).json(GONE_MESSAGE));
router.post('/approvals/:id/reject', authenticate, (req, res) => res.status(410).json(GONE_MESSAGE));
router.get('/pages/:id/approval-status', authenticate, (req, res) => res.status(410).json(GONE_MESSAGE));

module.exports = router;
