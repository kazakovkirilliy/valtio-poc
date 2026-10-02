const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole calendar days from today (local time) until an ISO `YYYY-MM-DD`
 * date; negative when it is in the past, `NaN` when empty or invalid.
 */
export const daysUntil = (isoDate: string): number => {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return NaN;

  const now = new Date();
  // UTC midnights on both sides so DST shifts never skew the count
  const target = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.round((target - today) / MS_PER_DAY);
};
