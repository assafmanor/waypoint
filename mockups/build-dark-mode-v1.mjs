#!/usr/bin/env node
/* Generator for `mockups/dark-mode-v1.html` (ADR-0158's design session).
 *
 * WHY A GENERATOR AND NOT A HAND-WRITTEN FILE. The catalog's inlined app CSS has
 * drifted ~16.6k lines across 14 files against unchanged sources (backlog,
 * 2026-07-31 / session 189) — the cost of hand-copying the app into a mockup and
 * then never re-copying it. This file removes that failure mode: the CSS is read
 * from `frontend/src` at build time and the DOM is captured from the RUNNING app,
 * so the mockup cannot show a screen the app does not have.
 *
 *   1. start the app  (docs/engineering/prerequisites-checklist.md, DEV_AUTH=1)
 *   2. node mockups/extract-dark-mode-dom.mjs     # captures the four surfaces
 *   3. node mockups/build-dark-mode-v1.mjs        # writes mockups/dark-mode-v1.html
 *
 * The captured DOM is committed alongside (`dark-mode-v1.dom.json`) so step 3
 * works without a running app.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'frontend', 'src');

/* APP-CSS manifest — load order mirrors the app's own imports (main.tsx →
   App.tsx → per-component), because later rules win at equal specificity. */
const APP_CSS = [
  'styles/tokens.css',
  'App.css',
  'screens.css',
  'ui/primitives/avatar.css',
  'ui/primitives/choice-grid.css',
  'ui/primitives/confirm-dialog.css',
  'ui/primitives/field.css',
  'ui/primitives/form-actions.css',
  'ui/primitives/search-field.css',
  'ui/primitives/toggle-chip.css',
  'ui/domain/board.css',
  'ui/domain/day-strip.css',
  'ui/domain/glance-card.css',
  'ui/domain/index-tile.css',
  'ui/domain/stat-tile.css',
  'ui/domain/event-card.css',
  'ui/domain/list-row.css',
  'ui/domain/place-badge.css',
  'ui/feedback/feedback.css',
  'ui/layout/layout.css',
];

const css = APP_CSS.map((f) => `/* ==== ${f} ==== */\n${readFileSync(join(SRC, f), 'utf8')}`).join(
  '\n',
);
const dom = JSON.parse(readFileSync(join(HERE, 'dark-mode-v1.dom.json'), 'utf8'));

/* ── The proposals, as CSS overlays ───────────────────────────────────────── */

// P1 — the on-fill ink family, generalised from --cta/--cta-text.
const P_ONFILL = `
  :root { --on-fill: #ffffff; --on-amber: #3a2405; }
  :root[data-theme='dark'] { --on-fill: #12203a; }
  .choice-pill.on { background: var(--cta); color: var(--cta-text); }
  .wp-event-act:hover { background: var(--cta); color: var(--cta-text); }
  .bld-settle.done, .wp-event-check,
  .wp-event-act.go:hover, .wp-placebadge-mark, .hdr-sync-badge,
  .chk-cta.warn:hover, .wp-maybecard-remove:hover,
  .confirm[data-tone='danger'] .confirm-confirm,
  .chk-cta:hover, .bld-resolve, .gap-add:hover, .gapfill-new,
  .add-idea-btn:hover:not(:disabled), .wp-daypill.sel-future,
  .wp-daystrip[data-mode='plan'] .wp-daypill.on,
  .app[data-mode='plan'] .hdr-mode button.on .p { color: var(--on-fill) !important; }
`;

// P2 — plan's hero gets surface tokens, the way trip's already has --board.
const P_PLANSURFACE = `
  :root { --plan-surface: #6e59d6; --plan-surface-2: #5747b4; }
  :root[data-theme='dark'] { --plan-surface: #2a2158; --plan-surface-2: #332866; }
  .prep { background: linear-gradient(180deg, var(--plan-surface-2), var(--plan-surface)); }
`;

// P3 — the four measured light-theme text failures. Scalar darkenings, so hue
// and saturation are untouched.
const P_LIGHTTEXT = `
  :root { --faint: #808694; --muted: #626a7c; --amber-deep: #915e1e; }
`;

// P4 — .nav is an rgba the hex-only U-08 sweep never saw, so it stays white.
const P_NAV = `
  .nav { background: color-mix(in srgb, var(--card) 92%, transparent); }
`;

