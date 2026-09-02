// **A TRANSPARENT WRAPPER BREAKS EVERY CHILD COMBINATOR IT LANDS INSIDE**, and nothing in the
// unit suite can see it: jsdom loads no CSS, so a row that silently gets its border and its
// margin back inside a journey block, or a card the day's thread starts painting over, is a
// green test and a visual defect.
//
// `NowMarker` (ADR-0217) wraps whichever row the moment is inside, at any depth — so
// `.journey > .wp-event` becomes `.journey > .now-here > .wp-event` on a leg of a journey run
// that happens to be running, and `.day-thread > .wp-event` becomes
// `.day-thread > .now-here > .wp-event` on a carried flight. Both were found by grepping the
// stylesheets for child combinators over the row families the mark can wrap, which is the
// "count the call sites" rule in root `CLAUDE.md`; ADR-0212 §6's build log records the identical
// defect one rule away, from the identical cause.
//
// This asserts the repair rather than the geometry: every such rule names the wrapper too.
// A fifth family added later fails here instead of on a phone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

const dayJoinCss = read('../ui/domain/day-join.css');
const markerCss = read('../ui/domain/now-marker.css');
const shareCss = read('../screens/shared-itinerary.css');

/** Every selector list in a sheet, normalised to single spaces. */
const selectorLists = (css: string) =>
  [...css.matchAll(/([^{}]+)\{[^}]*\}/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());

/** The lists that reach a row family through a child combinator from `host`. */
const childRules = (css: string, host: string, family: string) =>
  selectorLists(css).filter((list) =>
    list.split(',').some((sel) => sel.trim().startsWith(`${host} > ${family}`)),
  );

describe('now-marker · the wrapper is transparent to the day’s child combinators', () => {
  // `.journey > .wp-event` strips a leg's border, radius and margin so it reads as a ROW of the
  // block (ADR-0159 §3). A wrapper in between hands all three back, inside the block.
  it('lets a journey block still reach a leg the mark has wrapped', () => {
    const rules = childRules(dayJoinCss, '.journey', '.wp-event');
    expect(rules.length).toBeGreaterThan(0);
    for (const list of rules) {
      expect(list).toContain('.journey > .now-here > .wp-event');
    }
  });

  // `.day-thread > .wp-event` lifts the card above the thread's own rule so the line paints
  // BEHIND it (ADR-0212 §1). Without the wrapper in this list the thread paints over the card.
  it('lets the day’s thread still reach a card the mark has wrapped', () => {
    const rules = childRules(dayJoinCss, '.day-thread', '.wp-event');
    expect(rules.length).toBeGreaterThan(0);
    for (const list of rules) {
      expect(list).toContain('.day-thread > .now-here');
    }
  });

  // `.journey` clips for its own radius, so a mark that reaches past its box has no arrow.
  it('keeps the mark inside a journey block, which clips', () => {
    expect(dayJoinCss).toMatch(/\.journey \.now-here \{[^}]*--now-bleed:\s*0px/);
    const journeyRule = dayJoinCss.match(/\.journey \{([^}]*)\}/)?.[1] ?? '';
    // If this stops clipping, the rule above is dead weight rather than a fix — and the mark
    // should go back to the day's own bleed.
    expect(journeyRule).toMatch(/overflow:\s*hidden/);
  });

  // **THE BOUNDARY FORM'S ROOM AND ITS OPAQUE CHIP ARE BOTH CSS-ONLY**, so jsdom can see
  // neither — and both are repairs to a defect that shipped. The room answers "hugging the
  // event card with no space at all"; the ground answers the rule running through the digits,
  // which is what happens when `.nowline-chip`'s ⁦12%⁩ fill is put ON a hairline instead of
  // beside one. A future edit that drops either is a phone report, not a red test.
  it('gives the boundary form room of its own', () => {
    expect(markerCss).toMatch(/\.now-here\.edge \{[^}]*margin-block:\s*var\(--now-room\)/);
    // The number is `.day-unplaced`'s (ADR-0171 §10a), not a chosen one.
    expect(markerCss).toMatch(/\.now-here\.edge \{[^}]*--now-room:\s*9px/);
  });

  it('grounds the boundary form’s clock so the rule cannot run through it', () => {
    const chip = markerCss.match(/\.now-here\.edge \.nowline-chip \{([^}]*)\}/)?.[1] ?? '';
    expect(chip).toMatch(/background:\s*var\(--now-ground\)/);
    expect(chip).toMatch(/box-shadow:[^;]*var\(--now-ground\)/);
  });

  // ADR-0043 §5: Plan may never read as live, and `.nowline-chip` is amber by construction —
  // so the one thing borrowed from the shared reader needs re-inking where the other three
  // properties already are.
  it('re-inks that clock in Plan’s posture', () => {
    expect(markerCss).toMatch(
      /\.now-here\[data-posture='plan'\] \.nowline-chip \{[^}]*color:\s*var\(--plan\)/,
    );
    expect(markerCss).toMatch(
      /\.now-here\[data-posture='plan'\] \.nowline-dot \{[^}]*background:\s*var\(--plan\)/,
    );
  });

  // **THE SHARED READER IS THE MARK'S THIRD HOST**, and everything it changes is a variable
  // in a single block — which is what `now-marker.css` was parameterised for. All four are
  // invisible to jsdom, and three of them are wrong-by-default rather than merely absent: the
  // ground would paint the day surfaces' `--screen` inside a card that is not that colour,
  // the bleed would reach past `.sh-day`'s `overflow: hidden` and lose the arrow entirely,
  // and the ⁦18px⁩ arrow draws ⁦13px⁩ into an ⁦11px⁩ gutter.
  it('gives the shared reader its own bleed, arrow, ground and room', () => {
    const host = shareCss.match(/\.sh-day-body \.now-here \{([^}]*)\}/)?.[1] ?? '';
    expect(host).toMatch(/--now-bleed:\s*11px/);
    expect(host).toMatch(/--now-tab:\s*15px/);
    expect(host).toMatch(/--now-ground:\s*color-mix/);
    expect(host).toMatch(/--now-room:\s*6px/);
  });

  // ADR-0217 §1 gives the mark no caption because the row it is in says the word. That is a
  // premise, not a decoration: a host whose rows cannot say it leaves the mark mute, which is
  // how the boundary form came to carry a clock. This is the reader's half of it.
  it('lets the shared reader’s running row say the word', () => {
    expect(shareCss).toMatch(/\.sh-event-now \{/);
  });

  // Both day surfaces render the same rows off the same derivation (ADR-0159 §1), so a bleed
  // named for only one of their braces is the split ADR-0171 §10e exists to repair.
  it('gives every nesting brace on both surfaces its own bleed', () => {
    for (const brace of ['.nest-kids', '.cluster-kids', '.bld-nest-kids']) {
      expect(markerCss).toContain(`${brace} .now-here`);
    }
  });
});
