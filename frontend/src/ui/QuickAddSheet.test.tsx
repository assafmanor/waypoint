// @vitest-environment jsdom
// **The quick add** (ADR-0231 §3): a title, `TimePicker`'s when-sentence prefilled at the slot it
// was opened on, one primary that needs a title, and `עוד פרטים…` carrying the draft out.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../test/nav-harness';
import { QuickAddSheet } from './QuickAddSheet';
import { t } from '../i18n/he';

const defaults = { date: '2026-09-16', start: '13:55', end: '14:55' };

describe('QuickAddSheet', () => {
  afterEach(() => cleanup());

  const open = (props: Partial<Parameters<typeof QuickAddSheet>[0]> = {}) =>
    render(
      wrapNav(
        <QuickAddSheet
          defaults={defaults}
          onAdd={() => {}}
          onMore={() => {}}
          onClose={() => {}}
          {...props}
        />,
      ),
    );

  it('opens on the slot it was handed, as the app’s own start + duration sentence', () => {
    open();
    expect(screen.getByText(t.day.quickAdd.title)).toBeTruthy();
    // `TimePicker`'s two tokens: the start, and the length the block comes to.
    expect(screen.getByText('13:55')).toBeTruthy();
    expect(screen.getByText(t.eventForm.durHour)).toBeTruthy();
  });

  it('the primary needs a title, then hands back the draft', () => {
    const onAdd = vi.fn();
    open({ onAdd });
    const add = screen.getByRole('button', { name: new RegExp(t.day.quickAdd.add) });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(t.day.quickAdd.titlePlaceholder), {
      target: { value: ' קפה שמצאנו ' },
    });
    expect((add as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledWith({ title: 'קפה שמצאנו', start: '13:55', end: '14:55' });
  });

  it('עוד פרטים… carries whatever was typed, title or none', () => {
    const onMore = vi.fn();
    open({ onMore });
    fireEvent.click(screen.getByRole('button', { name: t.day.quickAdd.more }));
    expect(onMore).toHaveBeenCalledWith({ title: '', start: '13:55', end: '14:55' });
  });
});
