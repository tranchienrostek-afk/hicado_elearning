export type ZaloCampaignWizardType = 'TUITION_REMINDER' | 'GENERAL' | 'CUSTOM_TUITION';

export function shouldLoadMultiClassPreview(
  activeTab: string,
  step: number,
  wizardType: ZaloCampaignWizardType
) {
  return activeTab === 'create' && wizardType === 'TUITION_REMINDER' && (step === 3 || step === 4);
}
