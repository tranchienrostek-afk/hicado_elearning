import assert from 'assert';
import { summarizeCampaignLogs } from './campaignStats';

const summary = summarizeCampaignLogs([
  { status: 'SENT', readAt: new Date('2026-05-10T10:00:00Z') },
  { status: 'FAILED', readAt: null },
  { status: 'SKIPPED', readAt: null },
  { status: 'SKIPPED', readAt: null },
]);

assert.deepStrictEqual(summary, {
  sentCount: 1,
  readCount: 1,
  failedCount: 1,
  skippedCount: 2,
  readRate: 100,
});

console.log('campaignStats tests passed');
