import { describe, expect, it } from 'vitest';
import { chosenIcon, DEFAULT_EVENT_ICON, DEFAULT_MAYBE_ICON } from './constants';

// `chosenIcon` exists so a DEFAULT glyph stops outranking one that actually says
// what a thing is. Four surfaces read `event.icon ?? <something more specific>`
// (a booking's type glyph, a category's glyph), and the rule they encode is
// "a user-picked icon wins" — true only if a default is not mistaken for a pick.
describe('chosenIcon', () => {
  it('passes a real glyph through', () => {
    expect(chosenIcon('✈️')).toBe('✈️');
    expect(chosenIcon('🍜')).toBe('🍜');
  });

  it('drops the placeholders, so the fallback behind it runs', () => {
    expect(chosenIcon(DEFAULT_EVENT_ICON)).toBeUndefined();
    expect(chosenIcon(DEFAULT_MAYBE_ICON)).toBeUndefined();
  });

  it('drops absent and empty, the same as it always did', () => {
    expect(chosenIcon(undefined)).toBeUndefined();
    expect(chosenIcon('')).toBeUndefined();
  });

  // The shape every call site relies on: `chosenIcon(x) ?? fallback` gives the
  // fallback for a placeholder and keeps a real pick.
  it('lets a booking row prefer its type glyph over a default pin', () => {
    const typeGlyph = '✈️';
    expect(chosenIcon(DEFAULT_EVENT_ICON) ?? typeGlyph).toBe(typeGlyph);
    expect(chosenIcon('🚀') ?? typeGlyph).toBe('🚀');
  });
});
