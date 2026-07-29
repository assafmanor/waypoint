// @vitest-environment jsdom
//
// **THE SYSTEM-BACK INTERCEPTOR, WITH A BROWSER TO INTERCEPT** (ADR-0090's trigger,
// ADR-0103's marker bookkeeping).
//
// Everything else about back is already covered: `resolveBack` is pure and tested in
// `nav-state.test.ts`, and the executor's peel-off-the-result behaviour in
// `nav-state.overlay.test.tsx` — but BOTH drive `runBack` directly. Nothing exercised the
// path the platform actually takes, which is where the interesting half lives: the
// Navigation API event, the cancelable/activation gate, and above all the **history
// markers** ADR-0103 pushes so a system back can RIDE a traversal instead of cancelling it.
//
// That gap is why an owner-reported back bug survived a read-through audit. The frontend
// guide already says how to close it — _"before declaring imperative glue untestable, count
// the methods it actually calls; usually a fake is cheaper than the bug"_ — and the
// interceptor touches exactly three: `addEventListener`, `removeEventListener`, and
// `currentEntry.index`. So here is the fake, and it is the reusable half of this file.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '../ui/Toast';
import { NavProvider, useBackLayer, useMarkInsideTrip } from './nav-state';

/** The three-method Navigation API surface the interceptor reads. `currentEntry.index` only
 *  has to move relative to a destination — the interceptor compares the two to let a FORWARD
 *  traverse pass — so a counter is the whole model. */
class FakeNavigation extends EventTarget {
  currentEntry = { index: 5 };
}

let fakeNav: FakeNavigation;

beforeEach(() => {
  fakeNav = new FakeNavigation();
  (window as unknown as { navigation?: FakeNavigation }).navigation = fakeNav;
  // A REAL browser URL, and a `BrowserRouter` over it — not `MemoryRouter`. The interceptor
  // builds its snapshot from `window.location` (it runs inside a DOM event, outside React),
  // so a memory router leaves it reading `/` forever and every assertion here would pass for
  // the wrong reason. The harness found that on its first run, which is a fair advertisement
  // for having built it.
  //
  // …and the history has to have the shape the app really builds, or the bug hides. The trip
  // shell pushes ONE same-URL **guard** entry so the OS back has something cancelable to
  // traverse into (`needsBackGuard`), and in-trip tab changes then REPLACE the top. So a
  // user on the Map tab is sitting on `[/ , /?tab=map]` — and the entry behind the tab is
  // trip **Home**. That is the whole reason a back that rides one entry too far reads as
  // "it went home".
  window.history.replaceState(null, '', '/');
  window.history.pushState(null, '', '/'); // the guard
  window.history.replaceState(null, '', '/?tab=map'); // the tab change
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { navigation?: FakeNavigation }).navigation;
});

/** One press of the platform back, modelled the way the platform actually delivers it.
 *
 *  The `cancelable` flag is a TEST INPUT rather than a constant, because it is the whole
 *  subtlety ADR-0103 was written about: a user-initiated backward traverse is only
 *  cancelable while a consumable user activation exists, so consecutive presses stop being
 *  cancelable and the app cannot `preventDefault` its way out.
 *
 *  If nothing prevents the event, the traversal **commits** — and that is modelled with
 *  `navigate(-1)` on the memory router. App code may never do that (ADR-0090, lint-adjacent
 *  rule); a harness standing in for the browser must, because a traversal that did not move
 *  history would make every assertion below meaningless. */
function SystemBack({ cancelable }: { cancelable: boolean }) {
  return (
    <button
      data-testid="system-back"
      onClick={() => {
        const evt = Object.assign(new Event('navigate', { cancelable }), {
          navigationType: 'traverse',
          destination: { index: fakeNav.currentEntry.index - 1 },
        });
        fakeNav.dispatchEvent(evt);
        if (!evt.defaultPrevented) {
          fakeNav.currentEntry.index -= 1;
          // The traversal COMMITS. Modelled with the platform's own history, which is what
          // `BrowserRouter` listens to — app code may never traverse (ADR-0090), but a
          // harness standing in for the browser must, or a "back" that moved nothing would
          // make every assertion below meaningless.
          window.history.back();
        }
      }}
    />
  );
}

/** One back, settled. `history.back()` delivers `popstate` on a later task, so the router
 *  has not caught up when `fireEvent` returns — awaiting is not politeness here, it is the
 *  difference between asserting the destination and asserting the origin. */
async function pressBack(expected: string) {
  fireEvent.click(screen.getByTestId('system-back'));
  await act(async () => {
    await waitFor(() => expect(where()).toBe(expected));
  });
}

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname + loc.search}</span>;
}
const where = () => screen.getByTestId('where').textContent;

