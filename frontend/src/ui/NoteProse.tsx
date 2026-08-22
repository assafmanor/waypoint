// **A note's words, rendered** (ADR-0202 §4/§6) — the paint half of `lib/note-markdown.ts`.
//
// The parser decides what a marker means and this decides nothing except which element
// carries it, which is why every rule worth arguing about is unit-tested over there without a
// renderer. What is left here is two props, and both of them are facts about the SURFACE
// rather than preferences:
//
//   • `dense` — this is a section inside a card that also holds facts and verbs, not a screen.
//     Same renderer, one size step down and tighter block gaps: a card section is not a
//     document.
//   • `anchors={false}` — **the body it lands in is itself a `<button>`.** Both row bodies are
//     (`.wp-listrow-open` on the notes screen, `.note-item-b` on a host), and ADR-0153 §8
//     already refused a second tap target inside one: "at ~16px inside a row whose whole width
//     is one open target, a second tappable thing is a mistap, not an affordance" — which is
//     why §5b put the note's own url in the FOOT. A url found in prose gets the same answer,
//     and it gets it honestly: no `--cta`, no underline, nothing promising a tap that cannot
//     happen. Tappable one surface up, where the body is a plain div — which is the full
//     screen's second reason to exist.
//
// It also cannot nest an `<a>` inside a `<button>`, so `anchors={false}` is a correctness
// requirement and not only a design one.
import { type ReactNode } from 'react';
import { baseDirection, ltrIsolate } from '../lib/bidi';
import { parseNoteMarkdown, type NoteBlock, type NoteInline } from '../lib/note-markdown';
import './notes.css';

export function NoteProse({
  body,
  dense = false,
  anchors = true,
}: {
  body: string;
  /** A host's section rather than the note's own screen. */
  dense?: boolean;
  /** False where this renders inside a `<button>` — see the header. */
  anchors?: boolean;
}) {
  const blocks = parseNoteMarkdown(body);
  return (
    // **NOT `dir="auto"`, and that was a shipped defect** (owner, 2026-08-22). `auto` resolves
    // from the first strong character, so a Hebrew note opening with `TL;DR` laid its every
    // line out left to right — 26 Hebrew letters against 14 Latin, and the `T` decided. What a
    // block of prose needs is a direction derived from what the prose IS, which is
    // `baseDirection`. Undefined for a note with no letters at all, and then no attribute at
    // all: it inherits the page's RTL, exactly as the notes screen's row already does.
    //
    // Still never `dir="ltr"` (lint-blocked, ADR-0118) — this resolves to `rtl` or `ltr` from
    // the content, which is a different thing from forcing one.
    <div className={'note-prose' + (dense ? ' dense' : '')} dir={baseDirection(body)}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} anchors={anchors} />
      ))}
    </div>
  );
}

function Block({ block, anchors }: { block: NoteBlock; anchors: boolean }): ReactNode {
  const runs = (inlines: NoteInline[]) => <Runs runs={inlines} anchors={anchors} />;
  switch (block.kind) {
    case 'rule':
      return <hr />;
    // `h3`/`h4` rather than `h1`/`h2`: a heading INSIDE a note is a section of a sentence, and
    // the note's own title is the h1 of this surface. Two levels, because the parser folds
    // everything deeper into the second (ADR-0202 §4).
    case 'heading':
      return block.level === 1 ? <h3>{runs(block.children)}</h3> : <h4>{runs(block.children)}</h4>;
    case 'quote':
      return <blockquote>{runs(block.children)}</blockquote>;
    case 'list':
      return block.ordered ? (
        <ol start={block.start}>
          {block.items.map((item, i) => (
            <li key={i}>{runs(item)}</li>
          ))}
        </ol>
      ) : (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>{runs(item)}</li>
          ))}
        </ul>
      );
    case 'paragraph':
      return (
        <p>
          {block.lines.map((line, i) => (
            // The authored break, as a break (ADR-0152 §6b). A `<br />` rather than
            // `white-space: pre-wrap` on the paragraph, because the lines are already
            // separate in the AST and pre-wrap would also preserve the indentation of a
            // pasted list that the parser has already turned into an `<ol>`.
            <span key={i}>
              {i > 0 && <br />}
              {runs(line)}
            </span>
          ))}
        </p>
      );
  }
}

function Runs({ runs, anchors }: { runs: NoteInline[]; anchors: boolean }): ReactNode {
  return runs.map((run, i) => {
    switch (run.kind) {
      case 'text':
        return run.text;
      case 'strong':
        return (
          <strong key={i}>
            <Runs runs={run.children} anchors={anchors} />
          </strong>
        );
      case 'em':
        return (
          <em key={i}>
            <Runs runs={run.children} anchors={anchors} />
          </em>
        );
      // The `mono` decision is the parser's: design-language.md reserves JetBrains Mono for
      // Latin/numeric runs because the face has no Hebrew glyphs, so a Hebrew "code" span
      // keeps the chip and loses the face. `dir="auto"` because a wifi password is stored
      // content the app did not write, and it is the only thing in this element (ADR-0118).
      case 'code':
        return (
          <code key={i} className={run.mono ? undefined : 'note-prose-code-he'} dir="auto">
            {run.text}
          </code>
        );
      case 'link':
        // `dir="auto"`, never `dir="ltr"` (lint-blocked, ADR-0118): the anchor holds the url
        // label and nothing else, and an element carrying `dir` is its own bidi isolate — so
        // a Latin url inside Hebrew prose stops coming apart at the punctuation.
        return anchors ? (
          <a key={i} href={run.href} target="_blank" rel="noopener noreferrer" dir="auto">
            {run.label}
          </a>
        ) : (
          // **Not an element at all.** Where the tap cannot happen, the url is words: an
          // `<a>` inside the row's `<button>` is invalid nesting, and a `<span>` styled to
          // look inert is a control that isn't one. With no element there is nothing to hang
          // a `dir` on, so the run is isolated the way the flattened row's is — `ltrIsolate`,
          // the app's one answer to this (ADR-0118).
          ltrIsolate(run.label)
        );
    }
  });
}
