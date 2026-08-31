// **A note's words, as structure** (ADR-0202 §4) — the app's first content renderer.
//
// Owner ask: paste Markdown into a note and have it read as Markdown, "probably not the
// entirety of the format", and detect links "either way".
//
// **Why this parses to an AST instead of returning nodes or HTML.** Two reasons, and the
// first is the one that decides it:
//
//   • A note is group-visible free text — the same fact that makes `externalHref` refuse
//     `javascript:` (ADR-0153 §5b). Every off-the-shelf Markdown renderer emits an HTML
//     STRING, which reaches the DOM through `dangerouslySetInnerHTML` and therefore needs a
//     sanitizer to be safe on this field. An AST that `ui/NoteProse.tsx` renders as elements
//     has no injection surface to sanitize: the safety is structural, not a dependency.
//   • `frontend/CLAUDE.md`: what a thing LOOKS like is decided in pure `lib/` functions
//     tested without a renderer. The subset's rules are all decisions, so they are all
//     testable here rather than through jsdom.
//
// **Why not a library.** Measured, not waved away: `react-markdown` is 36,023 bytes gzipped
// across 81 packages against this file's 1,437 — arguable, since `maplibre-gl` is already in
// this bundle. What is not arguable is that it does not do the same thing. CommonMark joins a
// single newline into the same paragraph, and [ADR-0152 §6b](../../../docs/decisions/0152-a-note-is-one-entity-with-an-optional-host.md)
// made the composer's newlines **content** on 2026-08-07 — the amendment exists because a
// note typed over two lines read as one and "the reversal looked like it had not shipped".
// So installing a correct renderer would have silently rewritten every note that already
// exists. Getting back to here from there is `remark-breaks`, plus a link renderer overridden
// to reach `externalHref`, plus a sanitizer.
//
// **No lookbehind anywhere in this file.** `(?<!\s)` is the natural way to write "no space
// before the closing marker" and it is unsupported below iOS Safari 16.4 — on a phone-first
// installed PWA (ADR-0017) that is a parser that throws at import time on a real device. Every
// rule below is expressed with `\S`-anchored groups and re-emitted leading characters instead.
import { ltrIsolate } from './bidi';
import { externalHref, prettyUrl } from './external-url';

/** One run inside a line. `link` is already resolved — `href` has been through
 *  `externalHref`, so a renderer never decides whether something is safe to link. */
export type NoteInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: NoteInline[] }
  | { kind: 'em'; children: NoteInline[] }
  /** `mono: false` when the run contains Hebrew — see `MONO_REFUSED`. */
  | { kind: 'code'; text: string; mono: boolean }
  | { kind: 'link'; href: string; label: string };

/** One block. `paragraph` keeps its authored lines SEPARATE, which is the whole divergence
 *  from CommonMark: the renderer puts a break between them. */
export type NoteBlock =
  | { kind: 'paragraph'; lines: NoteInline[][] }
  /** Two levels only, and both are SECTION headings: a note's `title` field is the only h1
   *  it can have (ADR-0202 §4).
   *
   *  **`#` and `##` are the SAME level**, which is the decision and not a shortcut: the subset
   *  spends one size step above the body, and `##` is the level people actually paste — so
   *  folding it to body size would flatten the common case and give the step to the rare one.
   *  `###` and deeper are level 2, i.e. bold at body size, rather than opening a fourth rung
   *  on a 360px phone. */
  | { kind: 'heading'; level: 1 | 2; children: NoteInline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: NoteInline[][] }
  | { kind: 'quote'; children: NoteInline[] }
  | { kind: 'rule' };

/** Hebrew, for the one typographic rule the parser owns. design-language.md reserves
 *  JetBrains Mono for Latin/numeric runs because **the face has no Hebrew glyphs at all** —
 *  Hebrew inside a mono element silently falls back and reads foreign. A wifi password is
 *  exactly what a code span in a travel note is for, and `` `סיסמה` `` is exactly what would
 *  break the rule, so the decision is made per span here rather than trusted at the CSS. */
const MONO_REFUSED = /[֐-׿]/;

// ── Block openers ────────────────────────────────────────────────────────────────────────
/** `#` needs its space: `#טוקיו` is a hashtag somebody typed, not a heading. */
const HEADING = /^(#{1,6})[ \t]+(.*)$/;
const BULLET = /^[-*+][ \t]+(.*)$/;
const ORDERED = /^(\d{1,3})[.)][ \t]+(.*)$/;
const QUOTE = /^>[ \t]?(.*)$/;
const RULE = /^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
/** `- [ ]` loses its box and keeps its words: this app has real tasks (ADR-0196), and a
 *  checkbox that cannot be ticked invites a tap that does nothing. */
const TASKBOX = /^\[[ xX]\][ \t]+/;

// ── Inline runs ──────────────────────────────────────────────────────────────────────────
/** **A bare link needs a scheme, a `www.`, or a path slash.** Without that third condition
 *  `passport.pdf` — a thing travel notes genuinely say — becomes `https://passport.pdf`, and
 *  a bare host somebody MEANS as a link is what the note's own url field is for (ADR-0202 §5).
 *  An email needs an `@` and a dotted domain. Deliberately not detected: a phone number, since
 *  a travel note is full of digit runs and a wrong `tel:` is worse than no link. */