/** A screen with a layer it can enter and leave WITHOUT unmounting — the Map's open query
 *  field, which is the surface the owner reported (ADR-0132 §5's `active` flag). */
function ScreenWithToggleLayer({ label = 'field' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  useBackLayer(() => {
    setOpen(false);
    return { remainsActive: false };
  }, open);
  return (
    <>
      <button data-testid={`open-${label}`} onClick={() => setOpen(true)}>
        open
      </button>
      <button data-testid={`close-${label}`} onClick={() => setOpen(false)}>
        close
      </button>
      <span data-testid={`state-${label}`}>{open ? 'open' : 'closed'}</span>
    </>
  );
}
const isOpen = (label = 'field') => screen.getByTestId(`state-${label}`).textContent === 'open';

/** Marks the tree as being inside the trip shell, which is what makes `resolveBack` treat a
 *  `?tab=` as a tab rather than a shell route. */
function InsideTrip() {
  useMarkInsideTrip();
  return null;
}

function wrap(node: ReactNode, cancelable = true) {
  return (
    <BrowserRouter>
      <ToastProvider>
        <NavProvider>
          <InsideTrip />
          {node}
          <Where />
          <SystemBack cancelable={cancelable} />
        </NavProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

describe('the system back, against a fake Navigation API', () => {
  // The baseline the whole marker scheme exists to produce: one press closes the layer and
  // the screen does not move. It rides the traversal rather than cancelling it, so a marker
  // has to be there to absorb the movement.
  it('closes an open layer and stays exactly where it was', async () => {
    render(wrap(<ScreenWithToggleLayer />));
    fireEvent.click(screen.getByTestId('open-field'));
    expect(isOpen()).toBe(true);

    await pressBack('/?tab=map');
    expect(isOpen()).toBe(false);
  });

  // THE OWNER'S REPORT (2026-07-29): _"closing (swipe back) the map search entered from the
  // map should return you back to the map and not home"_. Opening the field a SECOND time is
  // the whole reproduction — ADR-0103's marker bookkeeping is push-only, so the first
  // off-back close leaves a spent marker, the counts drift, and the second open pushes
  // nothing because the depth already covers the layer. The ride then has no marker to
  // absorb it and the traversal escapes the tab.
  it('closes an open layer and stays put even after an earlier close by tap', async () => {
    render(wrap(<ScreenWithToggleLayer />));
    fireEvent.click(screen.getByTestId('open-field'));
    fireEvent.click(screen.getByTestId('close-field')); // the ✕, not a back
    fireEvent.click(screen.getByTestId('open-field'));

    await pressBack('/?tab=map');
    expect(isOpen()).toBe(false);
  });

  // …and once the layer is gone a back is structural again, which for a non-Home tab is the
  // trip Home (`resolveBack` rule 2). Asserted here so the fix above cannot be "never leave
  // the tab": the tab is still supposed to be leavable.
  it('leaves the tab for Home once nothing is open', async () => {
    render(wrap(<ScreenWithToggleLayer />));
    await pressBack('/');
  });

  it('lets a forward traverse pass untouched', () => {
    render(wrap(<ScreenWithToggleLayer />));
    fireEvent.click(screen.getByTestId('open-field'));
    const evt = Object.assign(new Event('navigate', { cancelable: true }), {
      navigationType: 'traverse',
      destination: { index: fakeNav.currentEntry.index + 1 },
    });
    fakeNav.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    expect(isOpen()).toBe(true);
  });

  it('ignores a navigation that is not a traverse', () => {
    render(wrap(<ScreenWithToggleLayer />));
    fireEvent.click(screen.getByTestId('open-field'));
    const evt = Object.assign(new Event('navigate', { cancelable: true }), {
      navigationType: 'push',
      destination: { index: fakeNav.currentEntry.index - 1 },
    });
    fakeNav.dispatchEvent(evt);
    expect(isOpen()).toBe(true);
  });

  // Two stacked layers peel one at a time, which is the case ADR-0103 found the OS
  // force-exiting the app over: cancelling each press exhausts the activation gate, so each
  // one has to ride its own marker instead.
  it('peels stacked layers one press at a time, without leaving the tab', async () => {
    render(
      wrap(
        <>
          <ScreenWithToggleLayer label="a" />
          <ScreenWithToggleLayer label="b" />
        </>,
      ),
    );
    fireEvent.click(screen.getByTestId('open-a'));
    fireEvent.click(screen.getByTestId('open-b'));

    await pressBack('/?tab=map');
    expect(isOpen('b')).toBe(false);
    expect(isOpen('a')).toBe(true);

    await pressBack('/?tab=map');
    expect(isOpen('a')).toBe(false);
  });
});
