// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  AppShell,
  CHROME_CONDENSED,
  CHROME_RECLAIMED,
  Inline,
  ResponsiveGrid,
  Screen,
  Section,
  Stack,
  StickyActionBar,
} from './index';

afterEach(() => cleanup());

describe('AppShell', () => {
  it('renders header / main / nav landmarks with their slot content', () => {
    render(
      <AppShell header={<header>the header</header>} nav={<nav aria-label="tabs">the nav</nav>}>
        the body
      </AppShell>,
    );
    expect(screen.getByRole('banner').textContent).toContain('the header');
    expect(screen.getByRole('main').textContent).toContain('the body');
    expect(screen.getByRole('navigation', { name: 'tabs' }).textContent).toContain('the nav');
  });

  it('applies mode as data-mode and omits data-switching when unset', () => {
    const { container } = render(<AppShell mode="plan">body</AppShell>);
    const frame = container.querySelector('.app')!;
    expect(frame.getAttribute('data-mode')).toBe('plan');
    expect(frame.hasAttribute('data-switching')).toBe(false);
  });

  it('applies data-switching when provided', () => {
    const { container } = render(
      <AppShell mode="trip" switching="to-trip">
        body
      </AppShell>,
    );
    expect(container.querySelector('.app')!.getAttribute('data-switching')).toBe('to-trip');
  });

  // The layout layer's second surface-driven modifier (ADR-0132 §2), after
  // `BODY_FULLBLEED`. Both chrome slots stay MOUNTED — the CSS hides them, so the day
  // strip keeps its scroll position and nothing re-mounts when the field closes.
  it('applies chrome as data-chrome, omits it when unset, and keeps both slots mounted', () => {
    const { container, rerender } = render(
      <AppShell header={<header>the header</header>} nav={<nav aria-label="tabs">the nav</nav>}>
        body
      </AppShell>,
    );
    expect(container.querySelector('.app')!.hasAttribute('data-chrome')).toBe(false);
    rerender(
      <AppShell
        header={<header>the header</header>}
        nav={<nav aria-label="tabs">the nav</nav>}
        chrome={CHROME_RECLAIMED}
      >
        body
      </AppShell>,
    );
    expect(container.querySelector('.app')!.getAttribute('data-chrome')).toBe('reclaimed');
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'tabs' })).toBeTruthy();
  });

  it('renders overlay content as a frame sibling (outside main)', () => {
    render(<AppShell overlay={<div data-testid="ov">sheet</div>}>body</AppShell>);
    const overlay = screen.getByTestId('ov');
    expect(document.body.contains(overlay)).toBe(true);
    expect(screen.getByRole('main').contains(overlay)).toBe(false);
  });

  it('remounts the body when bodyKey changes (fade / per-tab reset)', () => {
    const { rerender } = render(<AppShell bodyKey="home">home</AppShell>);
    const first = screen.getByRole('main');
    rerender(<AppShell bodyKey="index">index</AppShell>);
    const second = screen.getByRole('main');
    expect(second.textContent).toContain('index');
    expect(second).not.toBe(first);
  });

  // The third surface-driven modifier (ADR-0149 §7). jsdom reports every scroll
  // dimension as 0, so the shell's own scroll path can't fire here — which is
  // precisely why the surface DECLARATION is the thing worth asserting: it is the
  // only route to a condensed chrome on a body that never scrolls.
  describe('the condensed chrome', () => {
    it('applies a surface-declared condense as data-chrome', () => {
      const { container } = render(<AppShell chrome={CHROME_CONDENSED}>body</AppShell>);
      expect(container.querySelector('.app')!.getAttribute('data-chrome')).toBe('condensed');
    });

    it('lets the reclaim win over it — there is no chrome left to condense', () => {
      const { container } = render(<AppShell chrome={CHROME_RECLAIMED}>body</AppShell>);
      expect(container.querySelector('.app')!.getAttribute('data-chrome')).toBe('reclaimed');
    });

    it('leaves data-chrome off a body that has not been scrolled', () => {
      const { container } = render(<AppShell>body</AppShell>);
      expect(container.querySelector('.app')!.hasAttribute('data-chrome')).toBe(false);
    });
  });
});

