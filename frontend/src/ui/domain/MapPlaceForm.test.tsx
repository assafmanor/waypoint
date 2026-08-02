// @vitest-environment jsdom
//
// The one form all four of ADR-0147's sources open. What is worth pinning here is not the
// markup — it is the two RULES that the four sources exist to share, and both of them are
// properties rather than values:
//
//   1. **A category drives the icon until a human says otherwise**, for every one of the nine
//      categories — and once a human has spoken, for NO category.
//   2. **A derived glyph is never reported as a choice.** `iconTouched` is what the host writes
//      `Place.icon` from, so getting it wrong would freeze a place's icon at whatever its
//      category happened to say that day and shadow the category from then on — the same defect
//      `chosenIcon` exists to undo one rung down.
//
// A value test on one category would pass with the derivation wired to the wrong glyph, and a
// value test on one flow would pass with `initiallyTouched` inverted — which is exactly the
// class of miss this epic has been corrected on.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EVENT_CATEGORY, iconForCategory, type EventCategory } from '@waypoint/shared';
import { wrapNav } from '../../test/nav-harness';
import { t } from '../../i18n/he';
import { DEFAULT_PLACE_ICON } from '../../constants';
import { MapPlaceForm, type MapPlaceFormSpec, type MapPlaceFormValue } from './MapPlaceForm';

afterEach(cleanup);

const CATEGORIES = Object.values(EVENT_CATEGORY);

const spec = (over: Partial<MapPlaceFormSpec> = {}): MapPlaceFormSpec => ({
  title: t.map.make.dropTitle,
  name: '',
  note: '35.7148, 139.7967',
  confirmLabel: t.map.make.add,
  ...over,
});

function mount(over: Partial<MapPlaceFormSpec> = {}) {
  const onConfirm = vi.fn<(v: MapPlaceFormValue) => void>();
  const onCancel = vi.fn();
  render(wrapNav(<MapPlaceForm spec={spec(over)} onConfirm={onConfirm} onCancel={onCancel} />));
  return { onConfirm, onCancel };
}

const nameField = () => screen.getByLabelText(spec().title) as HTMLInputElement;
const iconChip = () => screen.getByRole('button', { name: t.map.make.iconLabel });
const pill = (category: EventCategory) =>
  within(screen.getByRole('radiogroup', { name: t.map.make.categoryLabel })).getByRole('radio', {
    name: t.iconPicker.categories[category],
  });
const confirmBtn = (label: string = t.map.make.add) =>
  screen.getByRole('button', { name: label }) as HTMLButtonElement;

describe('MapPlaceForm — the nine categories', () => {
  // From the ONE options list `EventForm` and the shelf's add already read, so `other` is last
  // because the enum puts it there. A form that hand-listed five and invented a label is the
  // first pass this replaced.
  it('offers all nine, with the real labels, and `כללי` last', () => {
    mount();
    const pills = within(
      screen.getByRole('radiogroup', { name: t.map.make.categoryLabel }),
    ).getAllByRole('radio');
    expect(pills).toHaveLength(CATEGORIES.length);
    expect(pills.map((p) => p.textContent?.replace(/[^֐-׿ ]/g, '').trim())).toEqual(
      CATEGORIES.map((c) => t.iconPicker.categories[c]),
    );
    expect(pills.at(-1)!.textContent).toContain(t.iconPicker.categories[EVENT_CATEGORY.OTHER]);
  });

  it('opens on no category when nothing categorises the place', () => {
    mount();
    for (const category of CATEGORIES) {
      expect(pill(category).getAttribute('aria-checked')).toBe('false');
    }
  });

  it('opens on the category the place already has', () => {
    mount({ category: EVENT_CATEGORY.FOOD });
    expect(pill(EVENT_CATEGORY.FOOD).getAttribute('aria-checked')).toBe('true');
  });
});

describe('MapPlaceForm — a category drives the icon until a human says otherwise', () => {
  // EXHAUSTIVE over the enum, because that is the rule: not "food gives 🍽️" but "every
  // category gives its own default". A tenth category wired to nothing fails here.
  it('every category tap moves the glyph to that category’s default', () => {
    for (const category of CATEGORIES) {
      cleanup();
      const { onConfirm } = mount();
      fireEvent.change(nameField(), { target: { value: 'x' } });
      fireEvent.click(pill(category));
      expect(iconChip().textContent).toBe(iconForCategory(category));
      fireEvent.click(confirmBtn());
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ icon: iconForCategory(category), category }),
      );
    }
  });

  // **THE LOAD-BEARING CASE** (`useDerivedField`'s own words): a place that already carries a
  // glyph counts as chosen, so reopening the form and tapping a category must NOT stomp it.
  // Exhaustive again — a guard that leaks on one category leaks on all of them, but a
  // single-category test would only see it if it picked the leaking one.
  it('a glyph the place already carries survives every category tap', () => {
    const { onConfirm } = mount({ icon: '🍜', name: 'רמן נאגי', confirmLabel: t.map.make.save });
    for (const category of CATEGORIES) {
      fireEvent.click(pill(category));
      expect(iconChip().textContent).toBe('🍜');
    }
    fireEvent.click(confirmBtn(t.map.make.save));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ icon: '🍜' }));
  });

  // The other half of the same rule, from the other direction: a glyph a human picked HERE is
  // no less chosen than one loaded from the row.
  it('a glyph picked in this form survives every later category tap', () => {
    mount();
    fireEvent.click(iconChip());
    fireEvent.click(screen.getByRole('button', { name: '⛩️', hidden: true }));
    expect(iconChip().textContent).toBe('⛩️');
    for (const category of CATEGORIES) {
      fireEvent.click(pill(category));
      expect(iconChip().textContent).toBe('⛩️');
    }
  });
});

