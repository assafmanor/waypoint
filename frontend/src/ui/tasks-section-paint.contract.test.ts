// @vitest-environment jsdom
// **Every class a host's task section emits has a rule behind it** — a CSS contract test, in
// the idiom `tasks-avatar-size.test.ts` and `notes.contract.test.ts` already set, because the
// whole suite was green while the section's tick rendered as a **white rounded square** on a
// real phone (owner, 2026-08-16: _"what's this tick?? Why is it white? Why not like in the
// mockups?"_).
//
// The cause was not a wrong rule. `.tsk-tick-sec` had **no rule at all**: ADR-0191 §5's
// 2026-08-16 row reversal moved the section's row off `ListRow` and renamed the tick from
// `.tsk-tick`, and the paint stayed behind on the old name. A `<button>` with no CSS renders
// platform chrome, so the control drew a native square with a bare ✓ in it, in both themes,
// on the expanded event card, `BookingSheet`, `DetailSheet`, `DocumentManageSheet`,
// `MaybeManageSheet` and the Map place card at once.
//
// **Nothing could have failed.** `HostTasks.test.tsx` asserts the element, its `aria-pressed`
// and its click; jsdom loads no stylesheet, so a class name is just a string to it. That is
// the general shape this file guards: in a codebase where a `className` is a *claim* that a
// rule exists, only a render or a parse ever checks the claim.
//
// So this parses what the component emits and what the sheets it imports declare, and asserts
// the two agree — which catches the next renamed class without anyone remembering to.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Vite serves the module graph, so `import.meta.url` is an http URL under vitest — read off
// the filesystem relative to the project root instead (the same note `tasks-avatar-size` has).
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
// `TaskTick` is read alongside the section because ADR-0195 moved the tick's `className`
// into it — the section no longer spells `tsk-tick-sec` itself, and the claim this file
// checks travelled with the control rather than disappearing. The same move is why the
// sweep matters more than before: one component now paints on five surfaces.
const source = [read('src/ui/TaskSection.tsx'), read('src/ui/TaskTick.tsx')].join('\n');
// The sheets `TaskSection` imports, and only those: a class it paints from a sheet it does
// not import would be a dependency the component has not declared. `section-head.css` joined
// them in ADR-0192 §1, when the header shape the notes, tasks and documents sections had each
// been spelling separately became one file all three import.
const sheets = ['src/ui/section-head.css', 'src/ui/notes.css', 'src/ui/tasks.css']
  .map(read)
  .join('\n');

/** Comments stripped FIRST, from both sides. This file's own subject is class names, and so
 *  is the prose in those sheets — parsing either in would let documentation satisfy the
 *  assertion that the documentation is about. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const cssBare = strip(sheets);
const tsxBare = strip(source);

/** Every class name that appears anywhere in a selector — as its own rule, as a descendant,
 *  or compounded onto another. `.tsk-due.late` declares `late`; `.note-sec-h .t` declares
 *  `t`. What matters is only that the sheet has SOMETHING to say about the name. */
const declared = new Set(
  [...cssBare.matchAll(/(^|\})\s*([^{}@]+?)\s*\{/gm)]
    .flatMap((m) => [...m[2].matchAll(/\.([a-zA-Z][\w-]*)/g)])
    .map((m) => m[1]),
);

/** Every class name the component puts in the DOM: each `className=` value, every quoted
 *  run inside it, split on whitespace. Template expressions contribute their literal halves,
 *  which is exactly how `'note-sec tsk-sec' + (quiet ? ' tsk-sec-quiet' : '')` is read. */
