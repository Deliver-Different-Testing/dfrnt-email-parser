/**
 * store.js - Persistent processed message ID tracking
 * Stores processed IDs in data/processed.json to survive restarts
 */

import fs from 'fs';
import path from 'path';
import config from '../config/default.js';

const STORE_PATH = path.join(config.dataDir, 'processed.json');

let store = {};

export function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    store = JSON.parse(raw);
    console.log(`[STORE] ${timestamp()} Loaded ${Object.keys(store).length} processed IDs`);
  } catch (err) {
    console.log(`[STORE] ${timestamp()} No existing store found, starting fresh`);
    store = {};
  }
}

export function isProcessed(id) {
  return !!store[id];
}

export function markProcessed(id, meta = {}) {
  store[id] = { processedAt: new Date().toISOString(), ...meta };
  saveStore();
}

function saveStore() {
  try {
    // Prune entries older than 30 days to avoid unbounded growth
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const [id, val] of Object.entries(store)) {
      if (new Date(val.processedAt).getTime() < cutoff) {
        delete store[id];
      }
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error(`[STORE] ${timestamp()} Failed to save store:`, err.message);
  }
}

function timestamp() {
  return new Date().toISOString();
}
