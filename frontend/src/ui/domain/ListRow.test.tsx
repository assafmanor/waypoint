// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../../test/nav-harness';
import { SyncBadge } from '../feedback';
import { ListRow, RowManageSheet } from './ListRow';

// RowManageSheet builds on Sheet → Modal, which calls useOverlay (nav) + useToast.

describe('ListRow', () => {
  afterEach(() => cleanup());

  it('renders the open button (accessible name) + title/meta and fires onOpen', () => {
    const onOpen = vi.fn();
    render(
      <ListRow
        icon="✈️"
        onOpen={onOpen}
        openLabel="טוקיו"
        title={<span>טוקיו</span>}
        meta={<span>meta line</span>}
      />,
    );
    const open = screen.getByRole('button', { name: 'טוקיו' });
    expect(screen.getByText('meta line')).toBeTruthy();
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('omits the meta line when meta is not passed', () => {
    const { container } = render(
      <ListRow icon="📄" onOpen={() => {}} openLabel="doc" title="doc" />,
    );
    expect(container.querySelector('.wp-listrow-meta')).toBeNull();
  });

  it('applies the category badge tint (teal stay / amber transport)', () => {
    const { container } = render(
      <ListRow icon="🏨" badgeTone="stay" onOpen={() => {}} openLabel="hotel" title="hotel" />,
    );
    expect(container.querySelector('.wp-listrow-badge.stay')).toBeTruthy();
  });

  it('fades the row while unsynced (provisional), full-opacity otherwise (ADR-0092)', () => {
    const on = render(<ListRow icon="📄" onOpen={() => {}} openLabel="d" title="d" unsynced />);
    expect(on.container.querySelector('.wp-listrow.is-unsynced')).toBeTruthy();
    cleanup();
    const off = render(<ListRow icon="📄" onOpen={() => {}} openLabel="d" title="d" />);
    expect(off.container.querySelector('.wp-listrow.is-unsynced')).toBeNull();
  });

  it('renders a right slot (a per-row SyncBadge lives here — the Wave-2 wiring)', () => {
    render(
      <ListRow
        icon="📄"
        onOpen={() => {}}
        openLabel="doc"
        title="doc"
        right={<SyncBadge state="failed" />}
      />,
    );
    // SyncBadge is an accessible-named img; presence in the right slot proves the slot renders.
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('shows the kebab only with onManage, with its accessible name', () => {
    const { rerender } = render(
      <ListRow icon="📄" onOpen={() => {}} openLabel="doc" title="doc" />,
    );
    expect(screen.queryByLabelText('פעולות')).toBeNull();
    rerender(
      <ListRow
        icon="📄"
        onOpen={() => {}}
        openLabel="doc"
        title="doc"
        onManage={() => {}}
        manageLabel="פעולות"
      />,
    );
    expect(screen.getByRole('button', { name: 'פעולות' })).toBeTruthy();
  });

  it('disables the open button when disabled', () => {
    render(<ListRow icon="📄" onOpen={() => {}} openLabel="doc" title="doc" disabled />);
    expect((screen.getByRole('button', { name: 'doc' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('RowManageSheet', () => {
  afterEach(() => cleanup());

  it('renders action items and fires the selected action; danger action is marked', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      wrapNav(
        <RowManageSheet
          title="טברנה"
          onClose={() => {}}
          actions={[
            { label: 'ערוך', icon: 'edit', onSelect: onEdit },
            { label: 'מחק', icon: 'trash', danger: true, onSelect: onDelete },
          ]}
        />,
      ),
    );
    const del = screen.getByRole('button', { name: 'מחק' });
    expect(del.classList.contains('danger')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'ערוך' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(del);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  // ── ADR-0137. Three properties the redesign added, each of which the shipped
  // sheet got wrong in a way a screenshot showed and a prop list did not.

  it('names its subject, so the destructive verb is never anonymous', () => {
    render(
      wrapNav(
        <RowManageSheet
          title="טברנה"
          subject="מסעדה · לא משובצת במסלול"
          onClose={() => {}}
          actions={[{ label: 'מחק', icon: 'trash', danger: true, onSelect: vi.fn() }]}
        />,
      ),
    );
    // The dialog's accessible name comes from the title, so a screen reader
    // announces WHAT is being managed on open — the booking/document menus used
    // to pass only a generic "פעולות".
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBeNull();
    expect(screen.getByText('מסעדה · לא משובצת במסלול')).toBeTruthy();
  });

  it('partitions destructive actions into their own group, not just a red hue', () => {
    render(
      wrapNav(
        <RowManageSheet
          title="טברנה"
          onClose={() => {}}
          actions={[
            { label: 'ערוך', icon: 'edit', onSelect: vi.fn() },
            { label: 'העבר למדף', icon: 'shelf', onSelect: vi.fn() },
            { label: 'מחק', icon: 'trash', danger: true, onSelect: vi.fn() },
          ]}
        />,
      ),
    );
    const groups = document.querySelectorAll('.wp-row-actions');
    expect(groups.length).toBe(2);
    // Order is preserved within each group, and the danger group is last —
    // `מחק` cannot drift up under the thumb as the safe list grows or shrinks.
    expect(groups[0].querySelectorAll('.wp-row-action').length).toBe(2);
    const danger = groups[1];
    expect(danger.classList.contains('wp-row-actions-danger')).toBe(true);
    expect(danger.querySelectorAll('.wp-row-action.danger').length).toBe(1);
  });

  it('draws every action mark as an SVG, never an emoji (design-language)', () => {
    render(
      wrapNav(
        <RowManageSheet
          title="טברנה"
          onClose={() => {}}
          actions={[
            { label: 'ערוך', icon: 'edit', onSelect: vi.fn() },
            { label: 'מחק', icon: 'trash', danger: true, onSelect: vi.fn() },
          ]}
        />,
      ),
    );
    const marks = document.querySelectorAll('.wp-row-action-ic');
    expect(marks.length).toBe(2);
    for (const mark of marks) {
      expect(mark.querySelector('svg')).not.toBeNull();
      expect(mark.textContent).toBe('');
    }
  });

  it('opens from a ListRow kebab (row → manage sheet), listing the actions', () => {
    render(wrapNav(<RowSheetHarness onEdit={vi.fn()} />));
    fireEvent.click(screen.getByRole('button', { name: 'פעולות' }));
    expect(screen.getByRole('button', { name: 'ערוך' })).toBeTruthy();
  });
});

// A tiny stateful harness wiring ListRow's kebab to a RowManageSheet, as a
// screen would.
function RowSheetHarness({ onEdit }: { onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        icon="📄"
        onOpen={() => {}}
        openLabel="doc"
        title="doc"
        onManage={() => setOpen(true)}
        manageLabel="פעולות"
      />
      {open && (
        <RowManageSheet
          title="doc"
          onClose={() => setOpen(false)}
          actions={[{ label: 'ערוך', icon: 'edit', onSelect: onEdit }]}
        />
      )}
    </>
  );
}
