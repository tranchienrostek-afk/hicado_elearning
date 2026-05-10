type CampaignLogLike = {
  status: string;
  readAt?: Date | string | null;
};

export function summarizeCampaignLogs(logs: CampaignLogLike[]) {
  const sentCount = logs.filter(log => log.status === 'SENT').length;
  const readCount = logs.filter(log => log.status === 'SENT' && log.readAt).length;
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
