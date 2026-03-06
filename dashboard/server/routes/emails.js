import { Router } from 'express';
import { getEmails, getEmailById, updateStatus } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { status, page = 1, limit = 50 } = req.query;
  try {
    res.json(getEmails({ status, page, limit }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  const email = getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: 'Not found' });
  res.json(email);
});

router.post('/:id/flag', (req, res) => {
  const email = getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: 'Not found' });
  const { reason, reviewedBy } = req.body;
  updateStatus(email.messageId, 'flagged', { flagReason: reason, reviewedBy, reviewed: true });
  res.json({ success: true });
});

router.post('/:id/approve', (req, res) => {
  const email = getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: 'Not found' });
  const { reviewedBy } = req.body;
  updateStatus(email.messageId, email.status, { reviewedBy, reviewed: true });
  res.json({ success: true });
});

router.post('/:id/reject', (req, res) => {
  const email = getEmailById(req.params.id);
  if (!email) return res.status(404).json({ error: 'Not found' });
  const { reviewedBy, reason } = req.body;
  updateStatus(email.messageId, 'error', { flagReason: reason || 'Rejected by reviewer', reviewedBy, reviewed: true });
  res.json({ success: true });
});

export default router;