const BARE_LINK =
  '(?:https?:\\/\\/|www\\.)[^\\s<]+' +
  '|[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)+\\/[^\\s<]*' +
  '|[a-z0-9._%+-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)+';

/** An emphasised run, given the marker that must not appear inside it. First and last
 *  character are non-space AND non-marker — the second half of that is what the first draft
 *  left out, and `** ריק **` was then read as an italic `* ריק *`. */
const emphasised = (marker: string) => `[^\\s${marker}](?:[^${marker}\\n]*[^\\s${marker}])?`;

/** A link target, with balanced parens allowed one level deep. `[^)\\s]+` was the first
 *  draft and it stops at the first `)`, so `[x](javascript:alert(1))` handed
 *  `javascript:alert(1` to `externalHref` and left a stray `)` in the prose — which passed a
 *  refusal test for the wrong reason. */
const HREF = '(?:[^()\\s]|\\([^()\\s]*\\))+';

/** One pass, and the ORDER of these alternatives is load-bearing: a code span wins over
 *  everything inside it, an explicit link wins over a bare one, and emphasis comes last so
 *  it can never eat the `_` in a url — the classic bug in a hand-written renderer.
 *
 *  **`*` and `_` are not the same marker**, which is a real rule and not a nicety. `*` opens
 *  anywhere; `_` may not open straight after a WORD character, because `some_var_name` is one
 *  word and not three.
 *
 *  "Not after a word character" rather than the obvious "after whitespace", and the difference
 *  is Hebrew: a Hebrew prefix attaches with a hyphen (`ו-*נטוי*`, `ו-_נטוי_`), so a
 *  whitespace-only rule means emphasis silently never works in Hebrew prose — which is exactly
 *  what the first two drafts of this file did, once per marker. The class therefore has to
 *  exclude Hebrew letters as well as Latin ones, or `שלום_עולם_` becomes emphasis.
 *
 *  Group map: 1 code · 2 label + 3 href · 4 bare link · 5 strong · 6 `*em*` · 7 lead + 8 `_em_`. */
const NOT_WORD_BEFORE = '(^|[^A-Za-z0-9_\\u0590-\\u05FF])';
const INLINE = new RegExp(
  '`([^`\\n]+)`' +
    `|\\[([^\\]\\n]+)\\]\\((${HREF})\\)` +
    `|(${BARE_LINK})` +
    `|\\*\\*(${emphasised('*')})\\*\\*` +
    `|\\*(${emphasised('*')})\\*` +
    `|${NOT_WORD_BEFORE}_(${emphasised('_')})_`,
  'gi',
);

/** Trailing punctuation belongs to the sentence, not to the url. A closing paren is the
 *  url's only if it opened inside it — `(see example.com/a)` keeps the paren out, while
 *  `example.com/a_(b)` keeps it in. */
