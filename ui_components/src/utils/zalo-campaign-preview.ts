export type ZaloCampaignWizardType = 'TUITION_REMINDER' | 'GENERAL' | 'CUSTOM_TUITION';

export function shouldLoadMultiClassPreview(
  activeTab: string,
  step: number,
  wizardType: ZaloCampaignWizardType
) {
  return activeTab === 'create' && wizardType === 'TUITION_REMINDER' && (step === 3 || step === 4);
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
