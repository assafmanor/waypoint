// The subset's rules, tested where they are decided (ADR-0202 §4). No renderer: every one of
// these is a decision about what a marker MEANS, and `frontend/CLAUDE.md` puts those in pure
// `lib/` functions precisely so they can be asserted without jsdom.
import { describe, expect, it } from 'vitest';
import {
  flattenNoteMarkdown,
  parseNoteInline,
  parseNoteMarkdown,
  type NoteBlock,
  type NoteInline,
} from './note-markdown';

/** The inline runs as a shape a failure message can be read in one line. */
const shape = (runs: NoteInline[]): string =>
  runs
    .map((run) => {
      switch (run.kind) {
        case 'text':
          return run.text;
        case 'code':
          return `code(${run.mono ? 'mono' : 'body'}:${run.text})`;
        case 'link':
          return `link(${run.href}|${run.label})`;
        case 'strong':
          return `b[${shape(run.children)}]`;
        case 'em':
          return `i[${shape(run.children)}]`;
      }
    })
    .join('');

const inline = (source: string) => shape(parseNoteInline(source));
const kinds = (blocks: NoteBlock[]) => blocks.map((b) => b.kind);

describe('blocks', () => {
  // `#` and `##` share the one size step the subset spends — `##` is the level people paste,
  // so giving the step to `#` alone would flatten the common case.
  it('reads the headings a note can have, and folds the deep ones', () => {
    const blocks = parseNoteMarkdown('# אחד\n## שתיים\n### שלוש\n#### ארבע');
    expect(blocks.map((b) => (b.kind === 'heading' ? b.level : null))).toEqual([1, 1, 2, 2]);
  });

  // `#טוקיו` is a hashtag somebody typed. The space is what makes `#` a marker.
  it('needs a space after the hash, so a hashtag stays a hashtag', () => {
    expect(kinds(parseNoteMarkdown('#טוקיו הכי טוב'))).toEqual(['paragraph']);
  });

  it('reads both list markers, and keeps an ordered list starting where it started', () => {
    const [bullets, ordered] = parseNoteMarkdown('- א\n* ב\n+ ג\n\n3. ראשון\n4) שני');
    expect(bullets).toMatchObject({ kind: 'list', ordered: false, start: 1 });
    expect(ordered).toMatchObject({ kind: 'list', ordered: true, start: 3 });
    expect(bullets.kind === 'list' && bullets.items).toHaveLength(3);
  });

  // `---` also matches BULLET, so the rule has to be tested before the bullet or a horizontal
  // rule between two items silently becomes a third item.
  it('does not read a rule between two bullets as a bullet', () => {
    expect(kinds(parseNoteMarkdown('- א\n---\n- ב'))).toEqual(['list', 'rule', 'list']);
  });

  it('drops the checkbox and keeps the words (ADR-0196 owns real tasks)', () => {
    const [list] = parseNoteMarkdown('- [ ] לארוז מתאם\n- [x] דרכון');
    expect(list.kind === 'list' && list.items.map(shape)).toEqual(['לארוז מתאם', 'דרכון']);
  });

  it('joins a quote that wraps, because the marker is the block and not the breaks', () => {
    const [quote] = parseNoteMarkdown('> להגיע לפני\n> אחת עשרה');
    expect(quote.kind === 'quote' && shape(quote.children)).toBe('להגיע לפני אחת עשרה');
  });

  it('separates blocks on a blank line and takes no block from it', () => {
    expect(kinds(parseNoteMarkdown('אחת\n\n\nשתיים'))).toEqual(['paragraph', 'paragraph']);
  });
});

// THE DIVERGENCE, and the reason a library is not a drop-in: ADR-0152 §6b made the
// composer's newlines content, and CommonMark would join these two lines into one.
describe('an authored newline stays a break (ADR-0152 §6b)', () => {
  it('keeps each line of a paragraph separate', () => {
    const [paragraph] = parseNoteMarkdown('הכניסה מהחניון\nלא מהרחוב');
    expect(paragraph.kind === 'paragraph' && paragraph.lines.map(shape)).toEqual([
      'הכניסה מהחניון',
      'לא מהרחוב',
    ]);
  });

  it('stops the paragraph at a line that opens a block', () => {
    const blocks = parseNoteMarkdown('פסקה\n- פריט');
    expect(kinds(blocks)).toEqual(['paragraph', 'list']);
  });
});

