type CampaignLogLike = {
  status: string;
  readAt?: Date | string | null;
};

export function summarizeCampaignLogs(logs: CampaignLogLike[]) {
  // A log's status flips SENT -> READ once the webhook records a read receipt
  // (see webhook.ts), so "sent" must include both — otherwise every read message
  // drops out of sentCount and readRate is permanently 0.
  const sentCount = logs.filter(log => log.status === 'SENT' || log.status === 'READ').length;
  const readCount = logs.filter(log => log.status === 'READ' || (log.status === 'SENT' && log.readAt)).length;
  const failedCount = logs.filter(log => log.status === 'FAILED').length;
  const skippedCount = logs.filter(log => log.status === 'SKIPPED').length;

  return {
    sentCount,
    readCount,
    failedCount,
    skippedCount,
    readRate: sentCount > 0 ? Math.round((readCount / sentCount) * 100) : 0,
  };
}
