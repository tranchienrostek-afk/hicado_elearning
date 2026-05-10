import { describe, expect, it } from 'vitest';
import { getUnconfirmedAlreadySentRecipients, shouldLoadMultiClassPreview } from './zalo-campaign-preview';

describe('zalo campaign preview state', () => {
  it('keeps loading tuition preview data through message preview step', () => {
    expect(shouldLoadMultiClassPreview('create', 3, 'TUITION_REMINDER')).toBe(true);
    expect(shouldLoadMultiClassPreview('create', 4, 'TUITION_REMINDER')).toBe(true);
  });

  it('does not keep tuition preview data outside the create tuition reminder flow', () => {
    expect(shouldLoadMultiClassPreview('mapping', 4, 'TUITION_REMINDER')).toBe(false);
    expect(shouldLoadMultiClassPreview('create', 4, 'CUSTOM_TUITION')).toBe(false);
    expect(shouldLoadMultiClassPreview('create', 2, 'TUITION_REMINDER')).toBe(false);
    expect(shouldLoadMultiClassPreview('create', 5, 'TUITION_REMINDER')).toBe(false);
  });
});

describe('zalo campaign duplicate send confirmation', () => {
  it('returns already sent recipients that were not explicitly selected for resend', () => {
    const recipients = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
    const preview = [
      { studentId: 's1', alreadySent: true },
      { studentId: 's2', alreadySent: true },
      { studentId: 's3', alreadySent: false },
    ];

    expect(getUnconfirmedAlreadySentRecipients(recipients, preview, ['s2'])).toEqual([{ id: 's1' }]);
  });
});
