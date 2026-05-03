import { describe, expect, it } from 'vitest';
import { attendanceDateKey, attendanceSameDay } from './attendance-date';

describe('attendance date helpers', () => {
  it('matches API ISO dates to date input values', () => {
    expect(attendanceDateKey('2026-05-03T00:00:00.000Z')).toBe('2026-05-03');
    expect(attendanceSameDay('2026-05-03T00:00:00.000Z', '2026-05-03')).toBe(true);
  });
});
