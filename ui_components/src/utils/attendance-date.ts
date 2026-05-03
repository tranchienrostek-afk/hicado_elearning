export const attendanceDateKey = (value?: string) => {
  if (!value) return '';
  return value.includes('T') ? value.slice(0, 10) : value;
};

export const attendanceSameDay = (recordDate?: string, selectedDate?: string) =>
  attendanceDateKey(recordDate) === attendanceDateKey(selectedDate);