describe('MapPlaceForm — a derived glyph is not a choice', () => {
  it('reports `iconTouched: false` when nobody touched the picker', () => {
    const { onConfirm } = mount();
    fireEvent.change(nameField(), { target: { value: 'הספסל עם הנוף' } });
    fireEvent.click(pill(EVENT_CATEGORY.NATURE));
    fireEvent.click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledWith({
      name: 'הספסל עם הנוף',
      icon: iconForCategory(EVENT_CATEGORY.NATURE),
      iconTouched: false,
      category: EVENT_CATEGORY.NATURE,
      notes: [],
    });
  });

  it('reports `iconTouched: true` for a pick, and for a glyph the place already had', () => {
    const picked = mount();
    fireEvent.change(nameField(), { target: { value: 'x' } });
    fireEvent.click(iconChip());
    fireEvent.click(screen.getByRole('button', { name: '⛩️', hidden: true }));
    fireEvent.click(confirmBtn());
    expect(picked.onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ icon: '⛩️', iconTouched: true }),
    );

    cleanup();
    const existing = mount({ icon: '🍜', name: 'n', confirmLabel: t.map.make.save });
    fireEvent.click(confirmBtn(t.map.make.save));
    expect(existing.onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ icon: '🍜', iconTouched: true }),
    );
  });

  it('starts from the place’s own resolution, so the chip shows what its pin shows', () => {
    mount();
    expect(iconChip().textContent).toBe(DEFAULT_PLACE_ICON);
    cleanup();
    mount({ category: EVENT_CATEGORY.LODGING });
    expect(iconChip().textContent).toBe(iconForCategory(EVENT_CATEGORY.LODGING));
    cleanup();
    mount({ icon: '☕', category: EVENT_CATEGORY.LODGING });
    expect(iconChip().textContent).toBe('☕');
  });
});

describe('MapPlaceForm — what may be submitted', () => {
  // A name is required everywhere EXCEPT a tapped sight, whose confirm buys Google's label.
  // Anywhere else an empty submit would write a nameless place. **How** that is prevented
  // changed in ADR-0150 — the confirm is pressable and REFUSES, where it used to be a dead
  // button — but what may reach `onConfirm` is exactly what it always was.
  it('refuses an empty name instead of confirming, and trims what it reports', () => {
    const { onConfirm } = mount();
    fireEvent.click(confirmBtn());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(t.map.make.nameRequired);

    fireEvent.change(nameField(), { target: { value: '   ' } });
    fireEvent.click(confirmBtn());
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(nameField(), { target: { value: '  הספסל  ' } });
    fireEvent.click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: 'הספסל' }));
  });

  // Every remaining source either types a name or arrives with one, so there is no escape from
  // this and there should not be: an empty submit would write a nameless place. The one source
  // that had an escape — a tapped sight, whose confirm bought Google's label — was removed
  // (ADR-0148 §6), and `nameOptional` went with it rather than being left for nobody.
  //
  // Enter is the reason this is a refusal rather than a disabled button (ADR-0150): the field
  // binds it, so it ran `confirm` into a silent `return` and the card answered nothing at all.
  it('answers the Enter key instead of swallowing it, and still submits nothing', () => {
    const { onConfirm } = mount({ note: 'Kabukicho' });
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(t.map.make.nameRequired);
    expect(screen.getByText('Kabukicho')).toBeTruthy();
  });

  // …and it is retired by the one thing that answers it, so the card is not left shouting at
  // someone already typing.
  it('retires the refusal as soon as the name is typed', () => {
    mount();
    fireEvent.click(confirmBtn());
    fireEvent.input(nameField(), { target: { value: 'ה' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not confirm while a write is in flight', () => {
    const onConfirm = vi.fn();
    render(
      wrapNav(
        <MapPlaceForm spec={spec({ name: 'x' })} busy onConfirm={onConfirm} onCancel={vi.fn()} />,
      ),
    );
    expect(confirmBtn().disabled).toBe(true);
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Enter confirms, so the name can be typed and committed without leaving the keyboard', () => {
    const { onConfirm } = mount();
    fireEvent.change(nameField(), { target: { value: 'הספסל' } });
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: 'הספסל' }));
  });
});

