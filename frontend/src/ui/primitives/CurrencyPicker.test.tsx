// @vitest-environment jsdom
//
// **The list must not depend on the engine's list being complete.**
//
// ADR-0180 §6 said "ask the runtime, never ship a curated list", and the code
// went one step further and called the answer *complete*. A real phone proved it
// is not: `Intl.supportedValuesOf('currency')` came back without `ISK`, so an
// Iceland trip could not pick the Icelandic króna at all — not by code, not by
// `איסלנד`, not by anything, because the row did not exist to be matched.
//
// The tell in the report is the one asserted below: searching `כתר` returned the
// Danish, Norwegian and Swedish krónur and NOT the Icelandic one. A search bug
// cannot do that — those four share the word. Only an absent row can.
//
// This file therefore stubs a TRIMMED runtime rather than trusting the one the
// test happens to run on. Node ships full ICU and answers `ISK` happily, which is
// precisely why every check made off the device passed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { COUNTRY_CURRENCY } from '@waypoint/shared';

/** The device's list, as reported: everything the real one has, minus ISK. */
const TRIMMED = Intl.supportedValuesOf('currency').filter((c) => c !== 'ISK');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function openPicker(list: string[], opts: { noNameData?: boolean | 'all' } = {}) {
  vi.resetModules();
  vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(list as never);
  if (opts.noNameData) {
    // An engine with no data for ISK: `NumberFormat` still accepts the code (it
    // is well-formed) and simply renders it back, which is what erases the
    // Hebrew and English names the search would otherwise lean on.
    const real = Intl.NumberFormat;
    vi.spyOn(Intl, 'NumberFormat').mockImplementation(((
      locale?: string,
      o?: Intl.NumberFormatOptions,
    ) =>
      o?.currency === 'ISK'
        ? new real(locale, { ...o, currency: 'XXX' })
        : new real(locale, o)) as never);
  }
  // BOTH imported after the reset: `wrapNav` pulls in `nav-state`, and a statically
  // imported harness would hand the component a DIFFERENT module instance of the
  // context it reads — which fails as "useNav must be used within <NavProvider>"
  // even though the provider is right there.
  const { CurrencyPicker } = await import('./CurrencyPicker');
  const { wrapNav } = await import('../../test/nav-harness');
  render(wrapNav(<CurrencyPicker onChange={vi.fn()} onClose={vi.fn()} />));
  // `Modal` portals to <body>, so the render container holds nothing.
  const search = document.querySelector<HTMLInputElement>('.cp-search')!;
  return {
    type: (q: string) => fireEvent.change(search, { target: { value: q } }),
    codes: () =>
      Array.from(document.querySelectorAll('.cp-secondary')).map((n) => n.textContent ?? ''),
  };
}

describe('the reported bug: a currency the engine omits', () => {
  it('offers ISK even when the runtime does not list it', async () => {
    const picker = await openPicker(TRIMMED);
    picker.type('ISK');
    expect(picker.codes()).toContain('ISK');
  });

  it('returns the Icelandic króna beside the other three for כתר', async () => {
    // The exact query from the report, and the exact evidence: three krónur came
    // back and the fourth did not.
    const picker = await openPicker(TRIMMED);
    picker.type('כתר');
    const codes = picker.codes();
    for (const krona of ['DKK', 'NOK', 'SEK', 'ISK']) expect(codes).toContain(krona);
  });

  it('keeps it in the כתר family even with NO ICU data for it at all', async () => {
    // The harsher case. Trimming `supportedValuesOf` alone still leaves CLDR able
    // to say `כתר איסלנדי`; an engine that lacks the currency entirely renders its
    // name as the bare code, and then the snapshot is the only thing left.
    const picker = await openPicker(TRIMMED, { noNameData: true });
    picker.type('כתר');
    expect(picker.codes()).toContain('ISK');
    picker.type('קרונה');
    expect(picker.codes()).toContain('ISK');
  });

  it('is fixed GENERALLY, not for ISK — every currency keeps its name', async () => {
    // The point of the snapshot, and the reason the ISK-shaped patch came back
    // out: the bug is not this currency, it is ANY currency an engine trims. With
    // no CLDR names at all, a Hebrew name still finds each of these, and none of
    // them has an alias entry doing the work.
    const picker = await openPicker([], { noNameData: 'all' });
    for (const [query, code] of [
      ['בהט', 'THB'],
      ['דונג', 'VND'],
      ['רינגיט', 'MYR'],
      ['לארי', 'GEL'],
      ['קצאל', 'GTQ'],
      ['Icelandic', 'ISK'],
      ['forint', 'HUF'],
    ] as const) {
      picker.type(query);
      expect(picker.codes(), `"${query}" should find ${code}`).toContain(code);
    }
  });

  it('reaches it by country too, which is how a traveller would look', async () => {
    const picker = await openPicker(TRIMMED);
    picker.type('איסלנד');
    expect(picker.codes()).toContain('ISK');
  });
});

describe('the floor the union guarantees', () => {
  it('offers every currency the app’s own destinations need', async () => {
    // The guarantee in one line: if a trip can go there, its currency is
    // pickable — whatever the engine happens to ship.
    const picker = await openPicker([]);
    const offered = new Set(picker.codes());
    for (const currency of Object.values(COUNTRY_CURRENCY)) {
      expect(offered.has(currency), `${currency} is not offered`).toBe(true);
    }
  });

  it('still takes the runtime’s breadth when it has some', async () => {
    // The union, not a replacement: KPW is in no destination of ours and must
    // still be offered when the engine knows it.
    const picker = await openPicker(TRIMMED);
    picker.type('KPW');
    expect(picker.codes()).toContain('KPW');
  });

  it('renders an engine-unknown code without blanking the row', async () => {
    // No CLDR name and no symbol: the row must still say something, and the
    // trigger label must not print the code twice.
    const picker = await openPicker([]);
    picker.type('ISK');
    expect(screen.getByText('ISK')).toBeTruthy();
  });
});
