// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../../test/nav-harness';
import { ZoneChip } from './ZoneChip';
import { t } from '../../i18n/he';

describe('ZoneChip (ADR-0107 §6 — the resolved zone is stated and correctable)', () => {
  afterEach(() => cleanup());

  it('states the zone as a city label, not a raw IANA id', () => {
    const { container } = render(wrapNav(<ZoneChip value="Asia/Tokyo" onChange={() => {}} />));
    expect(container.querySelector('.zchip-zone')!.textContent).toMatch(/^Tokyo · GMT[+-]/);
  });

  it('a pick writes the chosen zone as the override', () => {
    const onChange = vi.fn();
    render(wrapNav(<ZoneChip value="Asia/Tokyo" onChange={onChange} />));
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
      target: { value: 'jerusalem' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Jerusalem/ }));
    expect(onChange).toHaveBeenCalledWith('Asia/Jerusalem');
  });

  it('offers the reset only while pinned, and it clears back to derived with null', () => {
    const onChange = vi.fn();
    const derived = render(wrapNav(<ZoneChip value="Asia/Tokyo" onChange={onChange} />));
    expect(derived.container.querySelector('.zchip-reset')).toBeNull();
    cleanup();

    render(wrapNav(<ZoneChip value="Asia/Jerusalem" pinned onChange={onChange} />));
    fireEvent.click(screen.getByRole('button', { name: t.eventForm.zoneReset }));
    // null, not the derived zone: the form doesn't get to freeze today's derivation.
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('is a read-only statement with no onChange (a zone that follows a place)', () => {
    const { container } = render(wrapNav(<ZoneChip value="Asia/Tokyo" />));
    expect(container.querySelector('.zchip-static')).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();
  });

  it('marks a pinned chip so a deliberate choice is visible', () => {
    const { container } = render(
      wrapNav(<ZoneChip value="Asia/Jerusalem" pinned onChange={() => {}} />),
    );
    expect(container.querySelector('.zchip-btn.pinned')).toBeTruthy();
  });
});
