// @vitest-environment jsdom
// The tests are about the VOCABULARY, because that is what the extraction is for: three
// hosts had drifted on which verbs exist, what they are called and what they wear, and a
// geometry test would not have caught any of it.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettleControl, type SettleVariant } from './SettleControl';
import { t } from '../../i18n/he';

afterEach(cleanup);

const VARIANTS: SettleVariant[] = ['prompt', 'sheet', 'compact'];

describe('SettleControl', () => {
  it.each(VARIANTS)('%s: the two verbs run their handlers', (variant) => {
    const onDone = vi.fn();
    const onSkip = vi.fn();
    const { container } = render(
      <SettleControl variant={variant} onDone={onDone} onSkip={onSkip} />,
    );
    fireEvent.click(container.querySelector('.wp-settle-btn.done')!);
    fireEvent.click(container.querySelector('.wp-settle-btn.skip')!);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  // The alignment this control exists for: the day view's skip was a bare word with no mark
  // beside a ✓ that had one. A regression here is the pair going asymmetric again.
  it.each(VARIANTS)('%s: BOTH verbs carry a mark, not just the affirmative', (variant) => {
    const { container } = render(
      <SettleControl variant={variant} onDone={vi.fn()} onSkip={vi.fn()} />,
    );
    expect(container.querySelector('.wp-settle-btn.done .icon')).toBeTruthy();
    expect(container.querySelector('.wp-settle-btn.skip .icon')).toBeTruthy();
  });

  // The other half of it: `דלג` is an instruction and `היינו` is a record, so the shipped
  // pair mixed the two. Both sides now say what happened.
  it.each(['prompt', 'sheet'] as const)('%s: both verbs are worded as records', (variant) => {
    const { container } = render(
      <SettleControl variant={variant} onDone={vi.fn()} onSkip={vi.fn()} />,
    );
    expect(container.querySelector('.wp-settle-btn.done')!.textContent).toContain(
      t.actions.wasThere,
    );
    expect(container.querySelector('.wp-settle-btn.skip')!.textContent).toContain(t.event.skipped);
    expect(container.textContent).not.toContain(t.actions.skip);
  });

  it('prompt asks in words; the other two densities do not (their hosts ask)', () => {
    const { container, unmount } = render(
      <SettleControl variant="prompt" onDone={vi.fn()} onSkip={vi.fn()} />,
    );
    expect(container.querySelector('.wp-settle-ask')!.textContent).toBe(t.day.settleAsk);
    unmount();
    for (const variant of ['sheet', 'compact'] as const) {
      const { container: c } = render(
        <SettleControl variant={variant} onDone={vi.fn()} onSkip={vi.fn()} />,
      );
      expect(c.querySelector('.wp-settle-ask')).toBeNull();
      cleanup();
    }
  });

  it('compact is icon-only but still NAMED, so a 32px button is not a mystery', () => {
    const { container } = render(
      <SettleControl variant="compact" onDone={vi.fn()} onSkip={vi.fn()} />,
    );
    expect(container.querySelector('.wp-settle-word')).toBeNull();
    expect(screen.getByRole('button', { name: t.actions.wasThere })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.event.skipped })).toBeTruthy();
  });

  // Every event is settleable rather than only the passed ones, so this state is reachable —
  // gating the pair on "passed and unanswered" would delete its undo (ADR-0139 §2).
  it.each([
    ['done', 'ok', t.event.didThis],
    ['skipped', 'miss', t.event.skipped],
  ] as const)('a settled event states %s and offers only the undo', (outcome, tone, word) => {
    const onUndo = vi.fn();
    const { container } = render(
      <SettleControl
        variant="compact"
        outcome={outcome}
        onDone={vi.fn()}
        onSkip={vi.fn()}
        onUndo={onUndo}
      />,
    );
    const tag = container.querySelector(`.wp-settle-tag.${tone}`)!;
    expect(tag.textContent).toContain(word);
    expect(tag.querySelector('.icon')).toBeTruthy();
    expect(container.querySelector('.wp-settle-btn.done')).toBeNull();
    expect(container.querySelector('.wp-settle-btn.skip')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t.actions.undoSettle }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  // The Map's reference row nests inside two tap targets (open the day, select the place).
  // Stopping here is why the third caller does not have to remember a prop.
  it('a settle never also navigates: the click does not reach the host', () => {
    const onHost = vi.fn();
    const onDone = vi.fn();
    const { container } = render(
      <div onClick={onHost}>
        <SettleControl variant="compact" onDone={onDone} onSkip={vi.fn()} />
      </div>,
    );
    fireEvent.click(container.querySelector('.wp-settle-btn.done')!);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onHost).not.toHaveBeenCalled();
  });
});
