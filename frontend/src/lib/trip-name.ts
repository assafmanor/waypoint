// Trip name auto-suggestion (ADR-0032): "{destination} ׳{YY}" — YY from the
// start date, or the current year while it's still empty.
import { getNow } from './useClock';

export function suggestTripName(destination: string, startDate: string): string {
  const dest = destination.trim();
  if (!dest) return '';
  const yy = startDate ? startDate.slice(2, 4) : String(new Date(getNow()).getFullYear()).slice(2);
  return `${dest} ׳${yy}`;
}
