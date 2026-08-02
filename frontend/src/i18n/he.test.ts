// Copy is usually asserted where it renders — a string constant needs no test. This file is
// for the copy that is a **derivation**: a sentence assembled from data, where the thing that
// can be wrong is not the words but the grammar between them.
import { describe, expect, it } from 'vitest';
import { t } from './he';

// **What a place's delete leaves without a location** (ADR-0157 §8). It shipped counting
// `פריטים`, gender-free — correct, unactionable, and hiding the one fact worth knowing: the
// owner deleted a place they had just added and was warned about "one item", where the item
// was the shelf idea the add itself had created. Naming the rows costs Hebrew agreement,
// which is most of what these assert.
describe('the place delete names what loses its location', () => {
  const event = (label?: string) => ({ kind: 'event' as const, label });
  const booking = (label?: string) => ({ kind: 'booking' as const, label });
  const idea = (label?: string) => ({ kind: 'idea' as const, label });

  it('names a single row, and agrees with its gender', () => {
    expect(t.map.del.refs([event('ארוחת ערב')])).toBe('האירוע "ארוחת ערב" יישאר בלי מיקום');
    // הזמנה is feminine and takes תישאר; the reason this is a table rather than a template.
    expect(t.map.del.refs([booking('ריוקאן')])).toBe('ההזמנה "ריוקאן" תישאר בלי מיקום');
    expect(t.map.del.refs([idea('קפה')])).toBe('הרעיון "קפה" יישאר בלי מיקום');
  });

  // A mixed pair takes the masculine plural, which is what Hebrew does — and `ו` is a
  // prefix, so it joins the last subject without a space.
  it('names two, under one verb', () => {
    expect(t.map.del.refs([event('ארוחת ערב'), idea('קפה')])).toBe(
      'האירוע "ארוחת ערב" והרעיון "קפה" יישארו בלי מיקום',
    );
  });

  // Past the naming limit the sentence would become a recital, so it counts by kind
  // instead — the specifics are still on screen, in the selected row's way-in block.
  it('counts by kind once there are too many to name', () => {
    expect(t.map.del.refs([event('א'), event('ב'), idea('ג')])).toBe(
      '2 אירועים ורעיון אחד יישארו בלי מיקום',
    );
    expect(t.map.del.refs([booking('א'), booking('ב'), booking('ג')])).toBe(
      '3 הזמנות יישארו בלי מיקום',
    );
  });

  // `ו2` reads as one token, so a numeral takes a hyphen after the prefix.
  it('hyphenates the prefix before a numeral', () => {
    expect(t.map.del.refs([event('א'), idea('ב'), idea('ג')])).toBe(
      'אירוע אחד ו-2 רעיונות יישארו בלי מיקום',
    );
  });

  // A row with no title cannot be named, so the whole sentence falls back rather than
  // printing an empty pair of quotes.
  it('counts instead of naming when a row has no title', () => {
    expect(t.map.del.refs([event(undefined)])).toBe('אירוע אחד יישאר בלי מיקום');
  });

  // The caller already withholds the whole line in this case; returning a sentence about
  // nothing would make that the caller's rule alone.
  it('says nothing when nothing loses a location', () => {
    expect(t.map.del.refs([])).toBe('');
  });
});