describe('MapPlaceForm — the card’s chrome', () => {
  // The heading IS the field's label, which is the reason there is no second caption above the
  // input: a placeholder disappears the moment you type, which is when the question is still
  // being asked. `getByLabelText` passing at all is the assertion.
  it('the title labels the name field', () => {
    mount({ title: t.map.make.renameTitle });
    expect(screen.getByLabelText(t.map.make.renameTitle).tagName).toBe('INPUT');
  });

  // **THE NAME FIELD NEVER FORCES A DIRECTION** (ADR-0118), and the first build of this form
  // got it wrong in the one state a value test would have missed: it carried `dir="auto"`, which
  // on an INPUT sniffs the VALUE — so an EMPTY field has no strong character to sniff, falls
  // back to LTR, and left-anchors the Hebrew placeholder. Reported on the render.
  //
  // Pinned across all three states, because "it looks right with a Hebrew name in it" is
  // exactly what was true while the empty state was broken. Inheriting the page's RTL is also
  // what every other text field in this app does — there is no second idiom here.
  it('never forces a direction on the name, in any of its three states', () => {
    for (const name of ['', 'רמן נאגי', 'Ichiran Ramen']) {
      cleanup();
      mount({ name, confirmLabel: t.map.make.add });
      const field = nameField();
      expect(field.getAttribute('dir'), `dir forced with name "${name}"`).toBeNull();
      expect(field.style.direction).toBe('');
    }
  });

  // **AND IT DOES NOT TAKE THE FOCUS** (owner, on a phone: _"it starts by opening the keyboard
  // and immediately closing"_). The gesture that opens this form ends with a finger lifting off
  // the canvas, so a field focused during the press loses focus to the release — the keyboard
  // arrived and left in one motion. It is also the wrong default while the card is landing, the
  // camera is moving and the sheet is standing down. Asserted for all three sources, since an
  // `autoFocus` is one word and would come back on any one of them.
  it('does not take the focus, so no keyboard opens with the card', () => {
    for (const title of [t.map.make.dropTitle, t.map.make.resultTitle, t.map.make.renameTitle]) {
      cleanup();
      mount({ title });
      expect(document.activeElement, `${title} stole the focus`).toBe(document.body);
    }
  });

  it('shows the failure through the field’s own error slot, announced', () => {
    render(
      wrapNav(
        <MapPlaceForm
          spec={spec()}
          error={t.map.make.failed}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole('alert').textContent).toBe(t.map.make.failed);
  });

  // Only where there is something to vet before spending (ADR-0115 §2) — a dropped pin needs
  // none, because you chose the spot.
  it('offers the free vet link only when one is supplied', () => {
    mount();
    expect(screen.queryByRole('link', { name: t.map.research.openInGoogle })).toBeNull();
    cleanup();
    mount({ vetUrl: 'https://example.test/x' });
    expect(
      screen.getByRole('link', { name: t.map.research.openInGoogle }).getAttribute('href'),
    ).toBe('https://example.test/x');
  });

  it('cancels through the screen’s own neutral button', () => {
    const { onCancel } = mount();
    const cancel = screen.getByRole('button', { name: t.map.make.cancel });
    expect(cancel.className).toContain('map-gbtn');
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalled();
  });

  // The host draws the marker under this form in the CATEGORY's hue, so it has to be told —
  // and told the value in FORCE, not a `useState` React has not flushed.
  it('reports the value in force on every change the canvas can draw', () => {
    const onValueChange = vi.fn<(v: MapPlaceFormValue) => void>();
    render(
      wrapNav(
        <MapPlaceForm
          spec={spec()}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          onValueChange={onValueChange}
        />,
      ),
    );
    fireEvent.click(pill(EVENT_CATEGORY.FOOD));
    expect(onValueChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category: EVENT_CATEGORY.FOOD,
        icon: iconForCategory(EVENT_CATEGORY.FOOD),
        iconTouched: false,
      }),
    );
    fireEvent.click(iconChip());
    fireEvent.click(screen.getByRole('button', { name: '☕', hidden: true }));
    expect(onValueChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ icon: '☕', iconTouched: true }),
    );
    // …and a later category tap reports the glyph STILL in force, not the one it would have
    // derived — which is `redrive`'s return value doing the job it exists for.
    fireEvent.click(pill(EVENT_CATEGORY.TRANSPORT));
    expect(onValueChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ icon: '☕', category: EVENT_CATEGORY.TRANSPORT }),
    );
  });
});
