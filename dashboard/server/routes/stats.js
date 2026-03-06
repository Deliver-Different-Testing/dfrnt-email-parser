import { Router } from 'express';
import { getStats } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    res.json(getStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
