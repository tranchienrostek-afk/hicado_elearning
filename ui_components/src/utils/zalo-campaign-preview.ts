export type ZaloCampaignWizardType = 'TUITION_REMINDER' | 'GENERAL' | 'CUSTOM_TUITION';

export function shouldLoadMultiClassPreview(
  activeTab: string,
  step: number,
  wizardType: ZaloCampaignWizardType
) {
  if (activeTab !== 'create' || (step !== 3 && step !== 4)) return false;
  // CUSTOM_TUITION also needs the backend's accurate, override-aware per-session
  // price (mainClass.subtotal / mainClass.attended) to seed its suggested price —
  // computing "is the discount active as of today" locally ignores the per-session
  // date the backend actually bills against.
  return wizardType === 'TUITION_REMINDER' || wizardType === 'CUSTOM_TUITION';
}

export function getUnconfirmedAlreadySentRecipients<T extends { id: string }>(
  recipients: T[],
  previews: Array<{ studentId: string; alreadySent: boolean }>,
  forceResendStudentIds: string[]
) {
  const forced = new Set(forceResendStudentIds);
  const sent = new Set(previews.filter(item => item.alreadySent).map(item => item.studentId));
  return recipients.filter(recipient => sent.has(recipient.id) && !forced.has(recipient.id));
}
