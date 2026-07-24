// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../Toast';
import { NavProvider } from '../../state/nav-state';
import { ZonePicker, zoneCity, zoneOffset, zoneLabel } from './ZonePicker';
import { t } from '../../i18n/he';

Element.prototype.scrollIntoView = vi.fn();

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('zone label helpers', () => {
  it('zoneCity reads the last path segment, underscores → spaces', () => {
    expect(zoneCity('America/New_York')).toBe('New York');
    expect(zoneCity('Asia/Tokyo')).toBe('Tokyo');
    expect(zoneCity('UTC')).toBe('UTC');
  });

  it('zoneOffset returns a GMT-offset string, and zoneLabel joins city · offset', () => {
    // The exact offset is DST/host-dependent, but it's always a GMT± string.
    expect(zoneOffset('Asia/Tokyo')).toMatch(/^GMT[+-]/);
    expect(zoneLabel('Asia/Tokyo')).toMatch(/^Tokyo · GMT[+-]/);
  });
});

describe('ZonePicker', () => {
  afterEach(() => cleanup());

  it('surfaces suggested zones (+ the current value) first under the suggested group', () => {
    render(
      wrap(
        <ZonePicker
          value="Asia/Jerusalem"
          suggested={['Europe/London']}
          onChange={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByText(t.zonePicker.suggested)).toBeTruthy();
    // Both the current value and the suggestion render as rows.
    expect(screen.getByRole('button', { name: /Jerusalem/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /London/ })).toBeTruthy();
  });

  it('searches the full IANA set by city / zone / offset', () => {
    render(wrap(<ZonePicker onChange={() => {}} onClose={() => {}} />));
    fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
      target: { value: 'tokyo' },
    });
    expect(screen.getByRole('button', { name: /Asia\/Tokyo/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /New York/ })).toBeNull();
  });

  it('fires onChange with the picked zone', () => {
    const onChange = vi.fn();
    render(wrap(<ZonePicker value="UTC" onChange={onChange} onClose={() => {}} />));
    fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
      target: { value: 'jerusalem' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Jerusalem/ }));
    expect(onChange).toHaveBeenCalledWith('Asia/Jerusalem');
  });

  it('shows the no-results empty state for an unmatched query', () => {
    render(wrap(<ZonePicker onChange={() => {}} onClose={() => {}} />));
    fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
      target: { value: 'zzzznotazone' },
    });
    expect(screen.getByText(t.zonePicker.noResults)).toBeTruthy();
  });
});