// P5 — the chrome contract as tokens. Trip-dark keeps today's values; the
// light-chrome option then sets the same five names instead of adding a third
// hand-written copy of "how chrome children look" beside plan's.
const CHROME_TOKENS = `
  .app, .mode-chrome {
    --chrome-bg: var(--indigo);
    --chrome-ink: #fff;
    --chrome-ink-dim: #8494b5;
    --chrome-ink-mid: #b9c4de;
    --chrome-wash: rgba(255, 255, 255, 0.09);
    --chrome-wash-2: rgba(255, 255, 255, 0.16);
    --chrome-ring: var(--indigo);
  }
  .mode-chrome { background: var(--chrome-bg); color: var(--chrome-ink); }
  .hdr-trip { background: var(--chrome-wash); border-color: var(--chrome-wash-2); }
  .hdr-swap, .hdr-mode { background: var(--chrome-wash); }
  .hdr-mode .p, .wp-daypill, .wp-monthdiv span, .hdr-anchor .cap { color: var(--chrome-ink-dim); }
  .wp-daypill .n, .hdr-anchor .num { color: var(--chrome-ink-mid); }
  .wp-daypill { background: var(--chrome-wash); }
  .wp-monthdiv i { background: var(--chrome-wash-2); }
  .av, .hdr-sync-badge { border-color: var(--chrome-ring); }
  .hdr-people .av.is-me { border-color: var(--chrome-ring); box-shadow: 0 0 0 2px var(--chrome-ring), 0 0 0 3.5px rgba(255,255,255,.55); }
`;
// …and the light-chrome option is then only these seven lines.
const P_LIGHTCHROME = `
  .app[data-mode='trip'], .mode-chrome[data-mode='trip'] {
    --chrome-bg: color-mix(in srgb, var(--indigo) 12%, var(--card));
    --chrome-ink: var(--ink);
    --chrome-ink-dim: var(--muted);
    --chrome-ink-mid: var(--ink);
    --chrome-wash: rgba(27, 42, 74, 0.07);
    --chrome-wash-2: rgba(27, 42, 74, 0.14);
    --chrome-ring: var(--chrome-bg);
  }
  .app[data-mode='trip'] .mode-chrome { box-shadow: inset 0 -1px 0 var(--line); }
  .app[data-mode='trip'] .hdr-people .av.is-me { box-shadow: 0 0 0 2px var(--chrome-ring), 0 0 0 3.5px rgba(27,42,74,.45); }
`;

const ALL_DARK_FIXES = P_ONFILL + P_PLANSURFACE + P_NAV;
const ALL_FIXES = ALL_DARK_FIXES + P_LIGHTTEXT;

/* Chrome-ground variants for §6, all on top of the tokenised contract. */
const ground = (v) => `
  .app[data-mode='trip'], .mode-chrome[data-mode='trip'] {
    --chrome-bg: ${v}; --chrome-ink: var(--ink); --chrome-ink-dim: var(--muted);
    --chrome-ink-mid: var(--ink); --chrome-wash: rgba(27,42,74,.07);
    --chrome-wash-2: rgba(27,42,74,.14); --chrome-ring: var(--chrome-bg);
  }
  .app[data-mode='trip'] .mode-chrome { box-shadow: inset 0 -1px 0 var(--line); }
  .app[data-mode='trip'] .hdr-people .av.is-me { box-shadow: 0 0 0 2px var(--chrome-ring), 0 0 0 3.5px rgba(27,42,74,.45); }
`;

/* ── Frames ───────────────────────────────────────────────────────────────── */
let n = 0;
const frames = [];
/** dom key · theme · overlay css · caption html */
function F(key, theme, extra, cap, opts = {}) {
  const id = `f${++n}`;
  frames.push({ id, key, theme, extra, ...opts });
  return `<div class="col"><div class="phone${opts.short ? ' short' : ''}" data-frame="${id}"></div>${cap ? `<p class="cap">${cap}</p>` : ''}</div>`;
}

