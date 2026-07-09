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

// A log whose status was flipped to READ by the webhook (see webhook.ts) must still
// count as sent — previously it dropped out of sentCount entirely, permanently
// zeroing readRate for any campaign with at least one read message.
const withReadStatus = summarizeCampaignLogs([
  { status: 'SENT', readAt: null },
  { status: 'READ', readAt: new Date('2026-05-10T10:00:00Z') },
  { status: 'FAILED', readAt: null },
]);

assert.deepStrictEqual(withReadStatus, {
  sentCount: 2,
  readCount: 1,
  failedCount: 1,
  skippedCount: 0,
  readRate: 50,
});

console.log('campaignStats tests passed');
