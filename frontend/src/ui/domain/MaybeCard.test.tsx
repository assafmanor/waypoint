// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MaybeCard, MaybeMoreCard } from './MaybeCard';

describe('MaybeCard', () => {
  afterEach(() => cleanup());

  // The tap is `onOpen` (ADR-0116's 2026-08-01 amendment). Read as a rename of
  // `onSchedule` these read the same, which is why every assertion below now names what
  // the card promises — "the card's tap fires its one handler" — rather than what the
  // handler happened to do at one call site. The card never schedules anything: a
  // skipped card's tap restores, an idea's opens its sheet, and that is the host's word.
  it('renders icon/title/action and fires onOpen on tap (single-button form)', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <MaybeCard icon="🍜" title="ראמן" action="＋ שבץ ליום" onOpen={onOpen} />,
    );
    expect(container.querySelector('.wp-maybecard-ic')?.textContent).toBe('🍜');
    expect(screen.getByText('ראמן')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders the REAL meta prop when passed', () => {
    const { container } = render(
      <MaybeCard icon="🍜" title="ראמן" meta="נוסף ע״י נועם" action="שבץ" onOpen={() => {}} />,
    );
    expect(container.querySelector('.wp-maybecard-meta')?.textContent).toBe('נוסף ע״י נועם');
  });

  it('omits the meta line when meta is not passed (no fixture slot)', () => {
    const { container } = render(
      <MaybeCard icon="🍜" title="ראמן" action="שבץ" onOpen={() => {}} />,
    );
    expect(container.querySelector('.wp-maybecard-meta')).toBeNull();
  });

  it('dims + disables the tap when consumed', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <MaybeCard icon="🍜" title="ראמן" action="שובץ" onOpen={onOpen} disabled />,
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(container.querySelector('.wp-maybecard.consumed')).toBeTruthy();
  });

  it('renders the remove variant (PlanDay shelf): body opens, corner removes', () => {
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    render(
      <MaybeCard
        icon="🍜"
        title="ראמן"
        action="שבץ"
        onOpen={onOpen}
        onRemove={onRemove}
        removeLabel="הסר רעיון"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'הסר רעיון' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    // The body button is the other button (no accessible-name match) — click it.
    const body = document.querySelector('.wp-maybecard-body') as HTMLButtonElement;
    fireEvent.click(body);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // The tile (ADR-0116's session-202 amendment §2). Geometry lives in CSS, which a
  // jsdom test cannot see — what it CAN assert is the markup that geometry needs,
  // and that the action line is genuinely gone rather than merely hidden.
  // **The way to the idea's pin** (ADR-0121 §8's 2026-08-04 amendment). The glyph slot is a
  // `PlaceBadge` now, as it is on the three hosts that already had one. The GEOMETRY claim —
  // that this costs the tile nothing — is a browser one and lives in
  // `e2e/idea-place-badge.spec.ts`; what is assertable here is which element it is and that
  // the tap does not reach the card underneath.
  describe('the place badge', () => {
    it('makes the glyph a control when the idea has a place', () => {
      render(<MaybeCard icon="🍜" title="ראמן" onOpen={vi.fn()} onShowOnMap={vi.fn()} />);
      const badge = document.querySelector('.wp-maybecard-ic')!;
      expect(badge.className).toContain('wp-placebadge');
      expect(badge.getAttribute('role')).toBe('button');
      expect(badge.querySelector('.wp-placebadge-mark')).toBeTruthy();
    });

    // "Absent, not broken" — the rule the badge follows on every host.
    it('leaves the glyph exactly as it was without one', () => {
      render(<MaybeCard icon="🍜" title="ראמן" onOpen={vi.fn()} />);
      const badge = document.querySelector('.wp-maybecard-ic')!;
      expect(badge.className).not.toContain('wp-placebadge');
      expect(badge.getAttribute('role')).toBeNull();
      expect(badge.getAttribute('aria-hidden')).toBe('true');
      expect(badge.textContent).toBe('🍜');
    });

    // The whole card is a button on this host, so the badge's tap must not also open the
    // idea's sheet — the one thing a nested control has to get right.
    it('fires only the badge, never the card behind it', () => {
      const onOpen = vi.fn();
      const onShowOnMap = vi.fn();
      render(<MaybeCard icon="🍜" title="ראמן" onOpen={onOpen} onShowOnMap={onShowOnMap} />);
      fireEvent.click(document.querySelector('.wp-maybecard-ic')!);
      expect(onShowOnMap).toHaveBeenCalledTimes(1);
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('works on the remove variant too, where the body is the button', () => {
      const onOpen = vi.fn();
      const onShowOnMap = vi.fn();
      render(
        <MaybeCard
          icon="🍜"
          title="ראמן"
          onOpen={onOpen}
          onRemove={vi.fn()}
          removeLabel="הסר"
          onShowOnMap={onShowOnMap}
        />,
      );
      fireEvent.click(document.querySelector('.wp-maybecard-ic')!);
      expect(onShowOnMap).toHaveBeenCalledTimes(1);
      expect(onOpen).not.toHaveBeenCalled();
    });
  });

  describe('the compact tile', () => {
    it('carries the modifier and wraps title + meta so the row axis has a block', () => {
      const { container } = render(
        <MaybeCard compact icon="🍜" title="ראמן" meta="0.3 ק״מ" onOpen={() => {}} />,
      );
      expect(container.querySelector('.wp-maybecard.compact')).toBeTruthy();
      const main = container.querySelector('.wp-maybecard-main');
      expect(main?.querySelector('.wp-maybecard-title')?.textContent).toBe('ראמן');
      expect(main?.querySelector('.wp-maybecard-meta')?.textContent).toBe('0.3 ק״מ');
    });

    it('has no action line — the section hint above the strip says it once', () => {
      const { container } = render(<MaybeCard compact icon="🍜" title="ראמן" onOpen={() => {}} />);
      expect(container.querySelector('.wp-maybecard-add')).toBeNull();
    });

    it('keeps every other card behaviour: tap opens, remove still removes', () => {
      const onOpen = vi.fn();
      const onRemove = vi.fn();
      render(
        <MaybeCard
          compact
          icon="🍜"
          title="ראמן"
          onOpen={onOpen}
          onRemove={onRemove}
          removeLabel="הסר רעיון"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'הסר רעיון' }));
      fireEvent.click(document.querySelector('.wp-maybecard-body') as HTMLButtonElement);
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    // The note mark (ADR-0153 §7): the tile's corner, so the meta line keeps carrying
    // ADR-0151's ranking reason. A count only past 1.
    describe('the note mark', () => {
      it('is absent at zero notes, so a tile with none is untouched markup', () => {
        const { container } = render(
          <MaybeCard compact icon="🍜" title="ראמן" meta="0.3 ק״מ" notes={0} onOpen={() => {}} />,
        );
        expect(container.querySelector('.note-mark')).toBeNull();
      });

      it('appears beside the reason rather than instead of it, and counts only past 1', () => {
        const one = render(
          <MaybeCard compact icon="🍜" title="ראמן" meta="0.3 ק״מ" notes={1} onOpen={() => {}} />,
        );
        expect(one.container.querySelector('.note-mark')?.textContent).toBe('');
        // The reason survives — the mark took the corner, not the line (§7).
        expect(one.container.querySelector('.wp-maybecard-meta')?.textContent).toBe('0.3 ק״מ');
        cleanup();

        const three = render(
          <MaybeCard compact icon="🍜" title="ראמן" meta="0.3 ק״מ" notes={3} onOpen={() => {}} />,
        );
        expect(three.container.querySelector('.note-mark')?.textContent).toBe('3');
      });

      it('is a sibling of the remove button, not nested in it, so both corners are free', () => {
        const { container } = render(
          <MaybeCard
            compact
            icon="🍜"
            title="ראמן"
            notes={2}
            onOpen={() => {}}
            onRemove={() => {}}
            removeLabel="הסר רעיון"
          />,
        );
        const card = container.querySelector('.wp-maybecard') as HTMLElement;
        const mark = container.querySelector('.note-mark') as HTMLElement;
        expect(mark.parentElement).toBe(card);
        expect(container.querySelector('.wp-maybecard-remove .note-mark')).toBeNull();
      });

      // Read-only (§8): the reach is the sheet the tap opens, never the 13px glyph.
      it('is not a control', () => {
        render(<MaybeCard compact icon="🍜" title="ראמן" notes={2} onOpen={() => {}} />);
        expect(screen.getAllByRole('button')).toHaveLength(1);
      });
    });
  });

  // The way through to the rest (§5). It borrows the tile's box and not its grammar,
  // so what a test can hold is that it is NOT a maybe card wearing a different hat:
  // no soft modifier, no open handler of the idea kind, no drag, no remove.
  describe('MaybeMoreCard', () => {
    it('opens the rest, and carries the tile box without the idea affordances', () => {
      const onOpen = vi.fn();
      const { container } = render(
        <MaybeMoreCard label="עוד 35 · במפה" icon={<span className="icon" />} onOpen={onOpen} />,
      );
      fireEvent.click(screen.getByRole('button', { name: /עוד 35/ }));
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(container.querySelector('.wp-maybecard.compact.more')).toBeTruthy();
      expect(container.querySelector('.wp-maybecard-add')).toBeNull();
      expect(container.querySelector('.wp-maybecard-remove')).toBeNull();
      expect(container.querySelector('.draggable')).toBeNull();
    });
  });

  // The wrapper is unconditional so there is one markup shape; `display: contents`
  // is what keeps the shipped card laying out exactly as it did.
  it('wraps title + meta on the base card too, without dropping the action', () => {
    const { container } = render(
      <MaybeCard icon="🍜" title="ראמן" meta="נוסף ע״י נועם" action="שבץ" onOpen={() => {}} />,
    );
    expect(container.querySelector('.wp-maybecard-main .wp-maybecard-title')).toBeTruthy();
    expect(container.querySelector('.wp-maybecard-add')?.textContent).toBe('שבץ');
  });
});
