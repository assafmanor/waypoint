// **One journey, drawn as one object with parts** (ADR-0203 §1–§3, §9) — the schedule's
// counterpart to `RouteField`, over the same points.
//
// `RouteField` collects a journey's PLACES on `מה ואיפה`; this collects its TIMES on `מתי`,
// off the same route. Two steps, one spine, and the continuity is the point: the rail you
// filled with places is the rail you fill with clocks.
//
// **The shape is `day-join.css`'s `.journey`, and that is deliberate reuse rather than a
// resemblance.** That block's own words: *"One object with parts… a connection is not a mark
// BETWEEN two cards, it is the inside of one thing."* The day view already draws a journey
// with a stop that way, with `ConnectionBand` stating the wait — so the authoring surface
// draws it the same way and states the wait WHILE you type it, which is something no pair of
// steps can do. ADR-0192 §3's rule: the app must not teach one order for authoring and
// another for reading.
//
// What is new here is a rail and two controls. Everything inside a node is shipped:
// `.wf-line` is ADR-0177's prose-with-tappable-values, the date is `DateField` wearing
// `vt vt-date`, the clock is `TimeField`, the relative day is a `ValueToken` in the `word`
// tone, the zone is `ZoneChip`, and the layover band is `ConnectionBand` unchanged.
//
// **A filled node summarises to one line** (§9). The controls swap for the line they read
// as; one node stays open. Not `Collapsible` and not a height animation — that primitive
// tweens `max-height`, which is exactly the clip ADR-0155 §4 forbids inside a form step
// (ADR-0152 §6's fixed cap, which truncates silently). This reuses the step primitive's
// POSTURE: swap the content, let the sheet resize, animate no height.
//
// `ui/domain/`: presentational, every value via props.
import { hoursPhrase } from '../../lib/duration';
import { type ResolvedMoment } from '../../lib/journey-days';
import { Icon } from '../Icon';
import { DateField } from '../primitives/DateField';
import { TimeField } from '../primitives/TimeField';
import { ValueToken, tokenClass } from '../primitives/ValueToken';
import { ZoneChip, type ZoneChipProps } from '../primitives/ZoneChip';
import { ConnectionBand } from './DayJoinRow';
import { RouteLabel } from '../RouteLabel';
import { t } from '../../i18n/he';
import { type FieldMark } from '../primitives/useFormErrors';
import { Field } from '../primitives/Field';
import './journey-field.css';

/** One moment a journey asks for: a clock, and the day it lands on. */
export interface JourneyTime {
  /** `HH:MM`, as typed. */
  time: string;
  /** What a human overrode the derived day to, when they did. */
  dayOffset?: number;
}

/** A point on the journey, as the field needs it. */
export interface JourneyNode {
  /** The place's display name, or undefined while it has none. */
  placeName?: string;
  /** What arriving here is called, in this type's words (`נחיתה` / `הגעה`). */
  arriveLabel: string;
  /** What leaving here is called. */
  departLabel: string;
  /** The zone this node's clocks are read in — its own place's (ADR-0107). */
  timeZone: string;
  /** The zone chip, on the journey's outer ends only: an interior stop has a picked place,
   *  which is what an override stands in for (ADR-0107 §6). */
  zone?: ZoneChipProps;
  /** Arriving here. Absent on the journey's first node, which only departs. */
  arrive?: JourneyTime;
  /** Leaving here. Absent on the journey's last node, which only arrives. */
  depart?: JourneyTime;
  /** Refusal marks, per moment (ADR-0150) — the token IS the box now, so a mark lands on
   *  the value that is wrong rather than on a cell holding a wrong value and a fine one. */
  marks?: { date?: FieldMark; arrive?: FieldMark; depart?: FieldMark };
}

