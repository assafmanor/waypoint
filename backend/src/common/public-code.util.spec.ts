import { describe, expect, it } from 'vitest';
import { generateInviteCode } from '../trips/invite.util';
import { generatePublicCode, PUBLIC_CODE_PATTERN } from './public-code.util';

describe('generatePublicCode', () => {
  it('generates an 8-character base58 capability', () => {
    expect(generatePublicCode()).toMatch(PUBLIC_CODE_PATTERN);
  });

  it('omits the four glyphs a human mistypes', () => {
    const sample = Array.from({ length: 200 }, () => generatePublicCode(32)).join('');
    for (const ambiguous of ['0', 'O', 'I', 'l']) expect(sample).not.toContain(ambiguous);
  });

  it('does not repeat itself across a large sample', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generatePublicCode()));
    expect(codes.size).toBe(2000);
  });

  // The invite code and the share code must stay the same technique, not two that
  // happen to look alike today (ADR-0067 / ADR-0213 §5).
  it('is the generator the invite code now uses', () => {
    expect(generateInviteCode()).toMatch(PUBLIC_CODE_PATTERN);
  });
});