describe('Screen', () => {
  it('applies the centered container class and size hook', () => {
    const { container } = render(<Screen size="wide">content</Screen>);
    const el = container.querySelector('.wp-screen')!;
    expect(el.textContent).toContain('content');
    expect(el.getAttribute('data-size')).toBe('wide');
  });

  it('defaults to the default size and can render as a custom element', () => {
    const { container } = render(<Screen as="section">c</Screen>);
    const el = container.querySelector('.wp-screen')!;
    expect(el.tagName).toBe('SECTION');
    expect(el.getAttribute('data-size')).toBe('default');
  });
});

describe('Section', () => {
  it('renders its title as a real heading and shows children', () => {
    render(
      <Section title="הזמנות" titleAs="h3">
        <p>row</p>
      </Section>,
    );
    const heading = screen.getByRole('heading', { name: 'הזמנות', level: 3 });
    expect(heading.textContent).toBe('הזמנות');
    expect(screen.getByText('row')).toBeDefined();
  });

  it('defaults the title to an h2 and omits the head when no title/actions', () => {
    render(
      <Section title="כותרת">
        <span>x</span>
      </Section>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'כותרת' })).toBeDefined();
    const { container: bare } = render(<Section>only body</Section>);
    expect(bare.querySelector('.wp-section-head')).toBeNull();
  });

  it('renders actions in the title row', () => {
    render(
      <Section title="t" actions={<button>＋</button>}>
        body
      </Section>,
    );
    expect(screen.getByRole('button', { name: '＋' })).toBeDefined();
  });
});

describe('Stack / Inline', () => {
  it('Stack applies the gap token from the spacing ramp', () => {
    const { container } = render(
      <Stack gap={3}>
        <span>a</span>
        <span>b</span>
      </Stack>,
    );
    const el = container.querySelector('.wp-stack') as HTMLElement;
    expect(el.style.gap).toBe('var(--space-3)');
    expect(el.textContent).toContain('a');
    expect(el.textContent).toContain('b');
  });

  it('Inline applies the gap token and align/justify mapping', () => {
    const { container } = render(
      <Inline gap={2} justify="between" align="center">
        <span>a</span>
      </Inline>,
    );
    const el = container.querySelector('.wp-inline') as HTMLElement;
    expect(el.style.gap).toBe('var(--space-2)');
    expect(el.style.justifyContent).toBe('space-between');
    expect(el.style.alignItems).toBe('center');
  });
});

describe('StickyActionBar', () => {
  it('renders children as a group and does not trap focus', () => {
    render(
      <>
        <StickyActionBar>
          <button>save</button>
        </StickyActionBar>
        <button>outside</button>
      </>,
    );
    const bar = screen.getByRole('group');
    expect(bar.hasAttribute('aria-modal')).toBe(false);
    expect(bar.textContent).toContain('save');

    // Not a trap: focus can leave for a sibling, and a Tab keydown is not
    // intercepted (fireEvent returns false only when preventDefault was called).
    const outside = screen.getByRole('button', { name: 'outside' });
    outside.focus();
    expect(document.activeElement).toBe(outside);
    const notPrevented = fireEvent.keyDown(screen.getByRole('button', { name: 'save' }), {
      key: 'Tab',
    });
    expect(notPrevented).toBe(true);
  });
});

describe('ResponsiveGrid', () => {
  it('renders children with an auto-fit template and gap token', () => {
    const { container } = render(
      <ResponsiveGrid gap={4} min="200px">
        <span>a</span>
        <span>b</span>
      </ResponsiveGrid>,
    );
    const el = container.querySelector('.wp-grid') as HTMLElement;
    expect(el.style.gap).toBe('var(--space-4)');
    expect(el.style.gridTemplateColumns).toContain('auto-fit');
    expect(el.style.gridTemplateColumns).toContain('200px');
    expect(el.textContent).toContain('a');
    expect(el.textContent).toContain('b');
  });
});