function linkCore(run: string): string {
  const tail = /[.,;:!?"'׳״]+$/.exec(run);
  let core = tail ? run.slice(0, -tail[0].length) : run;
  while (
    core.endsWith(')') &&
    (core.match(/\(/g) ?? []).length < (core.match(/\)/g) ?? []).length
  ) {
    core = core.slice(0, -1);
  }
  return core;
}

const text = (value: string): NoteInline[] => (value ? [{ kind: 'text', text: value }] : []);

/** A resolved link, or the author's own words when `externalHref` refuses the scheme —
 *  never a dead link. That is `externalHref`'s own documented contract. */
function link(href: string | null, label: string): NoteInline[] {
  return href ? [{ kind: 'link', href, label }] : text(label);
}

/** One line of inline content. Recurses for emphasis, which terminates because the matched
 *  inner run cannot contain the marker that opened it. */
export function parseNoteInline(source: string): NoteInline[] {
  const out: NoteInline[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  // A fresh regex per call: `INLINE` is `g`-flagged, so sharing `lastIndex` across a
  // recursive call would silently skip the start of the inner run.
  const re = new RegExp(INLINE.source, INLINE.flags);
  while ((match = re.exec(source)) !== null) {
    const [whole, code, label, href, bare, strong, emStar, lead, emUnder] = match;
    out.push(...text(source.slice(last, match.index)));
    if (code !== undefined) {
      out.push({ kind: 'code', text: code, mono: !MONO_REFUSED.test(code) });
    } else if (label !== undefined) {
      out.push(...link(externalHref(href), label));
    } else if (bare !== undefined) {
      const core = linkCore(bare);
      // The reader sees `prettyUrl`'s label and the tap keeps everything — the two are
      // deliberately different strings, and this is the same pair `.note-open-url` uses.
      out.push(...link(externalHref(core), prettyUrl(core)));
      out.push(...text(bare.slice(core.length)));
    } else if (strong !== undefined) {
      out.push({ kind: 'strong', children: parseNoteInline(strong) });
    } else {
      // `_em_` carries the character that let it open; `*em*` has none to give back.
      out.push(...text(lead ?? ''));
      out.push({ kind: 'em', children: parseNoteInline(emStar ?? emUnder ?? '') });
    }
    last = match.index + whole.length;
  }
  out.push(...text(source.slice(last)));
  return out;
}

/** Does this line open a block of its own? Used to decide where a paragraph stops, so the
 *  question is asked in one place rather than repeated in the loop's condition. */
const opensBlock = (line: string): boolean =>
  RULE.test(line) ||
  HEADING.test(line) ||
  BULLET.test(line) ||
  ORDERED.test(line) ||
  QUOTE.test(line);

/** The subset, parsed. Blank lines separate blocks; a single newline inside a paragraph is a
 *  BREAK and not a space (ADR-0152 §6b, and the reason a library is not a drop-in). */
export function parseNoteMarkdown(source: string): NoteBlock[] {
  const lines = source.split('\n');
  const blocks: NoteBlock[] = [];
  let i = 0;
  const item = (line: string): NoteInline[] => parseNoteInline(line.replace(TASKBOX, ''));

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length <= 2 ? 1 : 2,
        children: parseNoteInline(heading[2]),
      });
      i += 1;
      continue;
    }
    if (BULLET.test(line)) {
      const items: NoteInline[][] = [];
      // `RULE` first: `---` also matches `BULLET`, and a rule between two bullets is a rule.
      while (i < lines.length && !RULE.test(lines[i]) && BULLET.test(lines[i])) {
        items.push(item(BULLET.exec(lines[i])![1]));
        i += 1;
      }
      blocks.push({ kind: 'list', ordered: false, start: 1, items });
      continue;
    }
    if (ORDERED.test(line)) {
      // A list pasted from the middle of somebody else's note starts at 3, and saying 1
      // would renumber their instructions.
      const start = Number(ORDERED.exec(line)![1]);
      const items: NoteInline[][] = [];
      while (i < lines.length && ORDERED.test(lines[i])) {
        items.push(item(ORDERED.exec(lines[i])![2]));
        i += 1;
      }
      blocks.push({ kind: 'list', ordered: true, start, items });
      continue;
    }
    if (QUOTE.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        rows.push(QUOTE.exec(lines[i])![1]);
        i += 1;
      }
      // A quote's own wrapped lines rejoin: the `>` marks the block, not the breaks.
      blocks.push({ kind: 'quote', children: parseNoteInline(rows.join(' ')) });
      continue;
    }
    const paragraph: NoteInline[][] = [];
    while (i < lines.length && lines[i].trim() && !opensBlock(lines[i])) {
      paragraph.push(parseNoteInline(lines[i]));
      i += 1;
    }
    blocks.push({ kind: 'paragraph', lines: paragraph });
  }
  return blocks;
}

/** **The same words with their markers peeled**, for a surface that CLAMPS (ADR-0202 §6):
 *  the notes screen's row, where `## מסעדות` inside a two-line preview is noise and the words
 *  under it are what the reader is scanning for. Plain text, and the newlines stay — the row
 *  honours them (`.note-body-line` is `pre-wrap`), and the clamp counts rendered lines either
 *  way, so this costs the row nothing.
 *
 *  It shortens urls too, which is not cosmetic: raw, a pasted link put `Google:` on one line
 *  and `/www.tabelog.com/tokyo/A1303` on the next — the owner's own 2026-08-02 complaint
 *  ("really long links look very ugly") arriving on a different surface. The isolate is
 *  required rather than tidy: this lands in a text node with no element to carry a `dir`, and
 *  a Latin run inside Hebrew prose comes apart without one (ADR-0118).
 *
 *  Derived from the AST rather than by a second set of regexes over the source — a peel and a
 *  render that disagree about what a marker is would be two answers to one question. */
export function flattenNoteMarkdown(source: string): string {
  return parseNoteMarkdown(source)
    .map(flattenBlock)
    .filter((block) => block !== null)
    .join('\n')
    .trim();
}

function flattenBlock(block: NoteBlock): string | null {
  switch (block.kind) {
    // A rule carries no words, and a `---` printed into a two-line preview spends one of them.
    case 'rule':
      return null;
    case 'heading':
      return flattenInline(block.children);
    case 'quote':
      return flattenInline(block.children);
    case 'list':
      return block.items.map(flattenInline).join('\n');
    case 'paragraph':
      return block.lines.map(flattenInline).join('\n');
  }
}

function flattenInline(runs: NoteInline[]): string {
  return runs
    .map((run) => {
      switch (run.kind) {
        case 'text':
        case 'code':
          return run.text;
        case 'strong':
        case 'em':
          return flattenInline(run.children);
        // Through `ltrIsolate`, not by writing U+2066/U+2069 out: it is a pure string
        // helper, so a hand-rolled pair here would be the second copy of the app's one
        // answer to bidi (rule 8, and ADR-0118 is the rule it implements).
        case 'link':
          return ltrIsolate(run.label);
      }
    })
    .join('');
}