export interface JourneyFieldProps {
  nodes: JourneyNode[];
  /** The journey's ONE calendar date — its first departure's (§2). */
  date: string;
  onDateChange: (date: string) => void;
  minDate?: string;
  maxDate?: string;
  /** Every moment already resolved, in journey order: node 0's departure, then for each
   *  later node its arrival and (for an interior one) its departure. The host owns the
   *  derivation so this component never computes a day. */
  resolved: ResolvedMoment[];
  onTimeChange: (nodeIndex: number, which: 'arrive' | 'depart', time: string) => void;
  onDayOffsetChange: (nodeIndex: number, which: 'arrive' | 'depart', offset: number) => void;
  /** Which node is open; every other one summarises (§9). `null` opens all of them, which
   *  is what a single-leg journey wants — there is nothing to summarise. */
  openNodeIndex: number | null;
  onOpenNode: (index: number) => void;
  /** The journey's heading, when it has one — `הלוך` / `חזרה` (ADR-0154 §4). */
  heading?: string;
  /** Said while a seeded return is still an exact mirror, and gone the moment it is not
   *  (§6). One derived sentence rather than a second control. */
  mirrorNote?: string;
  /** A stop's connection word for this transport mode, and the line below which it reads as
   *  short (ADR-0159 §4). Absent → this type has no connections. */
  connection?: { word: string; tightMinutes: number };
  /** Always shown, or only when the day differs from the journey's date. The recommendation
   *  is always; ADR-0203 §2 leaves the call to a device pass. */
  alwaysShowDay?: boolean;
  /** The date suggestion, offered only into an empty date (§5). */
  dateSuggestion?: { label: string; detail?: string; mono?: boolean; onAccept: () => void };
}

/** Where node `i`'s moment sits in the resolved list. The order is the journey's: node 0's
 *  departure, then for each later node its arrival and — if it is interior — its departure.
 *
 *  **Node 0 is index 0, and it needs saying rather than falling out of the arithmetic.** The
 *  first version counted node 0's departure and then indexed from 1, so it could address
 *  every moment except that one and answered 2 for it — which silently made the first leg's
 *  duration read off the wrong pair and render as nothing at all. Caught by the spec that
 *  asserts a leg states its cost. */
const momentIndex = (nodes: JourneyNode[], node: number, which: 'arrive' | 'depart'): number => {
  if (node === 0) return 0;
  let n = 1;
  for (let i = 1; i < node; i++) n += nodes[i].depart ? 2 : 1;
  return which === 'arrive' ? n : n + 1;
};

const dayWord = (offset: number): string =>
  offset === 0 ? t.journey.sameDay : offset === 1 ? t.journey.nextDay : t.journey.plusDays(offset);

