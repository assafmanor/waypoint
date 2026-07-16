import { describe, expect, it } from 'vitest';
import { deleteFlags, mergeBookingDetails } from './booking-edit';

describe('mergeBookingDetails', () => {
  it('writes room/notes/wifi and preserves unrelated detail keys', () => {
    const next = mergeBookingDetails(
      { seatMap: 'x' },
      { room: '512', notes: 'high floor', wifiNetwork: 'Net', wifiPassword: 'pw' },
    );
    expect(next).toEqual({
      seatMap: 'x',
      room: '512',
      notes: 'high floor',
      wifi: { network: 'Net', password: 'pw' },
    });
  });

  it('prunes emptied fields (whitespace counts as empty)', () => {
    const next = mergeBookingDetails(
      { room: '512', notes: 'old', wifi: { network: 'Net' } },
      { room: '  ', notes: '', wifiNetwork: '', wifiPassword: '' },
    );
    expect(next).toBeUndefined();
  });

  it('keeps a partial wifi (network only)', () => {
    expect(mergeBookingDetails(undefined, { wifiNetwork: 'Net' })).toEqual({
      wifi: { network: 'Net', password: undefined },
    });
  });
});

describe('deleteFlags', () => {
  it('delete-both deletes the event with confirm', () => {
    expect(deleteFlags('both')).toEqual({ deleteEvents: true, confirm: true });
  });
  it('unlink keeps the event but still confirms (a hard event is guarded on unlink too)', () => {
    expect(deleteFlags('unlink')).toEqual({ deleteEvents: false, confirm: true });
  });
});
