import { SHARE_DAYPART, type ShareDaypart } from '@waypoint/shared';

/**
 * **The PDF's Hebrew, and why it is here rather than in `frontend/src/i18n/he.ts`.**
 *
 * ADR-0009 puts product copy in the frontend and this repo keeps it there — but the PDF is
 * rendered on the server, by a Node process that cannot import a React app's i18n module,
 * and the paper has to be in Hebrew for the same people the screen is. So the print
 * renderer is a second locale consumer. That is the constraint, not a preference.
 *
 * **It is deliberately not guarded by a cross-package test.** The obvious one — import
 * `frontend/src/i18n/he.ts` here and assert the daypart words match — makes the backend's
 * own `tsc` build reach across the workspace, which it refuses (TS2835) and should: a
 * server that cannot compile without the React app is a worse problem than two copies of
 * six words. What keeps this honest instead is that it is the ONLY Hebrew in the backend
 * and it is all in this one file, so renaming a daypart on screen means changing exactly
 * one other place, named here.
 *
 * Everything that is *data* — day titles, event titles, place names, counts — arrives in the
 * projection and is not repeated here.
 */
export const PDF_COPY = {
  brand: 'Travelive',
  eyebrow: 'מסלול משותף',
  scheduleTitle: 'הלו״ז',
  scheduleHint: 'חלקי יום · שעות · מקומות · נסיעות',
  summaryTitle: 'המסע במבט אחד',
  summaryHint: 'אירועים לפי חלקי היום, בלי שעות',
  continuedTitle: 'המשך הלו״ז',
  continuedAppendixTitle: 'המשך ונספח',
  continuation: (page: number) => `המשך המסלול · עמוד ${page}`,
  page: (page: number, total: number) => `עמוד ${page} מתוך ${total}`,
  updatedAt: 'עודכן',
  days: (count: number) => `${count} ${count === 1 ? 'יום' : 'ימים'}`,
  events: (count: number) => `${count} ${count === 1 ? 'אירוע' : 'אירועים'}`,
  stops: (count: number) => `${count} ${count === 1 ? 'אזור' : 'אזורים'}`,
  appendix: {
    title: 'פרטים נוספים',
    bookingSecrets: 'פרטי הזמנה',
    notesAndTasks: 'פתקים ומשימות',
    travelers: 'נוסעים',
    documents: 'מסמכים שנבחרו',
  },
  dayparts: {
    [SHARE_DAYPART.MORNING]: 'בוקר',
    [SHARE_DAYPART.NOON]: 'צהריים',
    [SHARE_DAYPART.AFTERNOON]: 'אחר הצהריים',
    [SHARE_DAYPART.EVENING]: 'ערב',
    [SHARE_DAYPART.NIGHT]: 'לילה',
    [SHARE_DAYPART.FLEXIBLE]: 'גמיש',
  } satisfies Record<ShareDaypart, string>,
  weekdays: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
} as const;

/** The same marks the reader uses, for the same sections. */
export const PDF_DAYPART_MARK = {
  [SHARE_DAYPART.MORNING]: '🌅',
  [SHARE_DAYPART.NOON]: '☀️',
  [SHARE_DAYPART.AFTERNOON]: '🌤️',
  [SHARE_DAYPART.EVENING]: '🌇',
  [SHARE_DAYPART.NIGHT]: '🌙',
  [SHARE_DAYPART.FLEXIBLE]: '◌',
} satisfies Record<ShareDaypart, string>;