export function JourneyField({
  nodes,
  date,
  onDateChange,
  minDate,
  maxDate,
  resolved,
  onTimeChange,
  onDayOffsetChange,
  openNodeIndex,
  onOpenNode,
  heading,
  mirrorNote,
  connection,
  alwaysShowDay = true,
  dateSuggestion,
}: JourneyFieldProps) {
  const lastIndex = nodes.length - 1;

  /** The relative day, as a token. It holds a real value and tapping it changes one, so it
   *  is a `ValueToken` and not a read-out — but the `word` tone, not `time`: the run is a
   *  Hebrew word and the mono face has no Hebrew (`value-token.css` keeps that tone for
   *  exactly this). Amber stays on the clock beside it, where rule 4 puts it. */
  const dayToken = (nodeIndex: number, which: 'arrive' | 'depart', moment: JourneyTime) => {
    const offset = resolved[momentIndex(nodes, nodeIndex, which)]?.dayOffset ?? 0;
    if (!alwaysShowDay && offset === 0) return null;
    return (
      <ValueToken
        kind="word"
        label={t.journey.dayLabel}
        // One tap cycles forward, wrapping — the rare >24h leg is the only reason this is a
        // control at all, so it costs a tap and no panel.
        onClick={() => onDayOffsetChange(nodeIndex, which, (offset + 1) % 3)}
      >
        {dayWord(moment.dayOffset ?? offset)}
      </ValueToken>
    );
  };

  const clock = (nodeIndex: number, which: 'arrive' | 'depart', node: JourneyNode) => {
    const moment = which === 'arrive' ? node.arrive : node.depart;
    if (!moment) return null;
    const mark = which === 'arrive' ? node.marks?.arrive : node.marks?.depart;
    /* **A mark needs the `Field` shell, not a bare line** — found by wiring the form's own
       refusal specs against this component. ADR-0150's caption, its nudge animation and the
       scroll-into-view all hang off that box (`useFormErrors.report` looks the node up in the
       live DOM), so spreading the mark onto a `.wf-line` marked the row and rendered no
       message at all: a refusal that looks delivered and is not, which is the exact failure
       that ADR's session-175 note records once already. `WhenField` wraps every leg the same
       way. */
    return (
      <Field {...mark}>
        <div className="wf-line">
          <TimeField
            value={moment.time}
            onChange={(hhmm) => onTimeChange(nodeIndex, which, hhmm)}
            onClear={() => onTimeChange(nodeIndex, which, '')}
            label={which === 'arrive' ? node.arriveLabel : node.departLabel}
            placeholder={t.whenField.addTime}
          />
          {moment.time && dayToken(nodeIndex, which, moment)}
        </div>
      </Field>
    );
  };

  /** A summarised node: the same rail row with its controls swapped for the line they read
   *  as (§9). The value run is a `ValueToken` at the composite density that primitive
   *  already sanctions — a summarised row is still a CONTROL, and `ValueToken`'s own note
   *  says why that has to look like one: "a tappable thing inside a line has to look
   *  tappable… hence a resting hairline rather than bold text that happens to open a panel."
   *
   *  The place name stays OUTSIDE the token: a place is edited on `מה ואיפה` and a time on
   *  `מתי` (ADR-0192 §3), so the summary makes exactly the editable half tappable. */
  const summary = (nodeIndex: number, node: JourneyNode) => {
    const bits: string[] = [];
    if (nodeIndex === 0 && date) bits.push(t.journey.shortDate(date));
    if (node.arrive?.time) bits.push(node.arrive.time);
    if (node.depart?.time) {
      if (nodeIndex === 0) bits.push(node.depart.time);
      else bits.push(`${node.departLabel} ${node.depart.time}`);
    }
    const wait = waitMinutes(nodeIndex, node);
    if (wait != null) bits.push(`${t.journey.waitShort} ${hoursPhrase(wait)}`);
    const offset =
      resolved[momentIndex(nodes, nodeIndex, node.arrive ? 'arrive' : 'depart')]?.dayOffset ?? 0;
    if (offset > 0) bits.push(dayWord(offset));
    return (
      <div className="wf-line jf-sum-row">
        {node.placeName && <span className="jf-place">{node.placeName}</span>}
        <button
          type="button"
          className={tokenClass('word', { className: 'jf-sum-tok' })}
          onClick={() => onOpenNode(nodeIndex)}
        >
          <span className="visually-hidden">{t.journey.editTimes}</span>
          {bits.join(` ${t.journey.dot} `)}
        </button>
      </div>
    );
  };

  /** The wait at an interior stop: its own two moments, on instants. */
  function waitMinutes(nodeIndex: number, node: JourneyNode): number | null {
    if (nodeIndex === 0 || nodeIndex === lastIndex || !node.arrive || !node.depart) return null;
    const from = resolved[momentIndex(nodes, nodeIndex, 'arrive')];
    const to = resolved[momentIndex(nodes, nodeIndex, 'depart')];
    if (!from || !to || !Number.isFinite(from.at) || !Number.isFinite(to.at)) return null;
    return Math.round((to.at - from.at) / 60_000);
  }

  /** What the leg INTO node `i` cost. */
  const legMinutes = (nodeIndex: number): number | null => {
    if (nodeIndex === 0) return null;
    const previous = nodes[nodeIndex - 1];
    const from = resolved[momentIndex(nodes, nodeIndex - 1, previous.depart ? 'depart' : 'arrive')];
    const to = resolved[momentIndex(nodes, nodeIndex, 'arrive')];
    if (!from || !to || !Number.isFinite(from.at) || !Number.isFinite(to.at)) return null;
    const mins = Math.round((to.at - from.at) / 60_000);
    return mins > 0 ? mins : null;
  };

  return (
    <div className="jf">
      {heading && (
        <div className="jf-head">
          <span>{heading}</span>
          {/* The shared route label, not a hand-built span: it owns the RTL flex layout
              that keeps the origin at the start and the arrow pointing at the destination
              whatever script the names are in, and its `NavArrow` is drawn for RTL rather
              than being a `Bidi_Mirrored` glyph. */}
          <RouteLabel from={nodes[0]?.placeName} to={nodes[lastIndex]?.placeName} />
          {mirrorNote && <span className="jf-mirror">{mirrorNote}</span>}
        </div>
      )}
      {nodes.map((node, i) => {
        const open = openNodeIndex == null || openNodeIndex === i;
        const leg = legMinutes(i);
        const wait = waitMinutes(i, node);
        return (
          <div key={i}>
            {i > 0 && (
              <div className="jf-row jf-seg">
                <span className="jf-rail" aria-hidden="true" />
                <div className="jf-body">
                  {leg != null && (
                    <span className="jf-dur">
                      <Icon name="clock" />
                      <b>{hoursPhrase(leg)}</b>
                    </span>
                  )}
                </div>
              </div>
            )}
            <div
              className={
                'jf-row' +
                (i === 0 ? ' first' : '') +
                (i === lastIndex ? ' last' : '') +
                (i === 0 || i === lastIndex ? ' end' : '') +
                (open ? '' : ' jf-sum')
              }
            >
              <span className="jf-rail" aria-hidden="true">
                <span className="jf-dot" />
              </span>
              <div className="jf-body">
                {open ? (
                  <>
                    <span className="jf-node-lbl">
                      {node.placeName && <span className="jf-place">{node.placeName}</span>}
                      <span>
                        {node.placeName ? `${t.journey.dot} ` : ''}
                        {i === 0 ? node.departLabel : node.arriveLabel}
                      </span>
                    </span>
                    {i === 0 ? (
                      <>
                        <Field {...node.marks?.date}>
                          <div className="wf-line">
                            <DateField
                              className={tokenClass('date', { empty: !date })}
                              format="named"
                              min={minDate}
                              max={maxDate}
                              value={date}
                              onChange={onDateChange}
                            />
                            {node.depart && (
                              <TimeField
                                value={node.depart.time}
                                onChange={(hhmm) => onTimeChange(i, 'depart', hhmm)}
                                onClear={() => onTimeChange(i, 'depart', '')}
                                label={node.departLabel}
                                placeholder={t.whenField.addTime}
                              />
                            )}
                          </div>
                        </Field>
                        {/* **Offered only into an empty date** (§5) — never corrected onto
                            one that has a value, which is the line between offering a day
                            and guessing a commitment (ADR-0171 §1). */}
                        {!date && dateSuggestion && (
                          <div className="jf-offer">
                            <button type="button" onClick={dateSuggestion.onAccept}>
                              {dateSuggestion.label}
                              {dateSuggestion.detail && (
                                <span
                                  className={dateSuggestion.mono ? 'jf-offer-num' : 'jf-offer-word'}
                                >
                                  {dateSuggestion.detail}
                                </span>
                              )}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      clock(i, 'arrive', node)
                    )}
                    {node.zone && <ZoneChip {...node.zone} />}
                    {/* A stop's own departure, under the band that measures the wait. It
                        needs no label of its own: the band above it says what the line
                        below it is, so the node reads as one sentence. */}
                    {i > 0 && i < lastIndex && node.depart && (
                      <>
                        {connection && wait != null && (
                          <ConnectionBand
                            word={connection.word}
                            length={hoursPhrase(wait)}
                            tight={wait < connection.tightMinutes}
                          />
                        )}
                        {clock(i, 'depart', node)}
                      </>
                    )}
                  </>
                ) : (
                  summary(i, node)
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
