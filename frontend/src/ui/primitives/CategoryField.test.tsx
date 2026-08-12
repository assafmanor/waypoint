// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EVENT_CATEGORY } from '@waypoint/shared';
import { CategoryField } from './CategoryField';
import { EVENT_CATEGORY_OPTIONS } from '../../lib/category-options';
import { t } from '../../i18n/he';

const pills = () => screen.getByRole('radiogroup', { name: t.eventForm.categoryLabel });

describe('CategoryField', () => {
  afterEach(() => cleanup());

  it('offers the nine categories led by a way back to none', () => {
    render(<CategoryField onChange={() => {}} />);
    const radios = within(pills()).getAllByRole('radio');
    expect(radios).toHaveLength(EVENT_CATEGORY_OPTIONS.length + 1);
    // The leading one is selected while nothing is chosen — the state is stated, not implied
    // by an absence of highlight.
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(within(radios[0]).getByText(t.eventForm.categoryNone)).toBeTruthy();
  });

  // **The half of the report that has nothing to do with hosts**: `ChoiceGrid`'s `onChange`
  // only ever SETS, so before the leading pill there was no route back to `undefined` at all.
  it('hands back undefined when the leading pill is picked', () => {
    const onChange = vi.fn();
    render(<CategoryField value={EVENT_CATEGORY.FOOD} onChange={onChange} />);
    fireEvent.click(within(pills()).getAllByRole('radio')[0]);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('hands back the category when a real pill is picked', () => {
    const onChange = vi.fn();
    render(<CategoryField onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: t.iconPicker.categories.lodging }));
    expect(onChange).toHaveBeenCalledWith(EVENT_CATEGORY.LODGING);
  });

  // On the Map the category IS the pin's hue, so "no category" is not a state worth offering a
  // route back to — `MapPlaceForm`'s own comment calls it wrong information rather than absent.
  it('omits the leading pill where clearing is not offered', () => {
    render(
      <CategoryField onChange={() => {}} clearable={false} ariaLabel={t.eventForm.categoryLabel} />,
    );
    expect(within(pills()).getAllByRole('radio')).toHaveLength(EVENT_CATEGORY_OPTIONS.length);
  });

  it('drops the field shell for a host that names the row itself', () => {
    render(<CategoryField onChange={() => {}} label={null} ariaLabel="קטגוריה של המקום" />);
    expect(screen.queryByText(t.eventForm.categoryLabel)).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'קטגוריה של המקום' })).toBeTruthy();
  });

  describe('collapsed (disclosure)', () => {
    it('states the inherited value and where it came from, asking nothing', () => {
      render(
        <CategoryField
          disclosure
          onChange={() => {}}
          fallback={{ category: EVENT_CATEGORY.LODGING, glyph: '🏨', from: 'לפי ההזמנה' }}
        />,
      );
      const row = screen.getByRole('button', { name: t.eventForm.categoryLabel });
      expect(within(row).getByText(t.iconPicker.categories.lodging)).toBeTruthy();
      expect(within(row).getByText('לפי ההזמנה')).toBeTruthy();
      expect(row.getAttribute('aria-expanded')).toBe('false');
    });

    it('drops the source once a human has chosen, since nothing derived it any more', () => {
      render(
        <CategoryField
          disclosure
          value={EVENT_CATEGORY.FOOD}
          onChange={() => {}}
          fallback={{ category: EVENT_CATEGORY.LODGING, glyph: '🏨', from: 'לפי ההזמנה' }}
        />,
      );
      const row = screen.getByRole('button', { name: t.eventForm.categoryLabel });
      expect(within(row).getByText(t.iconPicker.categories.food)).toBeTruthy();
      // Scoped to the ROW: the leading pill inside the chooser still reads `לפי ההזמנה`,
      // because that is what picking it would mean — it is the way BACK to inheritance.
      expect(within(row).queryByText('לפי ההזמנה')).toBeNull();
    });

    it('reads ללא when nothing is chosen and nothing is inherited', () => {
      render(<CategoryField disclosure onChange={() => {}} />);
      const row = screen.getByRole('button', { name: t.eventForm.categoryLabel });
      expect(within(row).getByText(t.eventForm.categoryNone)).toBeTruthy();
    });

    it('keeps its caption, so a bare glyph never has to say which question it answers', () => {
      render(<CategoryField disclosure onChange={() => {}} />);
      expect(screen.getByText(t.eventForm.categoryLabel)).toBeTruthy();
    });

    it('opens the pills in place on a tap, and they are out of reach until then', () => {
      render(<CategoryField disclosure onChange={() => {}} />);
      expect(pills().closest('[inert]')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: t.eventForm.categoryLabel }));
      expect(pills().closest('[inert]')).toBeNull();
    });
  });
});
