// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../Toast';
import { NavProvider } from '../../state/nav-state';
import { SyncBadge } from '../feedback';
import { ListRow, RowManageSheet } from './ListRow';

// RowManageSheet builds on Sheet → Modal, which calls useOverlay (nav) + useToast.
function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

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
      wrap(
        <RowManageSheet
          ariaLabel="פעולות"
          onClose={() => {}}
          actions={[
            { label: 'ערוך', icon: '✏️', onSelect: onEdit },
            { label: 'מחק', icon: '🗑️', danger: true, onSelect: onDelete },
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

  it('opens from a ListRow kebab (row → manage sheet), listing the actions', () => {
    render(wrap(<RowSheetHarness onEdit={vi.fn()} />));
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
          ariaLabel="פעולות"
          onClose={() => setOpen(false)}
          actions={[{ label: 'ערוך', icon: '✏️', onSelect: onEdit }]}
        />
      )}
    </>
  );
}