describe('inline runs', () => {
  it('reads bold and italic, both markers', () => {
    expect(inline('**חזק** ו-*נטוי* ו-_גם נטוי_')).toBe('b[חזק] ו-i[נטוי] ו-i[גם נטוי]');
  });

  it('leaves an underscore inside a word alone', () => {
    expect(inline('the some_var_name flag')).toBe('the some_var_name flag');
    // The same rule has to hold for Hebrew letters, or the hyphen exception below opens a
    // hole: `שלום_עולם_` is one word with two underscores in it, not emphasis.
    expect(inline('שלום_עולם_')).toBe('שלום_עולם_');
  });

  // THIS WAS BROKEN TWICE, once per marker, and it is invisible in an English fixture: a
  // Hebrew prefix attaches with a hyphen, so "emphasis opens after whitespace" means emphasis
  // never works in Hebrew prose at all.
  it('opens after a Hebrew prefix hyphen, not only after a space', () => {
    expect(inline('ו-*נטוי*')).toBe('ו-i[נטוי]');
    expect(inline('ו-_נטוי_')).toBe('ו-i[נטוי]');
    expect(inline('ה-**חזק**')).toBe('ה-b[חזק]');
  });

  it('needs the emphasis to close on a non-space, so a lone asterisk is text', () => {
    expect(inline('2 * 3 = 6')).toBe('2 * 3 = 6');
    expect(inline('** ריק **')).toBe('** ריק **');
  });

  it('nests, so a link inside bold is still a link', () => {
    expect(inline('**[יובל](https://example.com/a)**')).toBe('b[link(https://example.com/a|יובל)]');
  });
});

// design-language.md: JetBrains Mono is reserved for Latin/numeric runs, because the face has
// no Hebrew glyphs at all. A wifi password is the reason code spans are in the subset; a
// Hebrew word between backticks is the reason the decision is per span.
describe('a code span is monospace only when it can be', () => {
  it('sets mono for a Latin/numeric run', () => {
    expect(inline('`Sakura2026!`')).toBe('code(mono:Sakura2026!)');
    expect(inline('`1408`')).toBe('code(mono:1408)');
  });

  it('refuses mono for a run carrying Hebrew', () => {
    expect(inline('`סיסמה`')).toBe('code(body:סיסמה)');
  });

  // The order of the alternation: a code span wins over everything inside it.
  it('does not read markers inside a code span', () => {
    expect(inline('`**not bold**`')).toBe('code(mono:**not bold**)');
  });
});

