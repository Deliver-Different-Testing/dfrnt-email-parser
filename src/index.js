/**
 * index.js - Email Parser Service entry point
 * Urgent Couriers booking automation via email
 */

import cron from 'node-cron';
import config from '../config/default.js';
import { loadStore } from './store.js';
import { pollGmail } from './gmail.js';
import { pollO365 } from './o365.js';

function timestamp() {
  return new Date().toISOString();
}

async function runPolling() {
  const tasks = [];

  if (config.provider === 'gmail' || config.provider === 'both') {
    tasks.push(
      pollGmail().catch(err =>
        console.error(`[MAIN] ${timestamp()} Gmail poll error:`, err.message)
      )
    );
  }

  if (config.provider === 'o365' || config.provider === 'both') {
    tasks.push(
      pollO365().catch(err =>
        console.error(`[MAIN] ${timestamp()} O365 poll error:`, err.message)
      )
    );
  }

  if (tasks.length === 0) {
    console.warn(`[MAIN] ${timestamp()} No email provider configured. Set EMAIL_PROVIDER=gmail|o365|both`);
    return;
  }

  await Promise.allSettled(tasks);
}

async function main() {
  console.log(`[MAIN] ${timestamp()} Starting Urgent Couriers Email Parser`);
  console.log(`[MAIN] ${timestamp()} Provider: ${config.provider}`);
  console.log(`[MAIN] ${timestamp()} Poll interval: ${config.pollIntervalMinutes} minute(s)`);
  console.log(`[MAIN] ${timestamp()} Booking URL: ${config.booking.url}`);

  // Load persisted processed IDs
  loadStore();

  // Run immediately on startup
  console.log(`[MAIN] ${timestamp()} Running initial poll...`);
  await runPolling();

  // Schedule recurring poll
  const cronExpr = `*/${config.pollIntervalMinutes} * * * *`;
  console.log(`[MAIN] ${timestamp()} Scheduling cron: ${cronExpr}`);

  cron.schedule(cronExpr, async () => {
    console.log(`[MAIN] ${timestamp()} Cron triggered`);
    await runPolling();
  });

  console.log(`[MAIN] ${timestamp()} Email parser running. Press Ctrl+C to stop.`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n[MAIN] ${timestamp()} Shutting down...`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`\n[MAIN] ${timestamp()} Shutting down...`);
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[MAIN] ${timestamp()} Unhandled rejection:`, reason);
  // Don't exit — keep the service running
});

main().catch(err => {
  console.error(`[MAIN] ${timestamp()} Fatal startup error:`, err.message);
  process.exit(1);
});
