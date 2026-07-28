// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ltrIsolate, withoutBidiControls } from '../../lib/bidi';
import { MemberRow } from './MemberRow';

const person = { displayName: 'דנה', avatarHue: 'rose' } as const;

afterEach(cleanup);

describe('MemberRow', () => {
  it('renders the shipped `.set-member` grammar, so the two lists cannot drift', () => {
    const { container } = render(<MemberRow person={person} role="peer" />);
    expect(container.querySelector('.set-member')).toBeTruthy();
    expect(container.querySelector('.av')).toBeTruthy();
  });

  it('is a plain row with a slot when it has no opener — the settings kebab goes there', () => {
    const { container } = render(
      <MemberRow person={person} role="peer">
        <button className="kebab">⋯</button>
      </MemberRow>,
    );
    expect(container.querySelector('button.set-member-tap')).toBeNull();
    expect(container.querySelector('.kebab')).toBeTruthy();
  });

  it('becomes a real button with a chevron when it opens the member', () => {
    const onOpen = vi.fn();
    const { container } = render(<MemberRow person={person} role="peer" onOpen={onOpen} />);
    const row = container.querySelector('button.set-member-tap')!;
    expect(container.querySelector('.member-chev')).toBeTruthy();
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalled();
  });

  it('does not offer a kebab slot AND a tap on the same row', () => {
    // Two ways to open one row is two answers to the same question.
    const { container } = render(
      <MemberRow person={person} role="peer" onOpen={() => {}}>
        <button className="kebab">⋯</button>
      </MemberRow>,
    );
    expect(container.querySelector('.kebab')).toBeNull();
  });
});

describe('the §10 defects this phase fixes', () => {
  it('the admin badge does not spend amber on a role', () => {
    // ADR-0133 §10 / ADR-0028: amber is time & commitment only, and a role is
    // neither. The badge keeps its `owner` class — the fix is in the stylesheet — so
    // what this asserts is that the class is still the hook the fix hangs on.
    const { container } = render(<MemberRow person={person} role="admin" />);
    expect(container.querySelector('.role.owner')).toBeTruthy();
    expect(screen.getByText('מנהל')).toBeTruthy();
  });

  it('a signed overflow count keeps its sign in front of the digits', () => {
    // The other §10 defect: bare `+{n}` in the RTL chrome rendered as `n+`. The
    // isolate is what holds the order — this is the ADR-0118 rule the frontend
    // CLAUDE.md documents for `−3`.
    const isolated = ltrIsolate('+2');
    expect(withoutBidiControls(isolated)).toBe('+2');
    expect(isolated).not.toBe('+2'); // i.e. the controls are actually present
  });
});