describe('links are detected, and the four refusals hold (ADR-0202 §5)', () => {
  it('detects a scheme, a www, and a host with a path', () => {
    expect(inline('www.tabelog.com/tokyo/A1303')).toBe(
      'link(https://www.tabelog.com/tokyo/A1303|tabelog.com/tokyo/A1303)',
    );
    expect(inline('maps.google.com/?q=shinjuku')).toBe(
      'link(https://maps.google.com/?q=shinjuku|maps.google.com?q=shinjuku)',
    );
  });

  // THE DEFECT §7 fixes, seen from this side: without `mailto:` the address becomes HTTP
  // userinfo and the link goes to the domain.
  it('detects an email and reaches it as mail', () => {
    expect(inline('tokyo-stay@example.com')).toBe(
      'link(mailto:tokyo-stay@example.com|tokyo-stay@example.com)',
    );
  });

  // A bare host with no scheme, no `www.` and no path is indistinguishable from a filename,
  // and `passport.pdf` is a thing travel notes say. What someone MEANS as a link goes in the
  // note's url field.
  it('leaves a filename, a time, a price and a phone number as text', () => {
    expect(inline('סרקתי את passport.pdf')).toBe('סרקתי את passport.pdf');
    expect(inline('הצ׳ק-אין ב-17:00')).toBe('הצ׳ק-אין ב-17:00');
    expect(inline('המחיר 12.50')).toBe('המחיר 12.50');
    expect(inline('+81 3-1234-5678')).toBe('+81 3-1234-5678');
  });

  // `externalHref`'s own contract: a refused scheme renders as the author's words, never as
  // a dead link. This is the stored self-XSS the url field already refuses.
  it('renders a refused scheme as the words that were typed', () => {
    expect(inline('[לחצו כאן](javascript:alert(1))')).toBe('לחצו כאן');
  });

  it('leaves the sentence its punctuation', () => {
    expect(inline('באתר example.com/a.')).toBe('באתר link(https://example.com/a|example.com/a).');
    expect(inline('(ראו example.com/a)')).toBe('(ראו link(https://example.com/a|example.com/a))');
  });

  // The reader's label and the tap are deliberately different strings — the href keeps the
  // tracking token, the label does not (`prettyUrl`).
  it('shows the reader a short label and keeps the whole url in the href', () => {
    expect(inline('https://www.instagram.com/reel/DbTc/?igsh=azVi')).toBe(
      'link(https://www.instagram.com/reel/DbTc/?igsh=azVi|instagram.com/reel/DbTc)',
    );
  });

  // Emphasis runs LAST for exactly this reason: `_` is legal in a url.
  it('does not italicise the middle of a url', () => {
    expect(inline('example.com/a_b_c/d')).toBe(
      'link(https://example.com/a_b_c/d|example.com/a_b_c/d)',
    );
  });
});

describe('flattenNoteMarkdown — the clamped surfaces (ADR-0202 §6)', () => {
  const source = [
    '## מסעדות',
    '- **Tabelog** · www.tabelog.com/tokyo/A1303',
    '',
    '---',
    '1. הכניסה מהחניון',
    '> להגיע לפני 11:00',
    'סיסמה `Sakura2026!`',
  ].join('\n');

  it('peels every marker and keeps the words', () => {
    expect(flattenNoteMarkdown(source)).toBe(
      [
        'מסעדות',
        'Tabelog · ⁨tabelog.com/tokyo/A1303⁩',
        'הכניסה מהחניון',
        'להגיע לפני 11:00',
        'סיסמה Sakura2026!',
      ].join('\n'),
    );
  });

  // The row honours newlines (`.note-body-line` is `pre-wrap`) and the clamp counts rendered
  // lines, so keeping them costs nothing and losing them would be the 2026-08-16 defect again.
  it('keeps the authored newlines', () => {
    expect(flattenNoteMarkdown('אחת\nשתיים')).toBe('אחת\nשתיים');
  });

  // A rule has no words, and printing one into a two-line preview spends half of it.
  it('drops a horizontal rule rather than printing it', () => {
    expect(flattenNoteMarkdown('אחת\n\n---\n\nשתיים')).toBe('אחת\nשתיים');
  });

  // The isolate is not decoration: this lands in a text node with no element to carry a
  // `dir`, and a Latin run inside Hebrew prose comes apart without one (ADR-0118).
  // **First-strong, not forced-LTR** (owner, 2026-08-31). The label is whatever the author
  // typed: a Latin url resolves left-to-right either way, and a Hebrew one — `[לחץ כאן](…)`
  // — was being laid out from the wrong end by `ltrIsolate`. `autoIsolate` asks the run.
  it('isolates a url label by its own direction, since no element here carries a dir', () => {
    expect(flattenNoteMarkdown('באתר example.com/a')).toBe('באתר \u2068example.com/a\u2069');
    expect(flattenNoteMarkdown('[לחץ כאן](https://example.com/a)')).toBe('\u2068לחץ כאן\u2069');
  });

  it('answers empty for an empty body rather than throwing', () => {
    expect(flattenNoteMarkdown('')).toBe('');
    expect(flattenNoteMarkdown('\n\n')).toBe('');
  });
});