const emitted = new Set(
  [
    ...[...tsxBare.matchAll(/className=(?:"([^"]*)"|\{([\s\S]*?)\}\s*(?=\n|>|\/>))/g)].flatMap(
      ([, plain, expr]) =>
        plain != null ? [plain] : [...(expr ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]),
    ),
    // ...plus a class held in a per-variant MAP rather than at the `className`, which is how
    // `TaskTick` spells its two densities (`Record<TickDensity, string>` — the convention
    // `frontend/CLAUDE.md` asks for, so that a third density is a compile error rather than a
    // silent default). Without this the tick's own class names became invisible to the very
    // sweep that exists because a tick shipped unpainted, which is the failure mode named at
    // the top of this file arriving by a new route.
    ...[...tsxBare.matchAll(/^\s*[\w'"-]+:\s*'([a-z][\w-]*)',?$/gm)].map((m) => m[1]),
  ]
    .flatMap((run) => run.split(/\s+/))
    .filter((c) => /^[a-z][\w-]*$/.test(c)),
);

/** Names this component wears but does NOT own the paint of. Each one is a claim that some
 *  other sheet declares it, so each is asserted below rather than merely waved through. */
const ELSEWHERE: Record<string, string> = {
  'visually-hidden': 'src/App.css',
};

/** **Classes that exist to be SELECTED, never painted** — and the distinction is the whole
 *  value of the sweep, because a name with no rule is a defect in one category and the design
 *  in the other. Each of these is a hook a rule or a spec reaches for:
 *
 *   • `tsk-sec` disambiguates the two sections that share `.note-sec`'s geometry, which is
 *     what `querySelector('.note-sec:not(.tsk-sec)')` means in four shipped specs — and the
 *     collision it prevents shipped for real when the Map card's positional grid matched both
 *     (ADR-0191 §7).
 *   • the two `*-sec-list` names are the element a host can make the scrolling part while its
 *     header stays put (`NoteSection`'s own comment; `screens/map.css` names one).
 *
 *  If one of these ever grows paint, delete its entry — it is a claim about the sheet either
 *  way, which is why they are listed rather than filtered out by a pattern. */
const STRUCTURAL = new Set(['tsk-sec', 'note-sec-list', 'tsk-sec-list']);

/** **The one knowingly-dead class, and this entry is its record.** `quiet` is a prop on this
 *  component whose only effect is to add `tsk-sec-quiet`, and ADR-0191 §7 describes what it
 *  should do — the header drops to the form's field-label weight, the `＋` loses its `--cta`
 *  ink. That CSS was never written, so the prop does nothing at either of its two call sites
 *  (`EventForm`, `BookingSheet`). It is deliberately NOT cured here: the owner's 2026-08-16
 *  report asks for the notes section to match the tasks section's **full-strength** look, so
 *  whether a form wants a quieter density at all is a live design question and not a paint
 *  bug. On `docs/backlog.md`; delete this entry when it is answered either way. */
const KNOWN_UNPAINTED = new Set(['tsk-sec-quiet']);

describe('a host task section paints every class it emits', () => {
  it('reads a plausible set out of both files', () => {
    // A regex that silently matched nothing would make every assertion below vacuous.
    expect(emitted.size).toBeGreaterThan(10);
    expect(declared.size).toBeGreaterThan(30);
    expect(emitted).toContain('tsk-tick-sec');
  });

  it('has a rule for every class, or a named reason there is none', () => {
    const orphans = [...emitted].filter(
      (c) => !declared.has(c) && !(c in ELSEWHERE) && !STRUCTURAL.has(c) && !KNOWN_UNPAINTED.has(c),
    );
    expect(orphans, `no rule in notes.css/tasks.css for: ${orphans.join(', ')}`).toEqual([]);
  });

  it('finds the borrowed names in the sheets they were claimed from', () => {
    for (const [cls, file] of Object.entries(ELSEWHERE)) {
      expect(strip(read(file)), `${cls} not in ${file}`).toContain(`.${cls}`);
    }
  });

  // The specific regression, stated as itself as well as by the sweep above: a reader who
  // breaks one of these has changed what "done" looks like, not merely a number.
  it('draws the section tick as a circle in a square hit box, not a bare button', () => {
    // The selector must START the rule: `.tsk-tick-sec {` also occurs INSIDE the shared
    // `.tsk-tick,\n.tsk-tick-sec {` group, so a plain `indexOf` reads the SHARED block and
    // then reports the single-class one as missing declarations it does have. A comma before
    // the match is exactly the "this is the tail of a group" signal.
    const block = (selector: string) => {
      let i = -1;
      for (let at = cssBare.indexOf(`\n${selector} {`); at > -1;) {
        if (cssBare[at - 1] !== ',') {
          i = at + 1;
          break;
        }
        at = cssBare.indexOf(`\n${selector} {`, at + 1);
      }
      expect(i, `${selector} missing`).toBeGreaterThan(-1);
      return cssBare.slice(i, cssBare.indexOf('}', i));
    };
    // Shared with `.tsk-tick`, which is the point — two ticks that do not share their rules
    // are two ticks that will disagree about `--ok` (ADR-0139's build log, one control over).
    expect(cssBare).toContain('.tsk-tick,\n.tsk-tick-sec {');
    expect(block('.tsk-tick,\n.tsk-tick-sec')).toContain('background: none');
    // 44px box, laid out at its ink by the negative margin, so ADR-0017's floor costs the
    // row no height. `border-radius: 12px` and not `50%`: ADR-0188 §2 measured that a circular
    // radius clips the HIT region too, dropping the corners through to whatever is beneath.
    expect(block('.tsk-tick,\n.tsk-tick-sec')).toContain('width: 44px');
    expect(block('.tsk-tick,\n.tsk-tick-sec')).toContain('border-radius: 12px');
    expect(block('.tsk-tick-sec')).toContain('--tick-ink: var(--sec-tick');
    // The circle itself, and the fill that says done. `--ok` is the status mini-palette's
    // (rule 4) and is the only colour either density spends.
    expect(block('.tsk-tick::before,\n.tsk-tick-sec::before')).toContain('border-radius: 50%');
    expect(
      block(".tsk-tick[aria-pressed='true']::before,\n.tsk-tick-sec[aria-pressed='true']::before"),
    ).toContain('background: var(--ok)');
  });
});
