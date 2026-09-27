// **THE STRAGGLERS, ONE AT A TIME** — the sheet the memory cover's `לסמן` opens (ADR-0240 §4,
// epic 4.4).
//
// Plan's archive chooser asks about one row; this asks about each unmarked row in turn, on the
// same `SettleControl` `sheet` density, so the question and its words are the chooser's. The
// list is read live rather than copied at open: an answer takes its row off the recap's list and
// the next one is simply the new first, and an undo from the toast puts a row back where it was.
// The count is latched at open, so `2 מתוך 3` keeps its denominator while the list shrinks.
//
// Presentational, `ui/domain/`: the rows arrive composed and the answers go back up.
import { useEffect, useState } from 'react';
import { DOT_SEPARATOR } from '../../constants';
import { t } from '../../i18n/he';
import type { Straggler } from '../../lib/memory-home';
import { Sheet } from '../Sheet';
import { TitleLabel } from '../TitleLabel';
import { SettleControl } from './SettleControl';
import './list-row.css';

export function StragglersSheet({
  rows,
  onDone,
  onSkip,
  onClose,
}: {
  rows: readonly Straggler[];
  onDone: (straggler: Straggler) => void;
  onSkip: (straggler: Straggler) => void;
  onClose: () => void;
}) {
  const [opened] = useState(rows.length);
  const total = Math.max(opened, rows.length);
  const current = rows[0];

  // The last answer closes the sheet: there is nothing left to ask.
  useEffect(() => {
    if (!current) onClose();
  }, [current, onClose]);
  if (!current) return null;

  const position = total - rows.length + 1;
  const subject = [current.subject, total > 1 && t.planHome.past.settle.progress(position, total)]
    .filter(Boolean)
    .join(` ${DOT_SEPARATOR} `);

  return (
    <Sheet
      title={
        <>
          <TitleLabel title={current.event.title} />
          <span className="wp-row-subject">{subject}</span>
        </>
      }
      onClose={onClose}
    >
      {/* Keyed by the row, so a new question is a new control rather than the last one's. */}
      <SettleControl
        key={current.event.id}
        variant="sheet"
        onDone={() => onDone(current)}
        onSkip={() => onSkip(current)}
      />
    </Sheet>
  );
}
