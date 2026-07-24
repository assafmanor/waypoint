// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useRouteDisplay } from './useRouteDisplay';
import { type Route } from '../lib/places';
import { t } from '../i18n/he';

const TLV = 'נמל התעופה בן גוריון';
const KEF = 'נמל התעופה הבינלאומי קפלאוויק';

/** jsdom reports every layout width as 0, so the overflow fallback never fires on
 *  its own. Stub the two widths `useOverflows` measures. */
function stubWidths({ natural, available }: { natural: number; available: number }) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(natural);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(available);
}

/** Renders the hook's two slots the way a day row consumes them. */
function Probe({ route }: { route: Route | null }) {
  const { title, meta } = useRouteDisplay(route);
  return (
    <div>
      <div data-testid="title">{title ?? 'FALLBACK_TO_EVENT_TITLE'}</div>
      <div data-testid="meta">{meta ?? 'FALLBACK_TO_PLACE_NAME'}</div>
    </div>
  );
}

describe('useRouteDisplay', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('gives no slots for a non-transport event, so the row keeps its own title', () => {
    const { getByTestId } = render(<Probe route={null} />);
    expect(getByTestId('title').textContent).toBe('FALLBACK_TO_EVENT_TITLE');
    expect(getByTestId('meta').textContent).toBe('FALLBACK_TO_PLACE_NAME');
  });

  it('keeps the inline route with SHORTENED names, and the full destination as meta', () => {
    stubWidths({ natural: 200, available: 220 });
    const { getByTestId } = render(<Probe route={{ from: TLV, to: KEF }} />);

    const title = getByTestId('title');
    // The boilerplate is gone, so both endpoints fit on one line.
    expect(title.querySelector('.route')!.textContent).toBe('בן גוריוןקפלאוויק');
    expect(title.querySelector('.arr svg')).not.toBeNull();
    // Nothing is lost: the meta carries the destination's full official name —
    // and no longer repeats the origin.
    expect(getByTestId('meta').textContent).toBe(KEF);
  });

  it('drops to a destination-primary line when even the shortened route overflows', () => {
    stubWidths({ natural: 600, available: 200 });
    const { getByTestId } = render(<Probe route={{ from: TLV, to: KEF }} />);

    // Title is the destination alone — the half that says where you're going.
    const title = getByTestId('title');
    expect(title.textContent).toBe('קפלאוויק');
    expect(title.querySelector('.route')).toBeNull();
    // The origin moves to the meta, shortened too since that line is tighter.
    expect(getByTestId('meta').textContent).toBe(t.event.routeFrom('בן גוריון'));
  });

  it('never truncates — the fallback swaps the layout instead of clipping text', () => {
    stubWidths({ natural: 600, available: 200 });
    const { getByTestId } = render(<Probe route={{ from: TLV, to: KEF }} />);
    for (const id of ['title', 'meta']) {
      expect(getByTestId(id).textContent).not.toContain('…');
      expect(getByTestId(id).textContent).not.toContain('...');
    }
  });

  it('handles a one-ended route (destination still missing)', () => {
    stubWidths({ natural: 100, available: 220 });
    const { getByTestId } = render(<Probe route={{ from: TLV }} />);
    expect(getByTestId('title').querySelector('.route')!.textContent).toContain('בן גוריון');
  });
});
