import { APP_LOCALE } from '../constants';

// ponytail: amount is treated as whole currency units — correct for JPY (our
// only currency, no subunit). Minor-unit currencies (ILS/USD) will need /100
// when they appear.
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
