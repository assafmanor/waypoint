// CodePicker — one searchable sheet over a large standard code set, with the
// relevant candidates surfaced first (ADR-0180 §6).
//
// **Extracted from `ZonePicker`, not written beside it.** ADR-0113 §6 built that
// picker as "one control for every place a zone is chosen"; a currency needs the
// identical control over a different set, and the machinery here — the `Modal`,
// the search field, the suggested/all grouping, the empty state, the
// de-duplication of suggestions against the full list — is entirely
// label-agnostic. Copying it would have produced the second half-built copy this
// repo has undone four times (ADR-0078/0079/0094/0095). So `ZonePicker` and
// `CurrencyPicker` are both thin wrappers over this, and each keeps only what is
// genuinely its own: how a code is labelled, and what a query matches against.
//
// Renders through `Modal`/`useOverlay` like every overlay (never a hand-rolled
// portal, ADR-0090). This is the sheet only; each call site owns its trigger.
import { useMemo, useRef, useState } from 'react';
import { EmptyState } from '../feedback';
import { Modal } from './Modal';
import './code-picker.css';

/** How one code is drawn. Three slots, because both instances need exactly
 *  three: the name you read, the code you might search by, and a short mark. */
export interface CodeRow {
  /** The name a person reads — a city, a currency's name. */
  primary: string;
  /** The code itself, quiet, so searching by it stays legible. */
  secondary: string;
  /** A short trailing mark (an offset, a symbol), mono at the inline end.
   *  Empty or absent omits it — the currency instance uses that for a currency
   *  whose "symbol" is just its code again. */
  trailing?: string;
}

/** Which instance this is. It drives ONE layout variant and nothing else: the
 *  two text columns swap roles between the sets, because a zone is a short name
 *  with a long id (`New York` · `America/New_York`) and a currency is the
 *  reverse (`דירהם של איחוד הנסיכויות הערביות` · `AED`). Rendered with the zone
 *  rule, the currency name wrapped to two lines and then the three-character
 *  code was what got ellipsised — to `A…`. */
export type CodeKind = 'zone' | 'currency';

export function CodePicker({
  kind,
  all,
  suggested = [],
  value,
  onChange,
  onClose,
  row,
  matches,
  copy,
}: {
  kind: CodeKind;
  /** The complete set, from the runtime rather than a curated list. */
  all: readonly string[];
  /** Codes to surface first (the current value is added automatically). */
  suggested?: readonly string[];
  value?: string;
  onChange: (code: string) => void;
  onClose: () => void;
  row: (code: string) => CodeRow;
  /** Does this code match the (already lower-cased, non-empty) query? */
  matches: (code: string, query: string) => boolean;
  copy: {
    title: string;
    searchPlaceholder: string;
    suggested: string;
    all: string;
    noResults: string;
  };
}) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // The candidates shown first: the current value + the passed suggestions,
  // de-duped, kept only if the runtime knows the code (or the list is empty).
  const known = useMemo(() => new Set(all), [all]);
  const top = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const code of [value, ...suggested]) {
      if (code && !seen.has(code) && (known.has(code) || all.length === 0)) {
        seen.add(code);
        out.push(code);
      }
    }
    return out;
  }, [value, suggested, known, all.length]);

  const q = query.trim().toLowerCase();

  // While searching, one flat matched list over everything (suggested included);
  // at rest, the suggested group first, then the full list minus what's above.
  const topSet = useMemo(() => new Set(top), [top]);
  const rest = useMemo(() => all.filter((c) => !topSet.has(c)), [all, topSet]);

  const searching = q.length > 0;
  const shownTop = searching ? [] : top;
  const shownRest = (searching ? [...top, ...rest] : rest).filter((c) => !q || matches(c, q));

  const line = (code: string) => {
    const { primary, secondary, trailing } = row(code);
    return (
      <li key={code}>
        <button
          type="button"
          className={'cp-row' + (code === value ? ' on' : '')}
          onClick={() => onChange(code)}
        >
          <span className="cp-primary">{primary}</span>
          <span className="cp-secondary" dir="auto">
            {secondary}
          </span>
          {trailing ? (
            <span className="cp-trailing" dir="auto">
              {trailing}
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  const empty = shownTop.length === 0 && shownRest.length === 0;

  return (
    <Modal variant="sheet" title={copy.title} onClose={onClose} initialFocusRef={searchRef}>
      <div className="cp-sheet" data-kind={kind}>
        <input
          ref={searchRef}
          className="cp-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.searchPlaceholder}
          aria-label={copy.searchPlaceholder}
        />

        {empty ? (
          <EmptyState title={copy.noResults} />
        ) : (
          <ul className="cp-list">
            {shownTop.length > 0 && (
              <li className="cp-group" aria-hidden="true">
                {copy.suggested}
              </li>
            )}
            {shownTop.map(line)}
            {shownTop.length > 0 && shownRest.length > 0 && (
              <li className="cp-group" aria-hidden="true">
                {copy.all}
              </li>
            )}
            {shownRest.map(line)}
          </ul>
        )}
      </div>
    </Modal>
  );
}
