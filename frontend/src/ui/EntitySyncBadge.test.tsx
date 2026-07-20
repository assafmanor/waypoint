// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { t } from '../i18n/he';

// Drive the connected badge by faking the entity's sync status.
const h = vi.hoisted(() => ({
  status: { state: 'synced', reason: undefined } as {
    state: 'synced' | 'pending' | 'failed';
    reason?: string;
  },
}));
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return { ...actual, useSyncStatus: () => h.status };
});

import { EntitySyncBadge, useUnsynced } from './EntitySyncBadge';

describe('EntitySyncBadge', () => {
  afterEach(() => cleanup());

  it('is silent when synced — exception-only, everywhere (ADR-0091)', () => {
    h.status = { state: 'synced' };
    const { container } = render(<EntitySyncBadge id="x" />);
    expect(container.querySelector('.sync-badge')).toBeNull();
  });

  it('surfaces the pending / failed marker with its accessible name', () => {
    h.status = { state: 'pending' };
    render(<EntitySyncBadge id="x" />);
    expect(screen.getByRole('img', { name: t.sync.badge.pending })).toBeTruthy();
    cleanup();
    h.status = { state: 'failed', reason: 'BAD' };
    render(<EntitySyncBadge id="x" />);
    expect(screen.getByRole('img', { name: t.sync.badge.failed })).toBeTruthy();
  });

  it('showSynced forces the synced marker (escape hatch)', () => {
    h.status = { state: 'synced' };
    render(<EntitySyncBadge id="x" showSynced />);
    expect(screen.getByRole('img', { name: t.sync.badge.synced })).toBeTruthy();
  });
});

describe('useUnsynced (ADR-0092)', () => {
  afterEach(() => cleanup());

  // A probe component so the hook runs under React; renders the boolean it returns.
  function Probe() {
    return <span data-testid="u">{String(useUnsynced('x'))}</span>;
  }

  it('is true only while pending — synced and failed are not dimmed', () => {
    h.status = { state: 'pending' };
    expect(render(<Probe />).getByTestId('u').textContent).toBe('true');
    cleanup();
    h.status = { state: 'synced' };
    expect(render(<Probe />).getByTestId('u').textContent).toBe('false');
    cleanup();
    // failed stays prominent (full opacity) — its cloud-bang must not recede.
    h.status = { state: 'failed', reason: 'X' };
    expect(render(<Probe />).getByTestId('u').textContent).toBe('false');
  });
});