const html = String.raw`<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dark mode, and what it found in light mode</title>
<!--
  Waypoint · Dark mode + the light-mode reconciliation (v1)
  ─────────────────────────────────────────────────────────
  GENERATED — do not hand-edit. Source: mockups/build-dark-mode-v1.mjs
  (regenerate: node mockups/build-dark-mode-v1.mjs)

  ═══════════════════════════════════════════════════════════════════════
  EVERY FRAME BELOW IS THE REAL APP: real DOM, real shipped CSS.
  ═══════════════════════════════════════════════════════════════════════
  The DOM was captured from the running app (dark-mode-v1.dom.json) and the
  CSS is read from frontend/src at build time via the APP-CSS manifest in the
  generator. Nothing here is redrawn, so nothing here can be outdated or
  invented — the two failure modes an earlier draft of this file had. Each
  frame is an isolated <iframe> so the app's own 'body'/':root' rules apply
  exactly as they do in the product instead of leaking into this page.

  Proposals are applied as CSS OVERLAYS on top of that, never by editing the
  captured markup, so "shipped" and "proposed" are the same screen.

  STATUS: adopted as ADR-0158 (docs/decisions/0158-dark-mode-ships-and-the-ink-
  a-surface-carries-is-a-token.md), whose §10 phases the build. One question is
  deliberately left open for the owner and deferred to Hero 2.0: §6's light trip
  chrome.

  WHAT THIS SESSION IS. The dark remap was complete and INERT — tokens.css
  had every value, and nothing anywhere set 'data-theme', so it had never
  been rendered. Setting it is what produced §3 and §4. Auditing both themes
  while there produced §5, which is the part nobody was looking for.
-->
<style>
:root{--lab-bg:#0c1220;--lab-bg-2:#111a2c;--lab-line:rgba(148,163,194,.16);
--lab-line-2:rgba(148,163,194,.32);--lab-ink:#e7ecf6;--lab-muted:#93a0b8;--lab-faint:#6b7794;
--lab-accent:#8b79e8;--lab-amber:#e9a63c;--lab-ok:#4cbf85;--lab-miss:#e07a6e;
--mono:ui-monospace,'SF Mono',Menlo,Consolas,monospace;--sans:'Segoe UI',system-ui,-apple-system,sans-serif}
*{box-sizing:border-box}
body{margin:0;font-family:var(--sans);color:var(--lab-ink);direction:ltr;text-align:left;
background:radial-gradient(120% 80% at 82% -10%,rgba(233,166,60,.09),transparent 55%),linear-gradient(180deg,var(--lab-bg-2),var(--lab-bg));
min-height:100vh;padding:clamp(18px,3vw,40px);line-height:1.55}
h1{margin:0 0 6px;font-size:clamp(21px,2.5vw,29px);letter-spacing:-.01em}
p.s{color:var(--lab-muted);font-size:13.5px;margin:0;max-width:110ch}
p.s b,.note b,.cap b{color:var(--lab-ink)}
code{font-family:var(--mono);font-size:.87em;background:rgba(148,163,194,.13);padding:1px 5px;border-radius:5px}
section{margin-top:clamp(30px,4vw,54px);border-top:1px solid var(--lab-line);padding-top:clamp(18px,2.4vw,28px)}
h2{margin:0 0 6px;font-size:clamp(16px,1.9vw,21px)}
h2 .n{font-family:var(--mono);color:var(--lab-accent);margin-right:9px;font-size:.78em}
.row{display:flex;flex-wrap:wrap;gap:clamp(16px,2.2vw,28px);align-items:flex-start;margin-top:20px}
.col{display:flex;flex-direction:column;gap:9px;width:300px}
.cap{font-size:11.5px;color:var(--lab-muted);margin:0}
.cap>b:first-child{display:block;font-size:12.5px;margin-bottom:3px}
.phone{width:300px;height:660px;border-radius:24px;overflow:hidden;border:1px solid var(--lab-line-2);
box-shadow:0 24px 60px -30px rgba(0,0,0,.9);background:#000}
.phone.short{height:330px}
.phone iframe{width:411px;height:914px;border:0;transform:scale(.7299);transform-origin:top left;display:block}
.phone.short iframe{height:452px}
.note{margin-top:18px;border-left:3px solid var(--lab-accent);padding:9px 0 9px 14px;
font-size:13px;color:var(--lab-muted);max-width:104ch}
.note.warn{border-color:var(--lab-amber)} .note.bad{border-color:var(--lab-miss)}
.note.good{border-color:var(--lab-ok)}
.tag{display:inline-block;font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;
text-transform:uppercase;padding:2px 7px;border-radius:999px;border:1px solid var(--lab-line-2);color:var(--lab-muted)}
.tag.rec{color:var(--lab-ok);border-color:rgba(76,191,133,.45)}
.tag.no{color:var(--lab-miss);border-color:rgba(224,122,110,.45)}
.tag.now{color:var(--lab-amber);border-color:rgba(233,166,60,.45)}
table{border-collapse:collapse;font-size:12.5px;margin-top:16px;width:100%;max-width:1080px}
th,td{border:1px solid var(--lab-line);padding:7px 10px;text-align:left;vertical-align:top}
th{color:var(--lab-muted);font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em}
td.v{font-family:var(--mono);font-size:11.5px}
.pass{color:var(--lab-ok)} .fail{color:var(--lab-miss)} .warnc{color:var(--lab-amber)}
.rec-t td:first-child{font-weight:700;color:var(--lab-ink);width:210px}
</style>
</head>
<body>

<h1>Dark mode, and what it found in light mode</h1>
<p class="s">
The dark remap was already complete and completely <b>inert</b>: <code>tokens.css</code> carried every
value and nothing in the tree ever set <code>data-theme</code>, so no one had seen it. Setting it on the
running app is what this session did. Two of the remap's own recorded conventions turn out to be wrong
(§3, §4), the trip chrome has an unenumerated dependency on being dark (§7), and auditing both themes
together found <b>four contrast failures in the shipped light theme and none in dark</b> (§5) — each theme
was hiding the other's bug class.
</p>

<section>
<h2><span class="n">§0</span> Recommendations — everything on one page</h2>
<table class="rec-t">
<tr><th>Question</th><th>Recommendation</th><th>Why, in one line</th></tr>
<tr><td>On-fill ink in dark</td><td><span class="tag rec">ship now</span> one <code>--on-fill</code> pair + <code>--on-amber</code></td>
<td>Ten shipped controls are illegible in dark, worst 1.20:1. Generalises the <code>--cta</code>/<code>--cta-text</code> one-off instead of adding a second (rule 8); light mode is byte-identical.</td></tr>
<tr><td>Plan hero in dark</td><td><span class="tag rec">ship now</span> <code>--plan-surface</code>/<code>-2</code></td>
<td><code>--plan-deep</code> is remapped as text and used as a fill, so plan renders the brightest surface in the dark app at 2.16:1 ink. Trip's hero already has surface tokens; plan's should too.</td></tr>
<tr><td>Light-theme text</td><td><span class="tag rec">ship now</span> deepen 3 tokens</td>
<td>Four measured AA failures in the theme that ships today. Scalar darkenings, so hue and saturation are untouched.</td></tr>
<tr><td><code>.nav</code> stays white in dark</td><td><span class="tag rec">ship now</span> <code>color-mix</code> off <code>--card</code></td>
<td>An <code>rgba()</code> literal the hex-only U-08 sweep never looked at. Identical in light.</td></tr>
<tr><td>Theme toggle</td><td><span class="tag rec">ship now</span> 3 rungs, device-local, pre-paint</td>
<td>A server preference cannot be read before first paint, so it would flash; theme is a property of the screen you are holding, not of the person.</td></tr>
<tr><td>Dark boot</td><td><span class="tag rec">ship now</span> ADR-0105's night board</td>
<td>Already designed; one rule. Makes boot→login one continuous surface in dark.</td></tr>
<tr><td>Night map style</td><td><span class="tag rec">ship now</span> import + flip</td>
<td>Authored, Map ID minted, <code>readMapsConfig(env, theme)</code> already takes a theme and <code>Map.tsx</code> latches it at mount, so ADR-0121 §4's no-re-instantiate rule is safe for free.</td></tr>
<tr><td><code>/login</code> + <code>/join</code> theme?</td><td><span class="tag rec">no</span> — and §3b tokenises their inks</td>
<td>They are already at the dark end of the axis; theming means giving them a light state they have never had, and it re-choreographs ADR-0142/0143. Mark the ~21 inks so the next reader can tell deliberate from missed.</td></tr>
<tr><td>Ink on always-dark surfaces</td><td><span class="tag rec">ship now</span> four <code>--on-dark-*</code></td><td>18 distinct hex values across 53 sites doing three jobs. Retires the narrower "mark them <code>fixed:</code>" plan — a token states what a comment could only assert — and generalises the <code>.wp-tzshift.on-dark</code> one-off.</td></tr>
<tr><td>Chrome dependency</td><td><span class="tag rec">ship now</span> tokenise the contract</td>
<td>53 colour declarations assume the chrome is dark and only 4 are marked. Plan mode already hand-wrote a second copy; tokens stop a third.</td></tr>
<tr><td><b>Light trip chrome</b></td><td><span class="tag now">own session</span> — indigo 12% is the answer</td>
<td>Fixes the real complaint (light mode reads half-dark) and keeps the trip hue so mode identity survives. But it touches ADR-0028, ADR-0142/0143 and the two fixed screens — it belongs with the queued <b>Hero 2.0</b> line, not bolted to a theming change.</td></tr>
<tr><td>Light hero</td><td><span class="tag no">no</span> — it stays dark</td>
<td>In light mode darkness is the hero's only prominence mechanism, because amber-as-a-ground was already rejected (ADR-0105). §6 draws the alternative and it inverts the hierarchy.</td></tr>
</table>
</section>

<section>
<h2><span class="n">§1</span> The ration: what makes the board loud when everything is dark</h2>
<p class="s">Light mode makes the board loud by <b>luminance contrast against paper</b> — it is the only dark
thing on screen. Dark mode deletes that mechanism. The remap's stated answer (design-language) is that the
board keeps hierarchy by owning the <i>darkest</i> surface while cards sit on lighter dark ones.</p>
<div class="row">
${F('tripHome', 'light', '', '<b>Light — the reference</b> The board is the only dark surface, and its edge is unmissable.')}
${F('tripHome', 'dark', '', '<b>Dark — the remap as written</b> Board <code>#0A1120</code> on screen <code>#0F1726</code> is <b>ΔL* 2.6</b>, which is not a visible edge. Note the tab bar: it stayed white (§5).')}
${F('tripHome', 'dark', ALL_DARK_FIXES, '<b>Dark — with §3/§4 fixed <span class="tag rec">ships</span></b> The board has no boundary against the body and does not need one: every amber thing on the screen is inside it.')}
</div>
<div class="note"><b>What the render corrected.</b> design-language says the board "owns the darkest surface … while
cards sit on lighter dark surfaces". Measured, that step is <b>ΔL* 2.6</b> against <b>84.8</b> in light. It is
real in the token table and does essentially no work on screen.</div>
<div class="note good"><b>What actually carries it: amber density.</b> The clock, the label, the countdown, the
platform numeral, the progress bar, the blip — every amber element is inside the board, so the eye goes there
with no luminance edge involved. The hierarchy <b>inverts</b> rather than weakening: in light the board is the
object and the cards are quiet; in dark the cards are the objects and the board is the field they sit above.
That is closer to what the board is — the thing that speaks, not a thing you pick up.</div>
<div class="note warn"><b>The rule this sharpens.</b> In light a stray amber accent elsewhere is survivable
because the board's darkness still separates it. In dark, <b>amber density IS the ration</b>, so amber spent
anywhere else comes straight out of the board's prominence with nothing to compensate. "Amber = time" stops
being only a semantic rule and becomes a hierarchy rule.</div>
</section>

<section>
<h2><span class="n">§2</span> Mode identity, all four combinations</h2>
<p class="s">ADR-0028 is a non-negotiable: mode must be readable from the chrome alone, before any content, on
at least two channels. Light mode clears that bar by a mile for a reason the rule never names — trip chrome is
<i>dark</i> and plan chrome is <i>light</i>, so the modes differ in <b>luminance</b> before anything else. Dark
mode deletes that channel. Both modes are captured from the running app.</p>
<div class="row">
${F('tripHome', 'light', '', '<b>Trip · light</b> Indigo chrome, amber energy, the pulsing blip.')}
${F('planHome', 'light', '', '<b>Plan · light</b> Light drafting chrome, violet hero, drafting grid, no pulse. Unmistakably a different mode.')}
${F('planHome', 'dark', '', '<b>Plan · dark, AS THE REMAP SHIPS <span class="tag no">defect</span></b> The hero fills from <code>--plan-deep</code>, whose dark value was chosen <i>"used as text — lighter on dark"</i>. It is also a fill. <b>L* 68</b> — the brightest surface in the dark app, in the calm mode, ink at <b>2.16:1</b>.')}
${F('planHome', 'dark', ALL_DARK_FIXES, '<b>Plan · dark, fixed <span class="tag rec">ships</span></b> A deep violet night surface — plan\'s counterpart of the night board. Ink clears <b>12.7:1</b>.')}
</div>
<div class="note bad"><b>The defect is not cosmetic — it inverts mode identity.</b> Trip is supposed to be the
loud mode and plan the calm one. As the remap ships, plan mode is the brightest thing in the app and out-shouts
the trip board completely.</div>
<div class="note good"><b>Why the fix is surface tokens and not a nudged hex.</b> The root cause is an asymmetry:
the board has dedicated surface tokens (<code>--board</code>/<code>--board-2</code>) while the plan hero paints
itself out of the <i>accent</i> tokens. An accent brightens on dark; a surface must not. Giving plan the same
treatment keeps dark mode a token remap and restores the luminance channel the right way round —
<b>trip = near-black with amber inside, plan = a lifted violet slab with white on it</b>.</div>
</section>

<section>
<h2><span class="n">§3</span> The on-fill ink convention is wrong, and it breaks ten controls</h2>
<p class="s"><code>App.css</code> and <code>screens.css</code> both record the same rule from the U-08 sweep:
<i>"ink that rides a semantic FILL — the fill re-maps, the on-fill ink must not."</i> True for a fill that keeps
its <b>polarity</b> (<code>--amber</code> stays light, <code>--indigo</code> stays dark); false for every
mid-tone one, because those were brightened for text legibility and white ink then stops working.</p>
<table>
<tr><th>Site</th><th>Fill</th><th>Light</th><th>Dark, today</th><th>Dark, fixed</th></tr>
<tr><td class="v">.choice-pill.on</td><td class="v">--ink</td><td class="pass">15.65</td><td class="fail">1.20 white on near-white</td><td class="pass">13.49</td></tr>
<tr><td class="v">.wp-event-check · .bld-settle.done</td><td class="v">--ok</td><td class="pass">3.48</td><td class="fail">2.31</td><td class="pass">7.03</td></tr>
<tr><td class="v">.wp-placebadge-mark · .wp-event-act.go:hover</td><td class="v">--teal</td><td class="pass">3.35</td><td class="fail">2.56</td><td class="pass">6.34</td></tr>
<tr><td class="v">.hdr-sync-badge</td><td class="v">--muted</td><td class="pass">4.68</td><td class="fail">2.64</td><td class="pass">6.16</td></tr>
<tr><td class="v">.confirm[danger] · 2 more</td><td class="v">--miss</td><td class="pass">4.38</td><td class="fail">2.93</td><td class="pass">5.55</td></tr>
<tr><td class="v">.gapfill-new · 7 more</td><td class="v">--plan</td><td class="pass">5.17</td><td class="warnc">3.50</td><td class="pass">4.64</td></tr>
</table>
<div class="note good"><b>One pair, generalised from the one that already existed.</b> Rule 8 says extend the
one-off doing this job rather than adding a second. That one-off is <code>--cta</code>/<code>--cta-text</code> —
ADR-0028 already wrote <i>"CTA is a pair … they flip together (dark: light button, dark text)"</i> and then
applied it to exactly one token. <code>--on-fill</code> is that same ink named for every fill:
<code>#FFFFFF</code> light, <code>#12203A</code> dark. <code>--cta-text</code> becomes an alias.
<code>--on-amber</code> takes the other case — the fill that is light in <i>both</i> themes, so its ink stays
dark in both.</div>
<div class="note warn"><b>The fill that must NOT join the family:</b> <code>--indigo</code>. It is always-dark
chrome, so it keeps light ink in both themes — dark ink on it measures <b>1.01:1</b>. Two different rules were
written down as one, which is exactly how this shipped.</div>
</section>

<section>
<h2><span class="n">§3b</span> The bigger half of the same fold: ink on an always-dark surface</h2>
<p class="s">Following the chrome sweep out to every always-dark surface — the board, the indigo chrome, the day
strip, <code>/login</code>, <code>/join</code>, the ticket, the trip hero, the plan hero, the zero-state head —
there are <b>53 light-ink declarations carrying 18 distinct hex values, doing three jobs</b>. This is ADR-0082's
argument in a different channel: the type ramp drifted to 11.5/12.5/13.5/15/16/19px because it lived only in
prose, and the fix was to put the ramp in the CSS.</p>
<table>
<tr><th>Token</th><th>Value</th><th>Job</th><th>Folds these</th><th>Sites</th></tr>
<tr><td class="v">--on-dark-strong</td><td class="v">#FFFFFF</td><td>titles, the loud numeral</td><td class="v">#fff</td><td>15</td></tr>
<tr><td class="v">--on-dark</td><td class="v">#EAF0FF</td><td>body ink on a dark surface</td><td class="v">#eef2fb #eaf0ff #e4ebf8 #dfe6f5 #dce3f2 #cdd8ef</td><td>12</td></tr>
<tr><td class="v">--on-dark-dim</td><td class="v">#93A2C4</td><td>secondary / labels</td><td class="v">#c3cee8 #b9c4de #aeb9d4 #9fb0d2 #9daac8 #93a2c4 #8ea1c6 #8fa0c4 #8494b5</td><td>22</td></tr>
<tr><td class="v">--on-dark-faint</td><td class="v">#7688AC</td><td>tertiary</td><td class="v">#7e8fb4 #7688ac</td><td>3</td></tr>
</table>
<div class="note good"><b>This retires §7's "mark the ~21 literals" plan, and it is a better answer.</b> A
<code>fixed:</code> marker is a comment <i>asserting</i> intent; a token named <code>--on-dark-dim</code>
<i>states</i> it, cannot drift, and needs no comment. It also scales past the two screens that prompted the
question — the same 18 values are in the board, the chrome, the ticket and the day strip.</div>
<div class="note"><b>The one-off to generalise is already in the tree.</b>
<code>ui/zone-shift-pill.css</code> carries <code>.wp-tzshift.on-dark</code> — one component that invented this
exact concept for itself. Rule 8 says generalise <i>that</i> rather than write a second beside it.
<br><br><b>And the modal value is also the correct one:</b> <code>#93A2C4</code> is the most-used of the nine dim
values (11 sites), and the runtime sweep caught <code>.wp-daypill .l</code> at <b>4.02:1</b> in light —
because the pill's 5% white wash lightens the ground under <code>#8494b5</code>. Folding to
<code>#93A2C4</code> clears it, so the ramp fixes a live failure rather than only tidying.</div>
<div class="note warn"><b>Not folded, deliberately:</b> five amber-ish and two teal-ish inks on the board
(<code>#f0c785</code>, <code>#c9b78a</code>, <code>#b9985c</code>, <code>#7fd8cc</code>, <code>#5ec5b6</code>).
Those are <i>hue-bearing</i> — they are the semantic accents at small sizes on dark, not neutral ink — and folding
them into a blue-grey would spend the budget the wrong way. A luminance-only tiering wanted to; that is the
tiering being wrong, not the values.</div>
</section>

<section>
<h2><span class="n">§4</span> The light theme has four failures of its own</h2>
<p class="s">This was meant to be a dark-mode session. Auditing both themes together inverted the result:
<b>text contrast fails four times in the shipped LIGHT theme and zero times in dark</b> — the remap brightened
everything and fixed them by accident. Symmetrically, on-fill ink fails ten times in dark and zero in light.</p>
<div class="row">
${F('tripHome', 'light', '', '<b>Light, today <span class="tag no">4 failures</span></b> <code>--amber-deep</code> times <b>3.13</b> (needs 4.5) · <code>--muted</code> on the ground <b>3.88</b> · <code>--faint</code> <b>2.18</b>.')}
${F('tripHome', 'light', ALL_FIXES, '<b>Light, corrected <span class="tag rec">ships</span></b> 5.49 · 4.50 · 3.03. Scalar darkenings along the same RGB ray, so hue and saturation are mathematically untouched.')}
<div class="col" style="width:360px">
<p class="cap" style="max-width:none"><b>Why <code>--amber</code> itself is not touched.</b> The signature amber
<code>#E9A63C</code> lives on the dark board at 8.51:1. Only <code>--amber-deep</code> — amber's <i>paper</i>
variant, carrying 10–12.5px bold times across zone chips, leg badges, the glance rail and the tz-shift pill —
moves. The product's signature colour is unchanged and rule 4's budget is untouched: same hue, legible depth.
<br><br><b>And one bug only a real render could catch:</b> <code>.nav</code> is
<code>rgba(255,255,255,.92)</code>. The U-08 sweep converted <i>hexes</i>, so it never saw this, and the tab bar
stays white in dark mode — visible in §1's middle frame.
<br><br><b>The pattern under all of it.</b> Every one of these is <i>a token whose value was chosen for one of
its two roles</i>. <code>--amber-deep</code> was chosen as an accent and used as small text.
<code>--plan-deep</code> was remapped as text and used as a fill. The fix is always the same: give the second
role its own token — which <code>--amber-ink</code> already did once, and nobody generalised.</p>
</div>
</div>
</section>

<section>
<h2><span class="n">§5</span> The chrome assumes it is dark — 53 declarations, 4 marked</h2>
<p class="s">You spotted the avatar still carrying the indigo hue on a light chrome. It is not alone. Sweeping
every colour declaration on a trip-chrome surface finds <b>53</b>, of which only <b>4</b> carry a
<code>fixed:</code> marker. They are not wrong today — they are correct <i>given a dark chrome</i>, and nothing
records that dependency.</p>
<table>
<tr><th>What</th><th>Declaration</th><th>Breaks on a light chrome because…</th></tr>
<tr><td>Avatar overlap ring</td><td class="v">.av { border: 2px solid var(--indigo) }</td><td>a dark ring meant to separate avatars <i>on</i> the dark bar becomes a hard navy outline on paper — the one you saw</td></tr>
<tr><td>Your own avatar</td><td class="v">.av.is-me { box-shadow: 0 0 0 2px var(--indigo), … }</td><td>same, doubled</td></tr>
<tr><td>Sync badge</td><td class="v">.hdr-sync-badge { border: 2px solid var(--indigo) }</td><td>same</td></tr>
<tr><td>Trip pill, swap, mode switch</td><td class="v">background: rgba(255,255,255,.08–.16)</td><td>a white wash is invisible on white</td></tr>
<tr><td>Day pills + month divider</td><td class="v">rgba(255,255,255,.05–.2) · #8494b5 · #b9c4de</td><td>washes vanish; the dim blues fall under contrast</td></tr>
<tr><td>Chrome ink</td><td class="v">.mode-chrome { color: #fff }</td><td>white on paper</td></tr>
</table>
<div class="note good"><b>The good news, and it decides the shape of the fix: plan mode already solved every one
of these.</b> When plan's chrome went light it re-specified the lot —
<code>.app[data-mode='plan'] .av { border-color: var(--card) }</code> is literally the fix for the ring you
spotted, and there are eight more beside it. So a light trip chrome is not new design. But hand-writing it
would be the <b>third</b> copy of "how chrome children look on a given ground", which is the shape rule 8 exists
to stop — and ADRs 0078, 0079, 0094 and 0095 all exist only to undo copies that piled up like this.</div>
<div class="note"><b>So the fix is to give the chrome a token contract</b> — five names
(<code>--chrome-bg</code>, <code>--chrome-ink</code>, <code>--chrome-ink-dim/-mid</code>,
<code>--chrome-wash</code>/<code>-2</code>, <code>--chrome-ring</code>) set once per mode. Trip-dark keeps
exactly today's values, plan-light collapses to setting the same five, and the light-chrome option in §6 then
costs <b>seven lines instead of nineteen rules</b>. This is worth doing whether or not §6 ever ships, because it
is what makes the dependency <i>recorded</i> instead of rediscovered.</div>
</section>

<section>
<h2><span class="n">§6</span> The light chrome — the open question</h2>
<p class="s">Light mode is ~220px of dark chrome above a dark hero, so it reads as half dark-mode. Four renders
established that the <b>hero is load-bearing</b> (lighten it and the chrome inherits the prominence, inverting
the hierarchy) and the <b>chrome is what looks out of place</b>. These are the grounds, all on the tokenised
contract from §5, hero untouched.</p>
<div class="row">
${F('tripHome', 'light', ALL_FIXES + CHROME_TOKENS + ground('var(--paper)'), '<b>1 · warm cream <span class="tag no">the yellow</span></b> Cream ground + amber day pill + amber hero accents stack into one yellow field. Also spends <code>--paper</code> ("warm badge accent") on a whole surface.', { short: 1 })}
${F('tripHome', 'light', ALL_FIXES + CHROME_TOKENS + ground('var(--screen)'), '<b>2 · cool paper</b> Calm and not yellow, but no trip hue left in the chrome at all — the mode-identity cost in its purest form.', { short: 1 })}
${F('tripHome', 'light', ALL_FIXES + CHROME_TOKENS + P_LIGHTCHROME, '<b>3 · indigo 12% <span class="tag rec">recommended</span></b> Light, cool, and still visibly the <b>trip blue</b> — keeps ADR-0028\'s hue channel while dropping the luminance one.', { short: 1 })}
${F('tripHome', 'light', ALL_FIXES + CHROME_TOKENS + ground('color-mix(in srgb, var(--indigo) 24%, var(--card))'), '<b>4 · indigo 24%</b> Strongest identity read, but it starts to become a third surface competing with the hero — the thing this option exists to stop.', { short: 1 })}
</div>
<div class="note"><b>Recommendation: indigo 12%, and not in this branch.</b> It answers the complaint and keeps
the trip hue, so trip-vs-plan stays a blue-vs-violet contrast at equal lightness rather than losing its second
channel. But it moves a surface that ADR-0028 names as mode identity, that ADR-0142's trip birth animates
(indigo → violet) and that ADR-0143's invite pass is choreographed against, and it makes the two theme-fixed
dark screens in §7 <i>more</i> anomalous, not less. The backlog already has a <b>Hero 2.0</b> line for
redesigning this exact region; this belongs there, with plan mode re-checked on a device.</div>
<div class="note warn"><b>What is still unverified, stated plainly.</b> These are Chromium renders at 411×914,
not a phone. ADR-0125 is this repo's own precedent for a palette that measured fine and read as one hue on real
glass, and the map epic has had four device corrections of things that were derived, tested and wrong.</div>
</section>

<section>
<h2><span class="n">§7</span> <code>/login</code> and <code>/join</code> — theme-fixed, and marked</h2>
<p class="s">Both are full-screen departure boards today, deliberately: the pre-login brand impression, and
design-language's one stated exception to the ration. Their ground is
<code>--board-2</code>&nbsp;→&nbsp;<code>--board</code>, which <i>does</i> re-map, so they already shift by a few
L* with no wiring at all.</p>
<div class="row">
${F('login', 'light', '', '<b>/login — light theme</b> The board is the whole field. Nothing paper on this screen for it to be scarce against.')}
${F('login', 'dark', ALL_FIXES, '<b>/login — dark theme <span class="tag rec">ships</span></b> Ground darkened, amber brightened, the ~21 fixed inks stayed. That is the entire delta, and it is correct.')}
<div class="col" style="width:360px">
<p class="cap" style="max-width:none"><b>They do not theme, and the argument is not "there is no preference to
read".</b> A device-local pick <i>is</i> readable on <code>/login</code>, so that argument dissolves. The real
one is that these screens are <b>already at the dark end of the axis</b> — theming them means giving them a
light state they have never had and do not want, and the only other reading ("the ground goes a few L* darker")
is what the tokens already do for free.
<br><br>They are the same surface class as the indigo header, the dormant board and the boarding-pass ticket:
<b>always-dark chrome</b>, every one of which the U-08 sweep already marked. App.css's own header comment
already names "the join/land departure boards" in that list — <b>the decision exists, only the per-declaration
markers are missing</b>. So: mark them, do not tokenise them.
<br><br><b>And the ration is not violated</b>, because it was never app-wide: "max one board surface per
screen". Login has one — itself. Dark Home has one — its hero.</p>
</div>
</div>
</section>

<section>
<h2><span class="n">§8</span> The toggle</h2>
<p class="s"><code>/settings</code> is user-scoped and already exists. ADR-0133 §7 rejected a theme toggle there
in July for one stated reason — <i>"a switch that does nothing is worse than a thin page"</i> — which was true
while the remap was inert and expires the moment it is not.</p>
<div class="row">
${F('settings', 'light', ALL_FIXES, '<b>/settings — light</b> The real page as it ships today; the theme control joins it as a third section.', { short: 1 })}
${F('settings', 'dark', ALL_FIXES, '<b>/settings — dark <span class="tag rec">ships</span></b> Same page, remapped.', { short: 1 })}
<div class="col" style="width:420px">
<p class="cap" style="max-width:none"><b>Three rungs — מערכת / בהיר / כהה — and <code>מערכת</code> is the
default.</b> Two rungs would force a shipped default and a dark-mode phone would open light.
<code>system</code> is also the only honest state for someone who has never chosen, and it must keep
<i>tracking</i>, so the stored value is the <b>pick</b> and the resolved theme is computed from it plus a live
<code>matchMedia</code> listener.
<br><br><b>It stores on the device, and that is the design rather than the shortcut.</b> The theme has to be on
<code>&lt;html&gt;</code> <i>before first paint</i> or the app flashes light — which a server-stored preference
structurally cannot do, since it arrives a round trip after the first frame and would change the theme
<i>after</i> paint. A local store is load-bearing even if a server copy existed, so the server copy would be
pure duplication with a flash attached. It is also the honest model: theme is a property of <b>the screen you
are holding</b> — a phone at night and a laptop in daylight legitimately disagree — where
<code>avatarHue</code>, the stored-preference precedent, is a property of the person.
<br><br><b>Two things that must follow the resolved theme and are easy to miss:</b>
<code>&lt;meta name="theme-color"&gt;</code>, hardcoded <code>#1B2A4A</code> today, which paints the browser's
own chrome bar; and the Map's cloud style, already plumbed for exactly this
(<code>MAP_THEME</code> + <code>readMapsConfig(env, theme)</code>, ADR-0121 §11) — and safe from §4's
no-re-instantiate rule for free, because <code>Map.tsx</code> latches its config at mount.</p>
</div>
</div>
</section>

<script id="app-css" type="text/plain">${css.replace(/<\/script/gi, '<\\/script')}</script>
<script id="app-dom" type="application/json">${JSON.stringify(dom).replace(/</g, '\\u003c')}</script>
<script id="frames" type="application/json">${JSON.stringify(frames).replace(/</g, '\\u003c')}</script>
<script>
const APPCSS = document.getElementById('app-css').textContent;
const DOM = JSON.parse(document.getElementById('app-dom').textContent);
const FRAMES = JSON.parse(document.getElementById('frames').textContent);
// Each frame is its own document, so the app's :root/body rules apply exactly as
// they do in the product instead of leaking onto this page.
for (const f of FRAMES) {
  const host = document.querySelector('[data-frame="' + f.id + '"]');
  if (!host) continue;
  const ifr = document.createElement('iframe');
  ifr.setAttribute('scrolling', 'no');
  host.appendChild(ifr);
  const d = ifr.contentDocument;
  d.open();
  d.write(
    '<!doctype html><html lang="he" dir="rtl"' + (f.theme === 'dark' ? ' data-theme="dark"' : '') +
    '><head><meta charset="utf-8"><style>' + APPCSS +
    '\n/* ---- proposal overlay ---- */\n' + (f.extra || '') +
    '\nhtml,body{margin:0;overflow:hidden}.app{height:914px !important;max-width:none !important}' +
    '</style></head><body>' + DOM[f.key].html + '</body></html>'
  );
  d.close();
}
</script>
</body>
</html>
`;

writeFileSync(join(HERE, 'dark-mode-v1.html'), html);
console.log(
  `wrote mockups/dark-mode-v1.html — ${(html.length / 1024).toFixed(0)}KB, ` +
    `${frames.length} frames, ${APP_CSS.length} css files`,
);
