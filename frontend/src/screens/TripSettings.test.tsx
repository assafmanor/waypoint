// @vitest-environment jsdom
//
// The details form's SAVE, and only that (ADR-0150 §8). It was the one dead primary in the
// app: `disabled` on a `canSave` covering four fields, with no note beside it — so a trip
// whose destination had been cleared offered a button that did not respond and said nothing
// about why. What is pinned here is that it is pressable and answers, and that pressing it
// still writes nothing while a field is missing.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

Element.prototype.scrollIntoView = vi.fn();

const updateSettings = vi.fn();

const TRIP = {
  id: 't1',
  name: 'טוקיו',
  destination: 'Tokyo',
  startDate: '2026-07-19',
  endDate: '2026-07-25',
  timezone: 'Asia/Tokyo',
  icon: '🗼',
  currency: 'JPY',
  createdBy: 'u1',
  updatedBy: 'u1',
};

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: TRIP,
    members: [{ id: 'm1', tripId: 't1', userId: 'u1', role: 'admin' }],
    users: [{ id: 'u1', displayName: 'אסף', avatarHue: 'denim', avatarChoice: 'initials' }],
    places: [],
    settings: { updateTrip: updateSettings },
    tripDeleted: false,
  }),
}));
vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me: { user: { id: 'u1' } } }) }));
vi.mock('../lib/outbox', () => ({ useIsOffline: () => false, useOutboxCount: () => 0 }));
vi.mock('../lib/api', () => ({
  allowMemberBack: vi.fn(),
  createInvite: vi.fn(),
  fetchRemovedMembers: vi.fn().mockResolvedValue([]),
  rotateInvite: vi.fn(),
}));

const { TripSettings } = await import('./TripSettings');
const { t } = await import('../i18n/he');
// `IconPicker` registers a back layer, so the form cannot be rendered bare (frontend/CLAUDE.md).
const { wrapNav } = await import('../test/nav-harness');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Open the details form — it is read-only until `עריכה`. */
function openEditor() {
  render(wrapNav(<TripSettings />));
  fireEvent.click(screen.getByText(t.settings.edit));
}

const nameInput = () => screen.getByDisplayValue('טוקיו') as HTMLInputElement;
const saveBtn = () => screen.getByText(t.settings.save) as HTMLButtonElement;

describe('TripSettings — the details form refuses at the field', () => {
  it('has a pressable save, and refuses the empty name at the name', () => {
    openEditor();
    fireEvent.change(nameInput(), { target: { value: '' } });
    expect(saveBtn().disabled).toBe(false);

    fireEvent.click(saveBtn());
    expect(updateSettings).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(t.settings.nameRequired);
    expect(alert.closest('.set-fld')?.hasAttribute('data-invalid')).toBe(true);
  });

  it('refuses a backwards range at the dates, and saves once it is fixed', async () => {
    openEditor();
    const [, to] = screen.getAllByDisplayValue(/2026-07-/) as HTMLInputElement[];
    fireEvent.change(to, { target: { value: '2026-07-01' } });
    fireEvent.click(saveBtn());
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(t.shell.newTrip.dateError);

    fireEvent.change(to, { target: { value: '2026-07-26' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    expect(updateSettings.mock.calls[0][0]).toMatchObject({ endDate: '2026-07-26' });
  });
});

// **The read rows hold stored content, so each says which way it reads** (ADR-0118). The
// `mono` branch forced `dir="ltr"` through a ternary the lint guard read past — the same
// mistake as `BookingDetail`'s fact row, in the app's other copy of that shape — which set a
// base direction for the whole value instead of isolating the run inside it. `auto` keeps the
// zone and the budget LTR and stops a Hebrew name or a numeral-led destination reversing.
describe('TripSettings — a read row never inherits the screen direction', () => {
  it('lets every value say which way it reads, mono included', () => {
    render(wrapNav(<TripSettings />));
    const values = [...document.querySelectorAll('.set-row .fv')];
    expect(values.length).toBeGreaterThan(3);
    for (const v of values) expect(v.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('.set-row .fv.mono')?.textContent).toBe('Asia/Tokyo');
  });
});
