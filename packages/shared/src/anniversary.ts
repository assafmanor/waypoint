// **A year ago today** (ADR-0239 §8, ADR-0241 §7): the date rule the /trips card and the
// anniversary push share, so the two cannot disagree about which day it is.
const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * **How many years ago `startDate` was, when `today` is its anniversary**, else `undefined`.
 * Both are `YYYY-MM-DD`; the caller decides whose today it is. A trip that began on February 29
 * has its anniversary on February 28 in a common year.
 */
export function anniversaryYears(startDate: string, today: string): number | undefined {
  const years = Number(today.slice(0, 4)) - Number(startDate.slice(0, 4));
  if (!(years >= 1)) return undefined;
  const day = startDate.slice(5);
  const todayDay = today.slice(5);
  if (todayDay === day) return years;
  if (day === '02-29' && todayDay === '02-28' && !isLeapYear(Number(today.slice(0, 4)))) {
    return years;
  }
  return undefined;
}
