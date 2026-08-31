// Hebrew UI copy — the active locale. All user-facing strings live here so logic
// stays language-agnostic (conventions.md). Interpolated copy is a function;
// runs that must render left-to-right (times, codes) stay as JSX in the caller.
//
// ── THE REGISTER: THREE VOICES, EACH WITH A JOB, AND NO GENDERED SINGULAR ────────
// Written down 2026-08-17 because the file had drifted into a near 50/50 split — ~60
// singular-masculine imperatives (`שמור`, `ערוך`, `מחק`, `נקה`, `בחר`) against ~46 plural
// ones (`נסו`, `בחרו`, `הזמינו`), colliding on the same screens: `הוסף מסמך` beside
// `העלו`, `index.sheet.save: 'שמור'` beside the canonical `common.save: 'שמירה'`, and
// three spellings of one clear action. Singular-masculine also *genders* a product whose
// subject is a mixed group of five, which is the half no consistency argument fixes.
//
//   · A CONTROL says a verbal noun            — `עריכה` · `מחיקה` · `שמירה` · `ניקוי`
//   · A DIALOG TITLE asks in the infinitive   — `למחוק את הפתק?` · `לצאת בלי לשמור?`
//   · A SENTENCE to the reader is plural      — `נסו שוב` · `בדקו את החיבור`
//
// Three exceptions, all deliberate. **Disclosure toggles keep `הצג`/`הסתר`** — one matched
// pair for one job, picked by the owner on 2026-08-16, and `הצגה`/`הסתרה` on a caret row
// reads like a setting rather than a switch. **A stepper keeps its imperative**
// (`actions.delayBy`, `earlierBy`): `דחייה 15 דק׳` is not a thing anyone says. And **an act on
// someone ELSE's state takes the infinitive** (`settings.promote`), because the noun forms of
// those verbs are the formal register — `מינוי כמנהל` was rejected on exactly that (owner).
//
// The GROUP is `החבר'ה`; the people in it are `נוסעים` (`memberCount`, `rolePeer`). It was
// seven words for the same five people — חבורה, חבר'ה, חברים, משתתפים, מטיילים, נוסעים,
// קבוצה — and `משתתפים` in particular reads like a webinar, not a trip. And an INVITATION
// is a `לינק`, never a bare `הזמנה`: that word is a booking everywhere in the Index, so
// `טוען הזמנה…` on the join screen read as "loading booking".
import {
  NOTE_HOST_FIELD,
  type BookingType,
  type DocumentType,
  type LegTravelMode,
} from '@waypoint/shared';
import { countdownText } from '../lib/time';
import { type OutboxVerb } from '../lib/outbox';
import { bindPrefix, measure } from '../lib/bidi';

/** The two legs of a journey, in one place. Said by the authoring form's leg headings
 *  (ADR-0154 §4) AND by the detail's derived-pair fact and the delete prompt (§5) — a
 *  pair of words that must not drift between where you write a round trip and where the
 *  app tells you it found one. Prefixed with `ה` at the call sites that need the definite
 *  article, which is also why the gendered sentences below can't be one template. */
const LEG = { out: 'הלוך', back: 'חזרה' } as const;

/** **What a place's delete names, per kind** (ADR-0157 §8). The order is the one the map's
 *  own way-in block lists references in — most committed first — so the sentence and the
 *  block behind the dialog agree. `verb` is only reached when that kind is the ONLY one and
 *  there is one of it; anything else takes the masculine plural (`יישארו`), which is what
 *  Hebrew does with a mixed list. */
const PLACE_REF_NOUN = {
  event: {
    named: (title: string) => `האירוע "${title}"`,
    one: 'אירוע אחד',
    many: (n: number) => `${n} אירועים`,
    verb: 'יישאר',
  },
  booking: {
    named: (title: string) => `ההזמנה "${title}"`,
    one: 'הזמנה אחת',
    many: (n: number) => `${n} הזמנות`,
    verb: 'תישאר',
  },
  idea: {
    named: (title: string) => `הרעיון "${title}"`,
    one: 'רעיון אחד',
    many: (n: number) => `${n} רעיונות`,
    verb: 'יישאר',
  },
} as const;
const PLACE_REF_ORDER = ['event', 'booking', 'idea'] as const;
export type PlaceRefKindWord = (typeof PLACE_REF_ORDER)[number];
/** One row that would lose its location, and what it is called. `label` is absent only if
 *  the row somehow has no title, which drops the whole sentence back to counting. */
export interface PlaceRefSubject {
  kind: PlaceRefKindWord;
  label?: string;
}
/** **How many can be NAMED before the sentence becomes a list** (ADR-0157 §8). Two, and the
 *  ceiling is the point: naming is what makes the warning actionable, and a dialog reciting
 *  five titles is a report rather than a question. Past it the counted form takes over — and
 *  the specifics are still on screen behind the dialog, in the selected row's own way-in
 *  block, which lists every reference with its label. */
const PLACE_REF_NAME_LIMIT = 2;

export const t = {
  common: {
    undo: 'ביטול',
    yes: 'כן',
    no: 'לא',
    now: 'עכשיו',
    loading: 'טוען',
    // **"About"** — the hedge on an estimate, for the ladder rungs that are WORDS rather than
    // numbers (`כשעה`, `כשעתיים`). The number-led rungs take `~` inside the bidi isolate
    // instead; `approxDuration` owns which is which and why (ADR-0206 §D5).
    about: 'כ',
    // Canonical action labels — one wording shared by every FormActions bar and
    // confirm dialog (U-02), so Save/Cancel/Delete never drift between forms.
    save: 'שמירה',
    cancel: 'ביטול',
    delete: 'מחיקה',
    // The way back to a chooser from the value it produced — `ChoiceDisclosure`'s trailing
    // verb, on every editor that states what a thing is at the top. Here rather than at each
    // host for the same reason as the three above: it was `index.form.changeType`, private to
    // the booking sheet, and the note editor is the second surface to need the same word.
    change: 'שינוי',
    // A stepped surface's footer and its read-out (ADR-0155 §2). Here rather than at
    // each host so `הבא`/`הקודם` cannot drift between two stepped surfaces — the same
    // reason `save`/`cancel` above are shared.
    steps: {
      next: 'הבא',
      back: 'הקודם',
      progress: (n: number, total: number) => `שלב ${n} מתוך ${total}`,
    },
    // Unsaved-changes discard confirm (U-05), shown when closing a dirty form.
    discardTitle: 'לצאת בלי לשמור?',
    discardBody: 'יש שינויים שלא נשמרו. אם יוצאים עכשיו הם הולכים לאיבוד.',
    discardConfirm: 'לצאת בלי לשמור',
    discardCancel: 'המשך עריכה',
  },
  // FilePicker (ADR-0086): the two pick tiles + preview clear, shared by every
  // attachment surface so the wording never drifts.
  filePicker: {
    upload: 'העלאת קובץ',
    capture: 'מצלמה',
    remove: 'הסרה',
    /** Names the action AND the file, because the card's own filename is the button's
     *  content and an `aria-label` would otherwise replace it. */
    view: (name: string) => `תצוגה מלאה: ${name}`,
  },
  // Shared feedback-state family (ADR-0078): generic copy for the empty / loading
  // / error / status shells. Screens pass their own specific copy; these are the
  // sensible defaults (retry, a neutral "loading", a generic error title, dismiss).
  feedback: {
    retry: 'נסו שוב',
    loading: 'טוען',
    errorTitle: 'משהו השתבש',
    dismiss: 'סגירה',
    // The service-worker update notice (ADR-0181). It says what is true — a new
    // version is already installed — not "an update is available to download",
    // because by the time this shows, the swap has happened and only the open
    // tab is behind. Kept to three words because the drawn banner wraps to a
    // second line at 360px past that, and the verb beside it carries the ask.
    update: {
      message: 'גרסה חדשה הותקנה',
      action: 'רענון',
    },
    // The app-wide crash boundary (ADR-0185). It reuses `errorTitle` — an
    // unhandled render error IS the generic failure — and adds only the one thing
    // the user can do about it. No apology and no detail: the body has to be true
    // of a crash nobody predicted.
    crash: {
      body: 'רענון אחד וזה חוזר לעבוד.',
      action: 'רענון האפליקציה',
    },
  },
  // "Put this on your home screen" (ADR-0204). Its own top-level block rather than a member
  // of `shell.account`, because the settings row is only one of four places it is said and
  // the others are nowhere near the account screen.
  install: {
    // THE TWO UNPROMPTED ASKS (§2). Each states the fact that earned it, and they are two
    // strings and not one parameterised one on purpose: a generic "install our app" is
    // exactly the sentence that turns this into a nag, and a shared template invites one.
    ask: {
      // Door A — the first arrival after joining. `tripName` is the trip you just joined,
      // which is what makes this an observation rather than a pitch.
      joined: (tripName: string) => `הצטרפתם ל${tripName} · אפשר לקחת אותו איתכם למסך הבית.`,
      // Door B — departure is close. `days` is 1-3 (INSTALL_DEPARTURE_WINDOW_DAYS), and the
      // singular is spelled out because `בעוד 1 ימים` is not Hebrew.
      soon: (days: number) =>
        days === 1
          ? 'הטיול מתחיל מחר · על מסך הבית הוא עובד גם בלי רשת.'
          : `הטיול מתחיל בעוד ${days} ימים · על מסך הבית הוא עובד גם בלי רשת.`,
      action: 'התקנה',
    },
    // Door C (§3) — the blocked want. It names what was just asked for rather than the app,
    // because the person did not ask for an app, they asked to be reminded. The verb is
    // `איך` and not `התקנה`: on iOS nothing here can install, and the sheet teaches.
    blocked: {
      text: 'כדי שהתזכורת הזו תגיע באייפון, האפליקציה צריכה להיות על מסך הבית.',
      action: 'איך',
    },
    // THE SHEET (§4).
    sheet: {
      title: 'Travelive על מסך הבית',
      sub: 'אותה אפליקציה · בלי סרגל הדפדפן',
      // Three reasons, one line each, in the order they become true on a trip.
      whyOffline: 'עובדת בלי רשת · היומן, המסמכים והאינדקס',
      whyNotify: 'תזכורות מגיעות בזמן, גם כשהיא סגורה',
      whyHome: 'נפתחת במסך מלא, בנגיעה אחת',
      // Chrome: one tap, a real install.
      doInstall: 'התקנה',
      // iOS: nothing here can install, so the button closes and says so honestly.
      doGot: 'הבנתי',
      // The taught gesture. The gershayim are the app's own quoting convention (`נתב״ג`),
      // not straight quotes — and the WORDS are what identify the menu item, because the
      // glyph beside them is our nearest shape and not Apple's mark.
      stepShare: 'הקישו על כפתור השיתוף בסרגל הדפדפן',
      stepAdd: 'בחרו ״הוספה למסך הבית״',
      // The embedded-browser path, which is the common first open of a link-only-join app
      // (ADR-0030) and not an edge case.
      inAppTitle: 'הקישור נפתח בתוך אפליקציה אחרת',
      inAppBody:
        'מכאן אי אפשר להתקין. פתחו את Travelive בדפדפן של הטלפון, ומשם אפשר להוסיף אותו למסך הבית.',
      inAppCopy: 'העתקת הקישור',
      inAppCopied: 'הקישור הועתק',
      note: 'אפשר תמיד להתקין מההגדרות.',
    },
    // THE PERMANENT HOME (§6).
    settings: {
      section: 'האפליקציה',
      label: 'התקנה למסך הבית',
      installed: 'מותקנת',
      notInstalled: 'לא מותקנת',
      action: 'התקנה',
      hint: 'על מסך הבית Travelive נפתחת במסך מלא, עובדת בלי רשת ויכולה לשלוח תזכורות.',
      // What the row says where no path exists at all — honest rather than absent, so the
      // section does not silently disappear on a desktop browser.
      unavailable: 'בדפדפן הזה אין התקנה · בטלפון זה יעבוד.',
    },
  },
  // No arrow lives in the copy: every visible arrow renders as an SVG (ui/NavArrow,
  // ui/Icon) because the Assistant body font has no arrow glyphs and the fallback
  // sits low. The one textual arrow left in the app is the route-title separator
  // (lib/route-title's ROUTE_TITLE_ARROW) — stored data + screen-reader labels,
  // where an SVG says nothing. Lint-guarded for this directory.
  tabs: {
    home: 'בית',
    map: 'מפה',
    index: 'אינדקס',
    days: 'יום-יום',
  },
  // Map tab (Phase 3, ADR-0109/0110): the list-first pinned-place surface.
  map: {
    // The base map's own canvas failed to draw (field report #28) — a script load
    // failure or tiles that silently never painted. The place list beside it still
    // works, so this takes only the canvas's own slot, never the whole tab.
    loadError: 'לא הצלחנו לטעון את המפה',
    // Said while the tiles are still on their way, because the alternative is a blank
    // canvas with our own pins floating on it and nothing to explain the wait — which is
    // indistinguishable from the failure above (field report #35). On a slow network that
    // wait is real seconds, not a flicker.
    loading: 'טוען את המפה…',
    // …and what the same slot says once the wait passes `MAP_LOAD_TIMEOUT_MS.TILES`. It
    // deliberately does NOT claim the failure above: the attempt is still running and may
    // still paint, so the honest statement is that this is slow, with a way out beside it.
    loadingSlow: 'הטעינה איטית מהרגיל',
    // The one word behind which the technical reading hides (field report #35). Shown only
    // on a pane that is already failing, so a working map never grows a debug affordance —
    // and it says "details" rather than naming WebGL, because the person reading it wants
    // the map back and is doing us a favour by tapping at all.
    diagnostic: 'פרטים',
    filter: {
      all: 'הכל',
      maybes: 'אולי',
      // The outcome filter ADR-0117 deferred, scoped by ADR-0121 §9 to ONE
      // toggle in the `אולי` chip's idiom: the question on the ground is not
      // "where have we been" (the list already answers that, by block and by
      // per-row tag) but "what's left". It hides everything settled, visited and
      // skipped alike, on the canvas and in the list.
      left: 'מה נשאר',
      categoryLabel: 'סינון לפי קטגוריה',
      noResultsTitle: 'אין מקומות שמתאימים לסינון',
      // The facets persist across a day change and the strip may be closed over them,
      // so the empty state names what is actually holding the list down, and hands
      // back the one step out of it.
      noResultsBody: (facets: string) => `הסינון הפעיל: ${facets}`,
      clear: 'ניקוי הסינון',
      // The ONE filter control over the canvas (ADR-0122 §2): at rest it says what it
      // is, and with a facet on it says WHICH — a filter that hides the fact that it
      // is filtering is the defect ADR-0119 exists to prevent. It carries no count:
      // the open strip already answers "how many".
      open: 'סינון',
      close: 'סגירת סינון',
      // The summary's accessible name spells out in words what the chip draws with the
      // category's glyph — a control named by an emoji is not named.
      activeAria: (facets: string) => `סינון: ${facets}`,
    },
    // The query is a CONTROL in the canvas's own row now, not a full-screen overlay
    // (ADR-0131 §1) — so the overlay's own copy is gone with it: `modeTitle`,
    // `planModeTitle`, `backAria`, `clear`, `planPlaceholder`, `hint` and `planButton`
    // are DELETED rather than orphaned, and there is no mode split left to name because
    // both halves are in both modes (§8). The Index keeps its own `t.index.search.*`.
    search: {
      button: 'חיפוש מקומות',
      placeholder: 'שם או כתובת',
      // One close control for whichever occupant of the row is open (§1). It clears the
      // query as it closes, so no filter can be on without being visible.
      close: 'סגירת חיפוש',
      noResultsTitle: 'לא נמצאו מקומות',
    },
    offlineMap: {
      offline: 'אופליין · המפה מציגה את מה שנשמר במכשיר',
      prompt: 'לשמור מפה אופליין לטיול הזה?',
      download: 'הורדה',
      downloading: 'מורידים את מפת הטיול לאופליין…',
      preparing: 'מכינים את מפת הטיול · אפשר להמשיך להשתמש במפה',
      retry: 'בדיקה שוב',
      noSpace: 'אין מספיק מקום לשמור את מפת הטיול',
      failed: 'הורדת המפה לא הצליחה',
    },
    // Google's half of the search (ADR-0115, re-parented into the sheet by ADR-0131 §8
    // and available in BOTH modes). Its `arm`/`armBody`/`armAria` are deleted, not
    // orphaned: ADR-0131 §8a withdrew the gate, because the arm separated two intents on
    // one field and the user has one. `PLACE_SEARCH_MIN_CHARS` is the cost control now.
    // A place ERRAND: a form sent you here to pick one location (ADR-0134 §1). The verb
    // changes while it is live — you are choosing, not shelving — and the banner names
    // the target in the reference's own words, which only the form knows.
    errand: {
      choose: 'בחירה',
      chooseAria: (name: string) => `בחירת ${name}`,
      // `label` is the target, supplied by whoever started the errand.
      title: (label: string) => `בחירת מיקום ל${label}`,
      cancel: 'ביטול',
      // A form that has not been named yet still has to be named in the banner.
      untitledEvent: 'האירוע החדש',
      untitledBooking: 'ההזמנה החדשה',
    },
    research: {
      tripGroup: 'בטיול',
      googleGroup: 'מגוגל',
      add: 'אולי',
      addAria: (name: string) => `הוספת ${name} למדף האולי`,
      // The row's tap frames the place HERE (ADR-0134 §6), so the way out to Google is its
      // own control — and it needs a name, because it is an icon.
      openInGoogle: 'פתיחה בגוגל מפות',
      searching: 'מחפש בגוגל…',
      noResults: 'לא נמצאו מקומות בגוגל',
      // Offline the arm is gone rather than disabled (the near-me rule, ADR-0109 §7).
      offline: 'אין חיבור · חיפוש בגוגל לא זמין, המקומות של הטיול כן',
      // Armed, but the query is still under the min-chars floor: say why nothing is
      // happening instead of leaving a bare header over an empty section.
      typeMore: 'הקלידו עוד כדי לחפש',
    },
    // MAKING AND NAMING a place (ADR-0147). FOUR sources, ONE form — a long press on the
    // canvas, a tap on one of Google's own sights, a search result's add, and renaming a place
    // the trip already has. Only the TITLE, what is prefilled and the confirm's word differ;
    // the fields never do, which is what keeps four sources from becoming four flows.
    make: {
      // A long press: nothing is known about the spot but where it is, so the title asks.
      dropTitle: 'מה יש כאן?',
      // A search result — it has a name already, so this is the add, not an interrogation.
      resultTitle: 'הוספה לטיול',
      // A place the trip already has, whether Google named it or you did.
      renameTitle: 'שם ופרטים',
      nameLabel: 'שם',
      namePlaceholder: 'שם המקום',
      categoryLabel: 'קטגוריה',
      iconLabel: 'בחירת סמל',
      // **The short label** (ADR-0166 §18, field report #23) — what this place is called on a
      // day row, where a full official airport name does not fit. Offered only where the place
      // already exists, so the question is "what do you call it", not "what is it".
      nicknameLabel: 'כינוי קצר',
      nicknamePlaceholder: 'למשל: נתב״ג',
      // What the row shows when the field is left empty — the derived label, or the shortened
      // name. Says the field is optional without the word "optional".
      nicknameHint: (fallback: string) => `בלי כינוי יוצג: ${fallback}`,
      add: 'הוספה למדף',
      save: 'שמירה',
      cancel: 'ביטול',
      // **The verb is EDIT, not rename** (owner, session 211). The form this opens has been
      // the whole of a place's authorship since ADR-0147 — the name, the glyph, the category
      // and a note on the way — and its own title already said so (`renameTitle` below is
      // `שם ופרטים`). Only the control that opens it was still promising less than it does.
      // Worded to match `del.action`, since the two stand next to each other in the pin menu.
      edit: 'עריכת המקום',
      failed: 'ההוספה נכשלה · נסו שוב',
      saveFailed: 'השמירה נכשלה · נסו שוב',
      // The card's one mandatory field (ADR-0150). Its confirm used to be disabled
      // instead, which left the Enter key this field binds answering nothing at all.
      nameRequired: 'חסר שם למקום',
    },
    // **Removing a place** (ADR-0157). One vocabulary for both ways in — the trash on a
    // selected row and the pin's long-press menu open the same confirm, so the words are
    // written once here rather than per surface.
    del: {
      action: 'מחיקת המקום',
      aria: (name: string) => `מחיקת ${name}`,
      title: 'למחוק את המקום?',
      body: (name: string) => `${name} יוסר מהמפה ומהרשימה.`,
      // **The cascade, said before it happens, IN THE READER'S OWN NOUNS** (ADR-0157 §8).
      //
      // It shipped counting `פריטים`, gender-free, on the reasoning that one sentence had to
      // serve אירועים, הזמנות and רעיונות at once. The owner's report is what that costs: a
      // place added and immediately deleted warned about "one item", and the item was the
      // shelf idea the ADD ITSELF had created (`landPlace`) — so the line was simultaneously
      // correct, unactionable, and hiding the one fact worth knowing. A warning you cannot
      // act on is not a warning.
      //
      // Gender is why this is a table and not a template: אירוע is masculine, הזמנה is
      // feminine, and Hebrew has no neutral singular verb for them to share. One kind gets
      // its own verb; several join their subjects under the masculine plural, which is what
      // Hebrew does with a mixed list anyway.
      refs: (subjects: PlaceRefSubject[]) => {
        if (subjects.length === 0) return '';
        // **Named when there are few, counted when there are many.** Naming is the whole
        // repair: the report that started it was a warning about "one item" where the item
        // was a shelf idea, and no count of anything could have said that.
        const namable = subjects.length <= PLACE_REF_NAME_LIMIT && subjects.every((s) => s.label);
        const phrases = namable
          ? subjects.map((s) => PLACE_REF_NOUN[s.kind].named(s.label as string))
          : PLACE_REF_ORDER.filter((kind) => subjects.some((s) => s.kind === kind)).map((kind) => {
              const n = subjects.filter((s) => s.kind === kind).length;
              return n === 1 ? PLACE_REF_NOUN[kind].one : PLACE_REF_NOUN[kind].many(n);
            });
        // `ו` is a prefix, not a word — and it takes a hyphen before a numeral, or `ו2`
        // reads as one token.
        const last = phrases[phrases.length - 1];
        const joined =
          phrases.length === 1
            ? last
            : `${phrases.slice(0, -1).join(', ')} ו${/^\d/.test(last) ? '-' : ''}${last}`;
        const verb = subjects.length === 1 ? PLACE_REF_NOUN[subjects[0].kind].verb : 'יישארו';
        return `${joined} ${verb} בלי מיקום`;
      },
      // **And the one thing a place delete DELETES besides its notes** (ADR-0157 §9). Named
      // in its own clause rather than folded into `refs`, because the two make opposite
      // claims: everything in `refs` survives without a location, and this does not survive.
      // It says WHERE it is, since the shelf is the one surface the reader has to picture.
      idea: 'גם הרעיון שעל המדף יימחק',
      confirm: 'מחיקה',
    },
    // Map-local day scope (ADR-0110 §4): the strip focuses one day; this chip
    // shows every day's places at once.
    // (`scopeAll` / `scopeDay` retired with `.map-scopehint` in ADR-0122 §2: the chip's
    // own on/off state says which scope is on, and the header day strip already drops
    // its filled selection while all-days is live.)
    allDays: 'כל הימים',
    shelfTag: 'על המדף',
    // navigate-to-next on the list (ADR-0106 §6): the one time-anchor cue the map
    // budget allows (ADR-0109 §6, the amber ring's list form), on a single row.
    nextStop: 'היעד הבא',
    // Where you are right now. The board's word for the same fact, deliberately —
    // the two surfaces read one resolver (`deriveNow`), so they must also say one
    // thing. Amber like `nextStop`: both are time (ADR-0028).
    happeningNow: 'עכשיו',
    // A STRICTLY MIDDLE NIGHT of a stay, in the same pin slot the two words above and
    // `transition.checkIn`/`checkOut` fill (ADR-0054's 2026-08-26 amendment). It has no
    // edge, so it has no transition word to say — and it is the one pin that bookends BOTH
    // ends of the day, which is exactly what a reader cannot otherwise tell. Neutral, not
    // amber: it is where you are sleeping, not a commitment on the clock.
    stayNight: 'לינת לילה',
    // The list is three blocks (ADR-0109 session-110 + session-127), keyed by
    // `PlaceBlock` so the header and the order read one vocabulary. The behind header
    // is deliberately NEUTRAL (ADR-0117 §3): it holds three outcomes — visited,
    // skipped, and passed-with-nobody-saying — and only the first is a visit, so the
    // per-row tags carry the claim and the header only marks the boundary. `dayless`
    // is a place with no day at all (a "someday" idea, an unscheduled booking): it
    // says so rather than being swept under "what's behind us". A one-block list
    // renders no header, so an all-ahead list stays bare.
    blockHeader: {
      ahead: 'מה שלפנינו',
      dayless: 'ללא יום',
      behind: 'מה שמאחורינו',
    },
    // "Near me now" (Phase 4a, ADR-0109 §6-7): a list re-sort + teal distance
    // chips, never a spatial dot (there's no rendered map until Phase 6). The
    // permission is asked only on intent, behind the reason-first pre-prompt —
    // which states the on-device promise ADR-0006 makes, in plain words.
    near: {
      chip: 'קרוב עכשיו',
      locating: 'מאתר…',
      groupHeader: 'לפי קרבה אליך',
      // Number-then-unit via `measure` (ADR-0118): the numeral is the LTR island,
      // the Hebrew unit stays in the RTL flow, so the chip reads "9 ק״מ".
      meters: (m: number) => measure(m, 'מ׳'),
      // `string` as well as `number` since ADR-0212: past ⁦1,000 ק״מ⁩ the caller does the
      // grouping, and `measure` has always taken either.
      km: (km: number | string) => measure(km, 'ק״מ'),
      // Offline: you can't re-locate, so a number would be a stale claim.
      unavailable: 'מרחק לא זמין',
      prompt: {
        title: 'למיין לפי קרבה',
        body: 'כדי להראות מה קרוב אליכם עכשיו נשתמש במיקום המכשיר. המיקום נשאר במכשיר ולא נשלח לאף אחד.',
        allow: 'אפשר מיקום',
        notNow: 'לא עכשיו',
      },
      // Denied / unavailable: near-me is strictly additive, so the list just stays
      // on its own order and says why. A retry is offered only when asking again
      // can actually re-prompt; once the browser hard-denies, only settings help.
      deniedBanner: 'מיקום כבוי · הרשימה ממוינת לפי לו״ז',
      retry: 'נסו שוב',
      blockedHint: 'אפשרו מיקום בהגדרות הדפדפן',
      unavailableBanner: 'לא הצלחנו לאתר את המיקום · הרשימה ממוינת לפי לו״ז',
      // The spatial "me" dot the near-me sort gains for free once a map is
      // rendered (ADR-0109 §7 / ADR-0121 §7).
      youAreHere: 'אתם כאן',
    },
    empty: {
      title: 'אין עדיין מקומות',
      body: 'מקומות שתוסיפו לאירועים, להזמנות ולמדף האולי יופיעו כאן.',
    },
    // The trip HAS places, this day has none, and no facet is narrowing anything —
    // so the way out is the scope chip, not the filter. Told apart from the filtered
    // case because blaming a control you never touched is how an empty list reads as
    // broken.
    // Worded as an imperative, not as the scope chip's own label: two buttons reading
    // `כל הימים` on one screen name the same state twice, and the chip is a toggle
    // where this is a step out.
    emptyDay: {
      title: 'אין מקומות ביום הזה',
      body: 'שאר מקומות הטיול עדיין כאן.',
      action: 'הצגת כל מקומות הטיול',
    },
    // ── The embedded map (Phase 6, ADR-0121) ─────────────────────────────────
    // The height axis: the handle drags a continuum, the toggle is a shortcut to
    // its two extremes. One state, two controls, so they cannot disagree.
    view: {
      list: 'רשימה',
      map: 'מפה',
      toggleLabel: 'תצוגה',
      // The handle is a real ARIA splitter now (ADR-0122 §4), so it is named for the
      // value it moves and each stop is read out by `aria-valuetext` — arrows move one
      // stop, Home/End go to the extremes.
      grab: 'גובה הרשימה',
      stop: { map: 'מפה', half: 'חצי', full: 'מלא' },
    },
    // Pan/zoom IS the area filter (ADR-0106 §4) and no chip is ever built — this
    // quiet readout is what finally says so on screen. Worded about the AREA,
    // because unlike a facet count it reads the canvas: it counts every pin in
    // view, including the ones no chip counts.
    area: {
      suffix: 'באזור',
      none: 'אין מקומות באזור',
      // The ACTION, carried as the button's `title` — i.e. its accessible
      // DESCRIPTION, never its name. The visible `7 באזור` has to stay the name or a
      // voice-control user cannot say what they can see, and a name that rewrites
      // itself on every camera idle is its own kind of churn (ADR-0126 §4).
      action: 'מיון הרשימה לפי האזור שבמסך',
      // Two headers, not one: unlike distance — which every row states for itself in
      // its own chip — "in view" is invisible per row, so the boundary the first
      // group ends at has to be drawn (ADR-0126 §5).
      groupHeader: 'באזור שבמסך',
      elsewhere: 'שאר המקומות',
      // The count reads the CANVAS and includes ghosts, which the list structurally
      // cannot render. So the list says what it could not bring, in the same grammar
      // session 144's empty state already uses — and offers the same way out, which
      // genuinely resolves it: with all-days on there are no ghosts at all.
      otherDays: (n: number) => `${n} מקומות באזור אינם ביום הזה.`,
    },
    // The two camera controls (ADR-0126 §6, amending ADR-0121 §12's single
    // re-centre). Locate is LOCATE-ONLY and stops branching on whether there is a
    // fix; framing the filtered set is its own control. Named for what each does,
    // because `מרכז מחדש` was true of both jobs the one button used to do.
    locate: 'מרכוז על המיקום שלכם',
    // The place card's badge is the way in to its own pin (ADR-0129 §1). The same verb
    // the badge already carries everywhere else — one step further in, since here you
    // are already looking at the map.
    frameOnPlace: 'התמקדות במקום הזה',
    frameAll: 'התאמת התצוגה לכל המקומות',
    // The canvas card's own way out (ADR-0182's device pass). The card was already dismissible
    // three ways — a tap on blank canvas, system back, selecting something else — and none of
    // them is visible on it. Names the card, because `סגירה` alone sits beside a filter close
    // and a search close on the same screen.
    closeCard: 'סגירת כרטיס המקום',
    // The other half of the same owner ask, built a year of sessions later (ADR-0122 §7's
    // 2026-08-27 amendment): folding the card away leaves the place selected, its pin ringed
    // and its amber leg drawn — so the words are about the CARD and never about the place.
    // `כיווץ`/`פתיחה` rather than `הסתרה`/`הצגה`, because nothing is hidden: the card's
    // identity row stays on screen and is what you tap to bring the rest back.
    collapseCard: 'כיווץ כרטיס המקום',
    expandCard: 'פתיחת כרטיס המקום',
    // The way-in block's one primary action (ADR-0135 §1): a place in the trip could only
    // ever be an idea, and nothing said "put this on Tuesday at 14:00". Names the verb, not
    // the schema — "event or booking?" is the app's question, not the traveller's.
    scheduleToDay: 'שיבוץ ליום',
    // **What the world knows about this place** (ADR-0167 §5/§6), in the selection reveal.
    know: {
      // A summary in a language that is not ours, marked in ONE word and in the row's
      // existing tag grammar — no new component and no second treatment of the prose.
      // Keyed by the variant's own language: a language with no word here gets no marker
      // rather than an invented one (`lib/place-summary.ts`), and only `he` → `en` can
      // arrive today (ADR-0166 §11.5).
      langMarker: { en: 'באנגלית' } as Record<string, string | undefined>,
      // The way through to what Google holds — hours, photos, reviews, live busy-ness — for
      // the places open sources cannot describe (ADR-0166 §13). **Never `מפה` or `צפה`:**
      // a second control that reads as "view the location" is the competing destination
      // ADR-0121 §8 refused, and the row's one Google exit stays `נווט`. This one answers
      // *what does Google know*, which our map does not.
      moreOnGoogle: 'עוד בגוגל',
      // **Expanding is a MODE CHANGE, not growth** (ADR-0167 §11.1): the card becomes the one an
      // un-added research place gets — picture, whole summary, credit — and the notes, the
      // references and the schedule action are not on screen at the same time. So the way back
      // says where it goes, in the app's own words for that surface, rather than `סגירה`.
      // No caret in the string: the app renders `<Icon name="caret">` at the call site, so the
      // glyph follows the text direction instead of being frozen into the copy
      // (design-language.md, and lint-blocked). The mockup drew `›`/`‹` characters; this is the
      // shipped idiom the refs row already uses.
      more: 'עוד',
      back: 'חזרה לפרטי המקום',
      // The hero opens the full-screen zoomable preview (ADR-0062's one permitted zoom). Named
      // for what the tap does, since the picture itself carries no label.
      fullPicture: 'תמונה מלאה',
    },
    // A pin that is in view but not in this day (ADR-0121 §6). Its row is not in
    // the sheet, so tapping it is the only way to learn what it is: the tap
    // surfaces that one row, named with the day it belongs to.
    notThisDay: 'לא ביום הזה',
    noDay: 'ללא יום',
    // The way through from a place to the entity that put it in the trip
    // (ADR-0121 §8). Labelled in the reference's own words, so the control says
    // where it goes rather than a generic "details".
    refs: {
      booking: 'הזמנה',
      event: 'אירוע',
      idea: 'רעיון',
      // The block shows the references that matter now and folds the rest away
      // (ADR-0121 §8's 2026-08-05 amendment). `עוד` is the app's existing word for
      // "there is more of this here" — the same one the place card's summary uses.
      more: (n: number) => `עוד ${n}`,
      less: 'פחות',
    },
    // The day's stops as one free Google directions link (ADR-0121 §10) — it
    // ships with the connector, so Plan mode's day scope, and costs nothing.
    dayRoute: 'מסלול היום בגוגל',
  },
  header: {
    // `dayOf` and `leavingIn` left with the header's sub-line (ADR-0149 §1): the
    // day count is the anchor slot's job now, and Plan's countdown to departure
    // already lives on the prep hero, where it was not a duplicate.
    pendingSync: (count: number) => `${count} שינויים מחכים לסנכרון`,
    offlineNow: 'אופליין · נתונים שמורים',
    // The anchor slot at the day strip's leading edge (ADR-0149 §5), which replaced
    // the day-scope context ribbon: one fixed-width box, two states cross-faded in
    // place. On today it reads the trip's progress — `dayCap` over `dayProgress`,
    // stacked, so the box stays narrow; off today it becomes the way back. The
    // ribbon's own two labels are gone with it, but `backToToday` stays and is now
    // both the button's word and the slot's accessible name.
    dayCap: 'יום',
    dayProgress: (day: number, total: number) => `${day}/${total}`,
    todayShort: 'היום',
    backToToday: 'חזרה להיום',
  },
  // Per-entity sync status (U-04, ADR-0080): the per-row SyncBadge, the header
  // failed-summary affordance, and the review/retry (dead-letter) sheet.
  sync: {
    badge: {
      synced: 'נשמר',
      pending: 'מחכה לסנכרון',
      failed: 'לא נשמר',
    },
    // Persistent header affordance — replaces the old timed failed badge. Never
    // clears on a timer; opens the review sheet.
    summary: (count: number) => (count === 1 ? 'שינוי אחד לא נשמר' : `${count} שינויים לא נשמרו`),
    // Human label per outbox verb, describing the change that did not save.
    verb: {
      create: 'הוספת אירוע',
      update: 'עדכון אירוע',
      setStatus: 'עדכון סטטוס אירוע',
      move: 'הזזת אירוע',
      delete: 'מחיקת אירוע',
      consumeMaybeItem: 'קידום רעיון',
      restoreMaybeItem: 'החזרת רעיון למדף',
      createMaybeItem: 'הוספת רעיון',
      deleteMaybeItem: 'מחיקת רעיון',
      updateMaybeItem: 'עדכון רעיון',
      updateTrip: 'עדכון פרטי הטיול',
      setMemberRole: 'עדכון הרשאות נוסע',
      removeMember: 'הסרת נוסע',
      deleteTrip: 'מחיקת הטיול',
      createBooking: 'הוספת הזמנה',
      updateBooking: 'עדכון הזמנה',
      deleteBooking: 'מחיקת הזמנה',
      createPlace: 'הוספת מקום',
      updatePlace: 'עדכון מקום',
      deletePlace: 'מחיקת מקום',
      uploadDocument: 'העלאת מסמך',
      createNote: 'כתיבת פתק',
      updateNote: 'עריכת פתק',
      deleteNote: 'מחיקת פתק',
      createTask: 'הוספת משימה',
      updateTask: 'עדכון משימה',
      deleteTask: 'מחיקת משימה',
      createDocumentAttachment: 'צירוף מסמך',
      deleteDocumentAttachment: 'ביטול צירוף מסמך',
      setTravelMode: 'שינוי אופן הנסיעה',
      clearTravelMode: 'ביטול אופן הנסיעה',
      // `satisfies Record<OutboxVerb, string>`, not `as Record<string, string>`: this map is
      // read as `t.sync.verb[f.verb]`, so a verb missing from it renders a queued failure with
      // NO name — and the loose cast made that silent. Typed, a new outbox verb is a compile
      // error here, which is how every other per-enum lookup in this app behaves.
    } satisfies Record<OutboxVerb, string>,
    review: {
      title: 'שינויים שלא נשמרו',
      intro: 'השינויים האלה לא נשמרו בשרת. אפשר לנסות שוב או לזרוק.',
      reason: 'השרת דחה את השינוי',
      retry: 'נסו שוב',
      discard: 'לזרוק',
      discardAll: 'לזרוק הכל',
      empty: 'אין שינויים שמחכים.',
    },
  },
  placeholder: {
    comingSoon: 'המסך הזה עוד בעבודה.',
  },
  index: {
    // Landing (ADR-0098): a bookings tile + a documents tile, each pushing its
    // own dedicated screen; the back-row returns here.
    back: 'אינדקס',
    backAria: 'חזרה לאינדקס',
    // Merged idx-head row (ADR-0100 §1): the booking count sits at the row's
    // trailing end, beside the back+title group.
    head: {
      count: (n: number) => `${n} הזמנות`,
    },
    tile: {
      nextPrefix: 'הבא:',
      pastCount: (n: number) => `${n} מהעבר`,
      emptyBookings: 'אין עדיין הזמנות',
      emptyDocuments: 'אין עדיין מסמכים',
    },
    filter: {
      all: 'הכל',
      categoryLabel: 'סינון לפי סוג',
      // "No active bookings" rather than "no matching bookings" (ADR-0101):
      // the old copy read as if nothing exists at all, when matches often DO
      // exist just collapsed under "past". `pastMatchHint` only shows when
      // that's actually the case, pointing at the toggle below it.
      noResultsTitle: 'אין הזמנות פעילות כרגע',
      pastMatchHint: (n: number) => `${n} מההזמנות שלכם כבר מאחוריכם`,
    },
    // The search icon opens the full-screen search mode (ADR-0101,
    // `ui/primitives/SearchOverlay`) — a compact top bar + pinned field +
    // live scrollable results, replacing the old cover-in-place chip row.
    search: {
      button: 'חיפוש הזמנות',
      modeTitle: 'חיפוש הזמנות',
      placeholder: 'חפשו לפי שם, קוד אישור או קטגוריה…',
      clear: 'ניקוי',
      backAria: 'סגירת חיפוש',
    },
    pastToggle: {
      show: (n: number) => `הצג ${n} מהעבר`,
      hide: 'הסתר הזמנות מהעבר',
    },
    bookingsTitle: 'הזמנות',
    offlineBadge: 'עובד אופליין',
    unlinked: 'לא משובצת במסלול',
    bookingType: {
      flight: 'טיסה',
      hotel: 'לינה',
      restaurant: 'מסעדה',
      train: 'רכבת',
      // The third transport mode (ADR-0156): a bus, a ferry, a shuttle, a cable car.
      // `נסיעה` is the word that covers all of them without naming any — `אוטובוס` would
      // be wrong on a ferry, and `תחבורה` is the CATEGORY's name, not a booking's.
      transit: 'נסיעה',
      // The fourth (ADR-0162). The ACT, not the object: `רכב שכור` names the car you end
      // up with, where every other label here names the thing you booked (owner's call).
      car: 'השכרת רכב',
      activity: 'פעילות',
      other: 'אחר',
    },
    // Plural forms feed search (ADR-0102: "מסעדות"/"טיסות" should also find
    // that type's bookings, not just the singular label) — not shown as UI
    // copy anywhere themselves. `other` has no natural plural noun ("אחר" is
    // an adjective, not a countable category name); kept identical to the
    // singular rather than the grammatically-correct-but-useless "אחרים".
    bookingTypePlural: {
      flight: 'טיסות',
      hotel: 'לינות',
      restaurant: 'מסעדות',
      train: 'רכבות',
      transit: 'נסיעות',
      car: 'השכרות רכב',
      activity: 'פעילויות',
      other: 'אחר',
    },
    // Extra alternate/colloquial search terms per type, beyond the
    // singular/plural label — someone searching for a hotel booking is just
    // as likely to type the lodging kind ("מלון", "הוסטל", "airbnb") as the
    // generic "לינה" (ADR-0102). Populated per type with the alternate words
    // people actually search by for that kind of booking; `train` and `other`
    // have no real alternate vocabulary beyond their singular/plural, so stay
    // empty rather than padded with weak, unlikely-to-be-typed synonyms.
    bookingTypeSynonyms: {
      flight: ['מטוס'],
      // `transit` is the one type whose LABEL nobody would search by: you look for the
      // vehicle you booked, not the generic word for a journey. So unlike `train` and
      // `other`, this list is the point rather than padding.
      //
      // The car words moved to `car` in ADR-0162 rather than staying in both: leaving them
      // here would make every bus answer a search for `השכרת רכב`, and the noise is worse
      // than the one pre-0162 hire that now needs re-typing to be found by them.
      transit: ['אוטובוס', 'אוטובוסים', 'מעבורת', 'מעבורות', 'הסעה', 'הסעות', 'שאטל', 'רכבל'],
      // `רכב` alone is the likeliest thing typed, and the brands are how people actually
      // remember which hire it was — a provider field holds the name, but the search box
      // is where they reach for it first.
      car: ['רכב', 'רכב שכור', 'מכונית', 'אוטו', 'השכרה', 'רנט א קאר', 'hertz', 'avis', 'sixt'],
      hotel: [
        'מלון',
        'מלונות',
        'מוטל',
        'מוטלים',
        'הוסטל',
        'הוסטלים',
        'דירה',
        'דירות',
        'airbnb',
        'b&b',
        'bnb',
      ],
      restaurant: ['אוכל', 'ארוחה', 'קפה', 'בר'],
      train: [],
      activity: ['טיול', 'אטרקציה', 'כרטיס'],
      other: [],
    },
    emptyTitle: 'עוד אין הזמנות שמורות',
    emptyBody: 'טיסות, לינה ושאר ההזמנות שלכם יופיעו כאן · שתוסיפו או שייכנסו לבד מ-Gmail',
    toast: {
      saved: 'ההזמנה נשמרה',
      savedQueued: 'יישמר כשנחזור לרשת',
      deleted: 'ההזמנה נמחקה',
    },
    // Read-only booking detail view (ADR-0053): tap a booking → facts + a visible
    // edit button + a "⋯" menu (edit / delete).
    detail: {
      // Verbal nouns, like every other control in the app (the register rule at the top of
      // this file, which amended ADR-0138 §6). These were `ערוך`/`מחק` for one release.
      edit: 'עריכה',
      actions: 'פעולות',
      delete: 'מחיקה',
      /** The action the row's own `לא משובצת במסלול` was asking for (§7). */
      schedule: 'שיבוץ במסלול',
      reschedule: 'שינוי השיבוץ',
      /** The manage sheet's subject line, where the row says the long form. */
      isScheduled: 'משובצת במסלול',
      timing: 'מתי',
      duration: 'משך',
      location: 'מיקום',
      // The fact states the absence instead of disappearing (ADR-0121 §8
      // amendment). Words, not a dash: a dash reads as "unknown", and this is a
      // thing you can fix from right here.
      noLocation: 'לא הוגדר מיקום',
      unscheduled: 'לא משובצת במסלול',
      code: 'קוד אישור',
      // **Where the IATA codes live** (ADR-0166 §18, revised 2026-08-08). Not on the route
      // surfaces, which are rows: two compound labels on one line spend the whole budget
      // saying twice what the cities say once. Here, in the record, beside the confirmation
      // code — which is the other thing you check against a ticket.
      airports: 'קודי שדות תעופה',
      provider: 'ספק',
      room: 'חדר',
      wifi: 'WiFi',
      notes: 'הערות',
      hardNote: 'הזמנה קשיחה',
      // The derived pair (ADR-0154 §5) — one fact, LAST, because everything above it
      // describes this booking and this one describes its neighbour. `הלוך ושוב` is the
      // key because the fact's subject is the relation; the value names the other leg
      // and is the way to it.
      pair: 'הלוך ושוב',
      pairLeg: (leg: 'out' | 'back', when: string) => `${LEG[leg]} · ${when}`,
      // The other derived relation (ADR-0159): which leg of the journey this is, and the
      // way to the one beside it. Position first, because it is the part that is always
      // true — a neighbour with no schedule still leaves "קטע 2 מתוך 3" standing.
      journey: 'מסע',
      journeyLeg: (index: number, count: number) => `קטע ${index} מתוך ${count}`,
      journeyNext: (when: string) => `ההמשך · ${when}`,
      journeyPrev: (when: string) => `הקודם · ${when}`,
      // A leg with no slot in the itinerary yet. Shorter than the row's own
      // `לא משובצת במסלול`, which would swamp the value it sits inside.
      pairUnscheduled: 'ללא מועד',
    },
    sheet: {
      editTitle: 'עריכת הזמנה',
      titlePlaceholder: 'שם ההזמנה',
      codeLabel: 'קוד אישור',
      // **Whose booking this is** (ADR-0163 §2). One `Booking.provider` column, and the
      // word for it differs enough per type that a single `ספק` would be the vague
      // option everywhere: you know you booked with `Hertz`, and calling that a
      // "supplier" is how a field stops getting filled in. A `Record` over the enum
      // rather than a ternary, so a new type answers at compile time.
      providerLabel: {
        car: 'חברת ההשכרה',
        flight: 'חברת התעופה',
        train: 'חברת הרכבות',
        transit: 'המפעילה',
        // **The channel, not the hotel** (field report #12). `הרשת או המפעיל` asked for
        // the hotel's own identity, which is what the linked PLACE already carries — and
        // is now what the title derives from (field report #9). What has nowhere else to
        // go is where you booked it.
        hotel: 'הוזמן דרך',
        restaurant: 'ספק',
        activity: 'המפעיל',
        other: 'ספק',
      } satisfies Record<BookingType, string>,
      // Real examples beat an abstract label — the placeholder is what tells you the
      // field wants `Hertz` and not `רכב שכור בטוקיו`.
      providerPlaceholder: {
        car: 'Hertz · Europcar · Toyota',
        flight: 'El Al · ANA',
        train: 'JR East',
        transit: 'Willer · Keisei',
        hotel: 'Booking.com · Airbnb · אתר המלון',
        restaurant: '',
        activity: 'Klook · GetYourGuide',
        other: '',
      } satisfies Record<BookingType, string>,
      locationLabel: 'מיקום',
      roomLabel: 'חדר',
      notesLabel: 'הערות',
      wifiTitle: 'WiFi',
      wifiHotelOnly: 'שדה למלון בלבד',
      wifiNetwork: 'רשת',
      wifiPassword: 'סיסמה',
      scheduledOn: (label: string) => `משובצת במסלול · ${label}`,
      notScheduled: 'לא משובצת במסלול · תזמון יתווסף בהמשך',
      save: 'שמירה',
      cancel: 'ביטול',
      delete: 'מחיקת ההזמנה',
    },
    form: {
      add: 'הזמנה חדשה',
      createTitle: 'הזמנה חדשה',
      originLabel: 'מוצא 📍',
      destLabel: 'יעד 📍',
      routeLabel: 'מסלול',
      // Title-row preview when neither endpoint is picked yet.
      routePreviewGhost: 'בחרו מוצא ויעד',
      routeHint: 'מקומות אמיתיים · מזינים את המפה ואזורי הזמן',
      // ── A HIRE'S TWO ENDS (ADR-0163 §1) ──────────────────────────────────
      // Not מוצא/יעד: a hire has two counters, and usually one. The same two
      // columns underneath (`fromPlaceId`/`toPlaceId`), different question.
      // The field's own heading. `מסלול` is a journey's word; a hire's two ends are
      // where you take the car and where you leave it.
      hireEndsLabel: 'איסוף והחזרה',
      pickupPlaceLabel: 'איסוף 🔑',
      pickupPlaceShort: 'איפה לוקחים את הרכב',
      dropoffPlaceLabel: 'החזרה 🏁',
      dropoffPlaceShort: 'איפה מחזירים',
      returnWhereLabel: 'מקום ההחזרה',
      returnSame: 'באותו מקום',
      returnElsewhere: 'במקום אחר',
      // The swap between the two endpoints (ADR-0154 §3). An existing transport event
      // carries one place and cannot say which end it is, so it lands in the origin and
      // this moves it — the correction that makes the guess safe.
      swapRoute: 'החלפת כיוון',
      // **The stop** (ADR-0159) — a layover, a change of train. `עצירה` and not
      // `עצירת ביניים` on the picker itself: the field is already inside a route, so
      // the two extra words would be saying "between" twice.
      stopLabel: 'עצירה 📍',
      stopShort: 'עצירה',
      addStop: 'עצירת ביניים',
      /** **The way home's own route** (ADR-0203 §6). Reported from the field: a round trip's
       *  stops "could be different stops and/or a different number of stops".
       *
       *  `אותה דרך` / `דרך אחרת` deliberately avoid the word `חזרה`, which already names the
       *  section — the rejected text-offer variant had to say `חזרה לאותה דרך` and would have
       *  used one word for two things in adjacent lines. */
      returnRouteAria: 'דרך החזרה',
      returnSameWay: 'אותה דרך',
      returnOtherWay: 'דרך אחרת',
      /** What a mirrored return IS, as a derived sentence rather than a control. */
      returnMirrors: 'אותן עצירות, בסדר הפוך',
      /** A return stop with no place cannot be flown to, scheduled or titled — the same
       *  refusal the outbound's stops already make, at the same field. */
      returnStopRequired: 'לכל עצירה בחזרה צריך מקום',
      // The direction control (ADR-0154 §4), offered on flight/train at create only.
      // Defaults to one-way: the control row costs 44px on every transport booking, and
      // the second leg a further 492px that only an explicit tap should buy.
      oneWay: 'כיוון אחד',
      roundTrip: 'הלוך ושוב',
      directionLabel: 'כיוון הנסיעה',
      // **Nothing is pre-selected** (field report #8), so the form has to be able to say
      // the question is still open. Phrased as the ask, not as an accusation.
      directionRequired: 'בחרו כיוון נסיעה',
      // The two leg headings. They appear in PAIRS or not at all — an unlabelled block
      // above a labelled one reads as a defect, and one-way keeps today's form.
      legOut: LEG.out,
      legBack: LEG.back,
      // **A journey with stops numbers its legs** (ADR-0159): with four schedules on
      // four steps, `הלוך`/`חזרה` alone stops telling you which one you are answering.
      legNumber: (n: number) => `קטע ${n}`,
      legBackNumber: (n: number) => `${LEG.back} · קטע ${n}`,
      stepLeg: (n: number) => `מתי · קטע ${n}`,
      stepBackLeg: (n: number) => `${LEG.back} · קטע ${n}`,
      // The three step names (ADR-0155 §5). They say what each step ASKS, not what it
      // contains — the read-out is one short line and a field list would not fit it. Two
      // of them change for a round trip: with two journeys `מתי` alone leaves you checking
      // which one you are answering.
      // The type is its own first step on a create (field report #2) — one word, because
      // the read-out is one short line and the grid under it says the rest.
      stepType: 'סוג',
      stepWhat: 'מה ואיפה',
      stepWhen: 'מתי',
      stepDetails: 'פרטים',
      // Back to the type grid from the collapsed row that replaced it.
      // **A lossy type switch asks once, at the tap, in three words** (owner, 2026-08-12:
      // _"really short and no need to list everything that will be deleted"_). `יימחקו` is
      // active and it is the accurate half of the two drafts: the fields genuinely are deleted
      // on save, they do not merely fail to carry over. Same shape as `manage.plainBody` —
      // one future-tense sentence, full stop. The cancel is the shared `common.cancel`: at the
      // TAP there is nothing to abandon, so it means "don't switch" and needs no other word.
      switchTitle: (type: string) => `להחליף ל${type}?`,
      switchBody: 'חלק מהפרטים יימחקו.',
      switchConfirm: 'החלפה',
      stepWhenOut: `מתי ${LEG.out}`,
      stepBackAndShared: `${LEG.back} ופרטים`,
      // Shared across every leg of the save, said where the question actually occurs.
      codeSharedHint: 'משותף לכל הקטעים',
      // The one refusal the second leg adds, marked on the return's DEPARTURE (ADR-0150).
      // Type-independent wording, so a flight and a train share it.
      returnBeforeArrival: 'החזרה יוצאת לפני ההגעה ליעד',
      // Its peer inside one journey (ADR-0159), marked on the leg that leaves too early.
      // Names the stop where it can, because with three legs "the previous arrival" is
      // one question too many.
      legBeforeArrival: (place?: string) =>
        place ? `היציאה לפני ההגעה ל${place}` : 'היציאה לפני ההגעה הקודמת',
      // A stop with no place cannot be flown to, scheduled or titled.
      stopRequired: 'בחרו מקום לכל עצירה',
      // `EventForm`'s own route hint: there both ends are optional (ADR-0136's "requires
      // nothing" survives), and what is given is what the map and the zones can read.
      routeHintOptional: 'שני הקצוות אופציונליים · מה שיימסר ייקרא במפה ובאזורי הזמן',
      // Which-zone caption under a booking's schedule (ADR-0107). Cities aren't
      // named (the route pickers show them); the point is "each end is local
      // time" + how far apart. `mag` is the Hebrew hour phrase (שעה/שעתיים/…);
      // `ahead` = the destination clock is ahead of the origin's (else behind).
      zoneNoteTransport: (mag: string, ahead: boolean) =>
        `זמן מקומי בכל עיר · ביעד ${mag} ${ahead ? 'קדימה' : 'אחורה'}`,
      // Single-place booking in a zone that differs from the trip's.
      zoneNotePlace: (mag: string, ahead: boolean) =>
        `זמן מקומי · המקום ${mag} ${ahead ? 'קדימה' : 'אחורה'}`,
      dateLabel: 'תאריך (משבץ במסלול)',
      departLabel: 'יציאה 🛫',
      arriveLabel: 'הגעה 🛬',
      flightDepartLabel: 'המראה 🛫',
      flightArriveLabel: 'נחיתה 🛬',
      checkinLabel: 'צ׳ק-אין 🏨',
      checkoutLabel: 'צ׳ק-אאוט 🧳',
      pickupLabel: 'איסוף 🔑',
      dropoffLabel: 'החזרה 🏁',
      startLabel: 'התחלה 🎬',
      endLabel: 'סיום 🏁',
      kindLabel: 'סוג אירוע',
      kindHard: 'קשיח',
      kindSoft: 'גמיש',
      titleRequired: 'צריך שם להזמנה',
      // Transport is identified by its route, not a name (ADR-0059 §3): the route
      // endpoints are the title row (short placeholders), and a route is required.
      originShort: 'מוצא',
      destShort: 'יעד',
      routeRequired: 'צריך מוצא או יעד',
      dateOutOfRange: 'התאריך מחוץ לטווח הטיול',
      endBeforeStart: 'זמן הסיום צריך להיות אחרי ההתחלה',
      reset: 'איפוס',
    },
    del: {
      linkedTitle: 'ההזמנה משובצת במסלול',
      linkedBody: 'יש אירוע במסלול שמסתמך על ההזמנה. מה לעשות?',
      hardNote: 'האירוע קשיח · מחויבות',
      both: 'מחיקת שניהם',
      bothSub: 'ההזמנה והאירוע במסלול יימחקו',
      unlink: 'ביטול השיוך · האירוע נשאר',
      unlinkSub: 'האירוע יישאר במסלול כרשומה ידנית',
      plainTitle: 'למחוק את ההזמנה?',
      plainBody: 'ההזמנה תוסר מהאינדקס.',
      // The other leg of a derived round trip (ADR-0154 §5): named, and said to survive.
      // A STATEMENT, never a fourth button — a destructive dialog growing an extra verb
      // is the defect ADR-0138 §2 logged. Two sentences rather than one template because
      // ההלוך and החזרה disagree on gender.
      pairNote: (leg: 'out' | 'back') =>
        leg === 'out'
          ? `ה${LEG.out} יישאר בטיול. המחיקה כאן לא נוגעת בו.`
          : `ה${LEG.back} תישאר בטיול. המחיקה כאן לא נוגעת בה.`,
      confirmDelete: 'מחיקה',
      cancel: 'ביטול',
    },
  },
  // פתקים (ADR-0152 / ADR-0153). `פתק` over the incumbent `הערות` — the group's own
  // scribbles rather than a records field, which is what this surface actually is.
  notes: {
    title: 'פתקים',
    one: 'פתק',
    // The mark's accessible name — it is an icon with an optional count, so a screen
    // reader needs the noun said out loud (the same shape `SyncBadge` uses).
    mark: (n: number) => (n === 1 ? 'פתק אחד' : `${n} פתקים`),
    head: {
      count: (n: number) => `${n} פתקים`,
    },
    // **The mirror of `manage.deleteBody`**, and the sentence no host's delete confirm said
    // (ADR-0152 §2): deleting a host destroys its notes in the database, and the confirm is
    // the only moment a reader can learn it. Gender-free on purpose — one sentence serves
    // ההזמנה, המסמך and האירוע, and three gendered copies of one fact is how copy drifts.
    hostDelete: (n: number) => (n === 1 ? 'פתק אחד יימחק' : `${n} פתקים יימחקו`),
    // The tile's one changing line: the newest note, with who wrote it. A collection has
    // no "next" and no type groups, but it has a newest — and the real question at a
    // glance is what someone just wrote that you have not read.
    tile: {
      latest: (author: string, text: string) => `${author}: ${text}`,
      empty: 'אין עדיין פתקים',
    },
    add: 'פתק חדש',
    filter: {
      all: 'הכל',
      categoryLabel: 'סינון לפי קטגוריה',
      noResults: 'אין פתקים בקטגוריה הזאת',
    },
    search: {
      button: 'חיפוש',
      modeTitle: 'חיפוש בפתקים',
      placeholder: 'חיפוש בכותרת, בגוף ובקישור',
      clear: 'ניקוי',
      backAria: 'סגירת החיפוש',
      noResults: 'אין פתק שמתאים לחיפוש',
    },
    empty: {
      title: 'עדיין אין פתקים',
      body: 'דברים קטנים שכדאי לזכור: איפה הכניסה, מה השעה האחרונה, קישור ששלחו לכם.',
      action: 'כתיבת פתק',
    },
    // The editor. The body leads, but EVERY field here is optional on its own — a link is a
    // whole note — so the one refusal is about the note, not about a field, and reads in the
    // form's slot rather than reddening a box (ADR-0150, owner 2026-08-02).
    sheet: {
      createTitle: 'פתק חדש',
      editTitle: 'עריכת פתק',
      bodyLabel: 'מה כדאי לדעת',
      // Both boxes say what goes in them, not what someone else wrote (owner, 2026-08-02).
      // A sample note reads as content on a blank form — the same reason every other
      // placeholder in this file is `שם ההזמנה` / `שם לזיהוי המסמך`. The url keeps its shape
      // hint, which tells you the scheme is optional rather than showing you a note.
      bodyPlaceholder: 'משהו שכדאי לזכור',
      titleLabel: 'כותרת · לא חובה',
      titlePlaceholder: 'כותרת קצרה',
      urlLabel: 'קישור · לא חובה',
      urlPlaceholder: 'instagram.com/p/',
      categoryLabel: 'קטגוריה',
      // **Where an unchosen category came from**, per host kind (ADR-0152 §5's amendment: a
      // hosted note's category is RESOLVED, never copied). It is the leading pill's label and
      // the collapsed row's caption, so the state is stated rather than left to be guessed
      // from a pre-filled selection. A `Record` over the five hostable kinds, so a sixth host
      // has to answer here rather than silently inheriting someone else's noun.
      categoryFrom: {
        booking: 'לפי ההזמנה',
        event: 'לפי האירוע',
        place: 'לפי המקום',
        maybeItem: 'לפי הרעיון',
        document: 'לפי המסמך',
      } as const satisfies Record<keyof typeof NOTE_HOST_FIELD, string>,
      save: 'שמירה',
      cancel: 'ביטול',
      needsBodyOrUrl: 'כדי לשמור צריך לכתוב משהו או להוסיף קישור',
    },
    // The composer on a host's form (ADR-0152 §6b). No title field, no category, no second
    // save — one box, and a blank one writes nothing.
    composer: {
      // **Still used by `DocumentUploadSheet` and `MapPlaceForm`**, which keep the composer in
      // a `Field` of its own. The event and booking forms do not: ADR-0192 §2 folded their
      // composer into the notes SECTION, so it is named by the section header and needs no
      // label at all. `labelMore` ('פתק חדש · לא חובה') retired with the same change — it
      // existed only because those forms rendered the word `פתקים` twice in a row.
      label: 'פתקים · לא חובה',
      placeholder: 'משהו שכדאי לזכור על זה',
      another: 'פתק נוסף',
      add: 'פתק נוסף',
      remove: 'הסרת הפתק',
      // The INHERITANCE only (owner, 2026-08-11). The `＋` clause it used to carry restated
      // that button's own label (`פתק נוסף`), so a host with nothing to inherit — a document,
      // a place — now shows no hint at all rather than a plainer restatement.
      hint: 'יורש את הקטגוריה והסמל',
    },
    // An OPEN note (ADR-0153 §4's 2026-08-02 amendment, round two). The row expands where it
    // is rather than opening a sheet, so this is the one line under it: where the note
    // belongs, and the one verb. The author and the time are on the row already.
    open: {
      general: 'פתק כללי',
      edit: 'עריכה',
      // **The way in to the note's own screen** (ADR-0202 §1). `תצוגה מלאה` and not the
      // shorter `מסך מלא` the mockup drew: `FilePicker` already names this exact action
      // `תצוגה מלאה: {name}` when it opens `MediaViewer`, and one meaning with two nouns is
      // how a vocabulary drifts (ADR-0138's recurring finding). It costs ~22px more on an
      // 11.5px line than the invented word did, which is what `row-open.css`'s truncation
      // rule is there to absorb.
      full: 'תצוגה מלאה',
      openLink: 'פתיחת הקישור',
      /** The accessible name for the way in, which the visible label (the host's own name)
       *  does not say on its own. */
      toHost: (name: string) => `מעבר אל ${name}`,
    },
    // The note's own screen (ADR-0202 §2). No title of its own beyond `notes.one` — the bar
    // says what KIND of thing you are reading and the note's words say the rest, which is
    // ADR-0153 §4's rule for the row one surface up.
    full: {
      backAria: 'חזרה מהפתק',
    },
    // The note section on a detail surface, where the body lives.
    section: {
      title: 'פתקים',
      add: 'פתק',
      empty: 'אין פתקים על זה',
    },
    manage: {
      actions: 'פעולות על הפתק',
      edit: 'עריכה',
      openHost: 'מעבר למה שהפתק שייך אליו',
      delete: 'מחיקה',
      deleteTitle: 'למחוק את הפתק?',
      // Says what is NOT harmed: the host outlives its notes, and a delete confirm that
      // does not say so invites the reader to assume the worst.
      deleteBody: (host?: string) =>
        host ? `הפתק ייעלם אצל כולם. ${host} לא ייפגע.` : 'הפתק ייעלם אצל כולם.',
      confirmDelete: 'מחיקה',
      cancel: 'ביטול',
    },
    toast: {
      saved: 'הפתק נשמר',
      savedQueued: 'הפתק יישלח כשהחיבור יחזור',
      deleted: 'הפתק נמחק',
    },
  },
  // Tasks (tasks brief, ADR-0188). **One noun — משימה** — for a manual task and, from phase
  // 2, for a derived readiness check too: ADR-0152 §3's two-noun rule does not transfer,
  // because it was bought by machine VOLUME and readiness has five closed checks.
  tasks: {
    title: 'משימות',
    one: 'משימה',
    add: 'משימה חדשה',
    /** The tick's accessible name — a bare ✓ says nothing about which row it closes. */
    tick: (title: string) => `סימון «${title}» כהושלמה`,
    /** **A parent's leading element is a READ** (ADR-0196 §3), so it is named rather than
     *  labelled as a control: a sighted reader gets the arc, a screen reader gets this. */
    progress: (done: number, total: number) => `הושלמו ${done} מתוך ${total}`,
    /** The mark on a host's row (ADR-0191). Named for a screen reader the way `NoteMark`
     *  and `DocumentMark` are, so it is not a mystery glyph. It counts OPEN tasks. */
    mark: (n: number) => (n === 1 ? 'משימה פתוחה אחת' : `${n} משימות פתוחות`),
    /** A host's own tasks section (ADR-0191 §5) — `NoteSection`'s shape, its own words. */
    section: {
      title: 'משימות',
      add: 'משימה',
      empty: 'אין משימות',
    },
    head: {
      count: (n: number) => (n === 1 ? 'משימה אחת' : `${n} משימות`),
    },
    subject: {
      /** A real state and the default, never a missing value (brief §6). The word names the
       *  state rather than claiming one — `של כולנו` belongs to phase 6's `everyone`, and
       *  spending it here is what made a presumed default read as a false claim. */
      group: 'לא משויך',
      /** An automatic task's subject line (ADR-0188 §5). It states, once and above the
       *  verbs that remain, why `עריכה` and `מחיקה` are not among them — an absence with a
       *  reason over it is a behaviour; an absence with none is a bug. */
      derived: 'מתעדכנת לבד לפי הטיול',
    },
    due: {
      // ADR-0171's shipped deadline word, reused rather than re-invented.
      by: 'עד',
      // Overdue is a STATUS, so it takes `--miss` and its own word. The `·` is the app's
      // separator; an em dash is never used in UI copy.
      late: 'באיחור ·',
    },
    /** The Trip Home band (ADR-0188 §6). It says `today` rather than `tasks` because the
     *  band is not the collection — the section is the subset that is due, and the tile is
     *  where the collection lives. Absent entirely when nothing is due, so there is no empty
     *  string to write here. */
    band: {
      /** `קרובות`, not `להיום` — the window is a week (`TASK_BAND_LOOKAHEAD_DAYS`), and a
       *  section titled "today" listing something due Friday is simply wrong. */
      title: 'משימות קרובות',
      /** The section-title end, and it only appears when something is actually late. */
      overdue: (n: number) => (n === 1 ? 'אחת באיחור' : `${n} באיחור`),
      /** The overflow row into the tasks screen — one more row in the same card. */
      more: (n: number) => (n === 1 ? 'עוד משימה אחת' : `עוד ${n} משימות`),
    },
    // The tile's one changing line: what is due soonest, with an overdue count when there is
    // one (brief §13). A raw open-count barely moves and answers nothing.
    tile: {
      next: (text: string) => `הבאה: ${text}`,
      overdue: (n: number) => (n === 1 ? 'אחת באיחור' : `${n} באיחור`),
      empty: 'אין משימות פתוחות',
    },
    filter: {
      label: 'סינון משימות',
      all: 'הכל',
      mine: 'שלי',
      // Done AND dismissed. One word for both, because what the reader wants is "the ones I
      // am finished with" and the row itself says which kind it was.
      settled: 'הושלמו',
      // **Facet-neutral, and that is the whole requirement.** It was `הכל סגור` for a day,
      // which is a claim rather than an empty state: with `הושלמו` picked and nothing settled
      // it said "everything is closed" about a list of open tasks, and under `שלי` it spoke
      // for other people's rows. One string serves three facets, so it may not describe any.
      noResults: 'אין כלום כאן',
    },
    empty: {
      title: 'עדיין אין משימות',
      body: 'דברים שצריך לסגור לפני שממשיכים: להזמין, לאסוף, לשלם, לבדוק.',
      action: 'משימה ראשונה',
    },
    // The editor. The title is the one required field — a task with no title is nothing —
    // so it is the one refusal, and it marks the box that can cure it (ADR-0150).
    sheet: {
      createTitle: 'משימה חדשה',
      editTitle: 'עריכת משימה',
      titleLabel: 'מה צריך לעשות',
      // Says what goes in the box, not what someone else wrote — the rule the NOTES form
      // already settled (owner, 2026-08-02: "a sample note reads as content on a blank
      // form"), which this form shipped without following. `להזמין את המסעדה` read as a
      // task already typed. `אחד` earns its place: it is the model's own bound, since a task
      // holding a checklist is a separate feature nobody has built.
      titlePlaceholder: 'משהו אחד שצריך לעשות',
      needsTitle: 'צריך לכתוב מה המשימה',
      dueLabel: 'עד מתי · לא חובה',
      addDate: 'הוספת תאריך',
      addTime: 'הוספת שעה',
      timeLabel: 'שעת יעד',
      clearDue: 'ללא תאריך',
      // **The second door** (ADR-0197 §7): the ask that appears under the deadline field the
      // moment a deadline is on the draft, once per install, dismissible, never re-asked.
      // A question rather than a claim, because taking it opens the platform's own prompt and
      // this line must not promise what that prompt may refuse.
      notifyAsk: {
        text: 'שנזכיר לכם כשהמשימה תגיע?',
        action: 'הפעלת התראות',
      },
      assigneeLabel: 'מי אחראי',
      nobody: 'לא משויך',
      bodyLabel: 'פרטים · לא חובה',
      bodyPlaceholder: 'משהו שכדאי לדעת כדי לסגור את זה',
      // Not inflected for `משימה`: this labels a mark, it does not describe the task.
      importantLabel: 'חשוב',
      save: 'שמירה',
      cancel: 'ביטול',
      /** **The checklist field, fourth in the form** (ADR-0196 §12) — after `מי אחראי` and
       *  before `פרטים`. `· לא חובה` because the form marks its optional fields that way and
       *  most tasks have no steps. */
      subtasksLabel: 'תתי משימות · לא חובה',
    },
    /** **A task's own checklist** (ADR-0196). The word is `תת משימה` / `תתי משימות`, the
     *  owner's call over the first draft's `משימות בפנים`: the ENTITY stays one noun (one
     *  table, one row shape, one tick, one sort), and what that rule cannot do is name a
     *  field inside a task's own editor, where `משימות` is ambiguous with the task being
     *  edited. */
    subtasks: {
      /** The way in, in every open row's foot and in the editor's empty field. Present even
       *  on a task with no steps — otherwise nothing could get its first one. */
      add: 'תת משימה',
      /** The composer's box. Says what goes in it, never a sample step — the rule the notes
       *  form settled and this one follows. */
      first: 'תת משימה ראשונה',
      another: 'תת משימה נוספת',
      remove: 'הסרת תת המשימה',
      /** Who owes this step. The chip is a control, so it is named for a reader who cannot
       *  see the face in it. */
      assign: 'מי אחראי לתת המשימה',
      /** Refused at the cap rather than silently truncated (`TASK_SUBTASK_CAP`). */
      full: (n: number) => `אפשר עד ${n} תתי משימות במשימה אחת`,
      /** **The parent's own tick** (ADR-0196 §3, reversed 2026-08-19). It is a control again,
       *  so it is named for what pressing it does — and the fraction stays in the name,
       *  because for a reader who cannot see the arc the name is the only place it was. */
      tickAll: (title: string, done: number, total: number) =>
        `סימון כל תתי המשימות של «${title}» · הושלמו ${done} מתוך ${total}`,
      /** One press writes several rows, so it is confirmed once and undoable once. */
      allTicked: (n: number) => (n === 1 ? 'תת משימה אחת סומנה' : `${n} תתי משימות סומנו`),
      allReopened: (n: number) => (n === 1 ? 'תת משימה אחת הוחזרה' : `${n} תתי משימות הוחזרו`),
    },
    manage: {
      actions: 'פעולות על המשימה',
      edit: 'עריכה',
      flag: 'סימון כחשוב',
      unflag: 'ביטול הסימון כחשוב',
      // Dismissing is not doing — it stopped mattering, which is the other outcome and not
      // the absence of one.
      dismiss: 'הסרה מהרשימה',
      reopen: 'החזרה לרשימה',
      delete: 'מחיקה',
      deleteTitle: 'למחוק את המשימה?',
      deleteBody: 'המשימה תיעלם אצל כולם.',
      confirmDelete: 'מחיקה',
      cancel: 'ביטול',
    },
  },
  docs: {
    title: 'מסמכים',
    encrypted: 'מוצפן',
    add: 'מסמך חדש',
    loading: 'טוען מסמכים…',
    offline: 'המסמכים ייטענו כשנחזור לרשת',
    emptyTitle: 'אין עדיין מסמכים שמורים',
    emptyBody: 'דרכונים, כרטיסים וביטוח · מוצפנים ונשמרים בבטחה',
    emptyAdd: 'העלאת מסמך ראשון',
    group: {
      passport: 'דרכונים',
      visa: 'ויזות',
      license: 'רישיונות',
      ticket: 'כרטיסים',
      reservation: 'אישורי הזמנה',
      insurance: 'ביטוח נסיעות',
      health: 'בריאות',
      other: 'אחר',
    },
    // One short word per pill — in the type picker (`DocumentTypePills`) and, since
    // ADR-0052 §7, on the section's filter chips too. Short is what lets eight of them ride
    // one scrollable row instead of three rows of cards.
    type: {
      passport: 'דרכון',
      visa: 'ויזה',
      license: 'רישיון',
      ticket: 'כרטיס',
      reservation: 'הזמנה',
      insurance: 'ביטוח',
      health: 'בריאות',
      other: 'אחר',
    },
    // **Extra words the search matches, never displayed** — the same idea as
    // `index.bookingTypeSynonyms`, and it earns its place for the same reason: what people
    // type is the thing in their hand, not the category we filed it under. Widened on the
    // owner's call (2026-08-13) from the first sparse pass; two rules govern what may join.
    //
    // **1. The match is `term.includes(query)`, not the other way round** (`matchesAnyTerm`),
    // which is what makes partial typing work and is worth reading before adding a word. A
    // LONGER, more specific term is nearly free — `ביטוח בריאות` on `health` is reached by
    // `ביטוח`, `ביטוח ב`, `בריאות`, and it cannot be reached by anything it does not contain.
    // A SHORT term is the one to think about, because every prefix of it now matches. It also
    // means a word already in the label or the plural (`t.docs.type` / `t.docs.group`, both
    // already search terms) does not belong here — `דרכון` and `דרכונים` are covered.
    //
    // **2. A word belongs to a type only if someone typing it wants THAT type's documents.**
    // Bookings learned this the expensive way: leaving the car words on `transit` made every
    // bus answer a search for `השכרת רכב`. `other` therefore gets nothing by definition.
    //
    // Two consequences worth naming rather than discovering:
    //
    //  - **A word may legitimately sit on two types.** `ביטוח` reaches both the travel policy
    //    and the health cover; `רפואי` reaches both. That is not the bus problem — both
    //    answers are ones the person asking wants, which is the test, not uniqueness.
    //  - **`רכב` is a prefix of `רכבת`**, so searching for the car hire also surfaces rail
    //    tickets. Inherent to substring matching in Hebrew and not worth exact-word matching
    //    to fix, since that would break partial typing on every other query. Pinned in
    //    `lib/documents.test.ts` so it stays a known behaviour instead of a surprise.
    typeSynonyms: {
      passport: ['פספורט', 'passport'],
      // `אשרה` is the formal word the stamp itself uses; `esta`/`eta` are the travel
      // authorisations people photograph and would never think to call a visa.
      visa: ['אשרה', 'אשרת כניסה', 'visa', 'esta', 'eta'],
      // `רשיון` without the yod is at least as commonly typed as the label's spelling, and no
      // amount of normalising reaches it — `normalizeSearchTerm` folds punctuation, not
      // orthography. `בינלאומי` is how the IDP is asked for at a hire desk.
      license: [
        'נהיגה',
        'רישיון נהיגה',
        'רשיון',
        'רשיון נהיגה',
        'בינלאומי',
        'רישיון בינלאומי',
        'idp',
        'license',
      ],
      // The one type whose label is the LEAST likely thing typed: you look for the boarding
      // pass or the rail pass, not for the generic word `כרטיס`. No venue words (`מוזיאון`,
      // `הופעה`) — only SOME tickets are those, so they would make every ticket answer.
      ticket: [
        'בורדינג',
        'בורדינג פס',
        'בורדינג פאס',
        'boarding',
        'עלייה למטוס',
        'כרטיס טיסה',
        'טיסה',
        'מטוס',
        'רכבת',
        'רכבות',
        'שינקנסן',
        'jr pass',
        'כרטיס כניסה',
      ],
      // A confirmation is remembered by what was booked, which is exactly the vocabulary
      // `BOOKING_TYPE` uses next door — so a hotel confirmation answers `מלון` and the car
      // hire answers `רכב`/`אוטו`. The car words live here rather than on `license` because
      // this is the document the hire desk issued; the licence is what you already had.
      reservation: [
        'אישור',
        'אישור הזמנה',
        'booking',
        'מלון',
        'מלונות',
        'הוסטל',
        'צימר',
        'airbnb',
        'לינה',
        'מסעדה',
        'שולחן',
        'רכב',
        'רכב שכור',
        'השכרת רכב',
        'השכרה',
        'אוטו',
        'מכונית',
        'רנט א קאר',
      ],
      // The label is `ביטוח`, so what is missing is the paperwork's own noun and the kind of
      // cover — `ביטוח נסיעות` is already the plural label and needs no entry.
      insurance: ['פוליסה', 'פוליסת ביטוח', 'ביטוח רפואי', 'כיסוי', 'insurance'],
      health: [
        'ביטוח בריאות',
        'תעודת חיסון',
        'חיסון',
        'חיסונים',
        'תרכיב',
        'מרשם',
        'תרופה',
        'תרופות',
        'בדיקה',
        'קורונה',
        'covid',
        'health',
      ],
      other: [],
    } as const satisfies Record<DocumentType, readonly string[]>,
    filter: {
      all: 'הכל',
      categoryLabel: 'סינון לפי סוג',
      noResults: 'אין מסמכים מהסוג הזה',
    },
    search: {
      button: 'חיפוש מסמכים',
      modeTitle: 'חיפוש מסמכים',
      // Names the type label as a thing you can search by, because it is the half of this
      // that nobody would guess — the same service `index.search.placeholder` does with
      // `או קטגוריה`.
      placeholder: 'חפשו לפי שם או סוג…',
      clear: 'ניקוי',
      backAria: 'סגירת חיפוש',
      noResults: 'לא נמצאו מסמכים',
    },
    upload: {
      title: 'העלאת מסמך',
      subtitle: 'מוצפן מקצה לקצה',
      typeLabel: 'סוג',
      fileLabel: 'קובץ',
      pickHint: (mb: number) => `תמונה או PDF · עד ${mb}MB`,
      fileRequired: 'צריך לבחור קובץ',
      titleLabel: 'שם',
      titlePlaceholder: 'שם לזיהוי המסמך',
      save: 'העלאה',
      saving: 'מעלה…',
      queued: 'ממתין להעלאה',
      cancel: 'ביטול',
      saved: 'המסמך הועלה',
      failed: 'ההעלאה נכשלה, נסו שוב',
      tooLarge: (mb: number) => `הקובץ גדול מדי · עד ${mb}MB`,
      wrongType: 'אפשר להעלות תמונה או PDF בלבד',
      offline: 'אין חיבור · ההעלאה תמתין לרשת',
    },
    viewer: {
      // No `close`: the viewer has no ✕ (owner, 2026-08-05). Its ways out are the backdrop,
      // system back and Escape, and none of them is labelled.
      loading: 'טוען ומפענח…',
      error: 'לא הצלחנו לפתוח את המסמך',
      open: 'פתיחה בכרטיסייה',
      download: 'הורדה',
    },
    // Per-row manage menu + optimistic-action toasts (ADR-0052).
    manage: {
      actions: 'פעולות',
      // Verbal nouns, matching every other row menu (the register rule, top of this file).
      edit: 'עריכה',
      delete: 'מחיקה',
      nameField: 'שם',
      save: 'שמירה',
      saved: 'המסמך עודכן',
      deleteTitle: 'למחוק את המסמך?',
      deleteBody: 'הקובץ נמחק לגמרי. אין דרך לשחזר אותו.',
      deleteConfirm: 'מחיקה סופית',
      cancel: 'ביטול',
      deleted: 'המסמך נמחק',
      failed: 'הפעולה נכשלה, נסו שוב',
    },
    // The attach slot on a host's own form (ADR-0173 §5). `attach` is the empty state's ONE
    // control — the header, the chip list and the split into two entrances only appear once
    // something is attached, which is what keeps the empty case at 40px instead of 86px.
    attach: {
      attach: 'צירוף מסמך',
      title: 'מסמכים',
      pick: 'מסמך קיים',
      upload: 'העלאה',
      detach: 'ביטול הצירוף',
      // The picker sheet's own words.
      pickTitle: 'בחירת מסמך',
      pickEmpty: 'אין מסמכים לצרף. אפשר להעלות מסמך חדש.',
      pickAll: 'כל המסמכים כבר מצורפים כאן.',
      cancel: 'ביטול',
      attached: 'המסמך צורף',
      detached: 'הצירוף בוטל',
    },
    // The row mark's accessible name (ADR-0174 §1) — an icon with an optional count, so a
    // screen reader needs the noun said out loud. `t.notes.mark`'s shape exactly.
    mark: (n: number) => (n === 1 ? 'מסמך מצורף אחד' : `${n} מסמכים מצורפים`),
    // The read section's header, on every surface that shows what a host carries.
    section: 'מסמכים',
    // Where an INHERITED document came from — a place displays a context's documents and can
    // never originate one (ADR-0173 §4), so it says whose they are.
    from: (host: string) => `מתוך ${host}`,
    open: 'פתיחת המסמך',
  },
  mode: {
    // The toggle is icons-only in the day row (ADR-0149 §3), so these two are the
    // buttons' accessible names rather than painted labels — same words either way.
    group: 'מצב',
    plan: 'תכנון',
    trip: 'טיול',
    autoHint: (date: string) => `יתחלף אוטומטית ב-${date}`,
  },
  modeEmphasis: {
    home: { plan: 'לוח הכנה', trip: 'לוח יציאה' },
    map: { plan: 'מחקר מקומות', trip: 'התמצאות' },
    index: { plan: 'הוספת הזמנות', trip: 'מסמכים' },
    days: { plan: 'בניית המסלול', trip: 'מעקב והתאמה' },
  },
  snapshot: {
    loading: 'טוען את הטיול…',
    errorTitle: 'לא הצלחנו לטעון את הטיול',
    // Chrome-preserving error state (U-10): a friendly cause line instead of the
    // raw error, next to a working retry button.
    errorBody: 'בדקו את החיבור ונסו שוב.',
  },
  shell: {
    booting: 'טוען…',
    // First "back" at the in-trip Home arms this; a second within a few seconds
    // leaves to the all-trips list (ADR-0035 §1, refinement) — a guard against
    // an accidental swipe yanking you out of the trip you're using. Casual voice
    // (matches zeroState), gesture-agnostic ("עוד פעם", not "swipe again").
    leaveTripHint: 'עוד פעם ויוצאים מהטיול 👋',
    login: {
      heroLine1: 'כל הטיול שלכם.',
      heroLine2Prefix: 'מסך',
      heroLine2Em: 'אחד',
      tagline: 'מה עכשיו, מה הבא בתור, ואיפה כל ההזמנות - בזמן שאתם שם, גם בלי קליטה.',
      teaserLabel: 'הבא בתור',
      teaserTime: '19:30',
      teaserTitle: 'קמדן מרקט',
      teaserMeta: '📍 5 דק׳ הליכה',
      teaserCountdown: '38',
      teaserCountdownUnit: 'דקות',
      featBookings: 'כל ההזמנות, גם אופליין',
      featMap: 'הכל נעוץ על המפה',
      featSync: 'כולם רואים אותו דבר',
      continueWithGoogle: 'המשך עם Google',
      offline: 'צריך חיבור לרשת כדי להתחבר',
      note: 'כל אחד מתחבר עם החשבון האישי שלו.',
      noteExtra: 'המסלול מסתנכרן ליומן האישי · הזמנות נכנסות מ-Gmail רק באישור שלך.',
    },
    zeroState: {
      hello: (name: string) => `היי, ${name} 👋`,
      connected: (email: string) => `מחובר · ${email}`,
      offSignal: 'אין שידור',
      boardOffTitle: 'הלוח עוד כבוי',
      boardOffBody: "טיול ראשון מדליק אותו - מה עכשיו, מה הבא, וכל ההזמנות של החבר'ה במקום אחד.",
      create: 'טיול חדש',
      createSub: 'כשאתם מארגנים',
      join: 'הצטרפות עם לינק',
      joinSub: 'קיבלתם לינק מחבר',
      joinToast: 'קיבלתם לינק מחבר? פשוט פותחים אותו - ותוך שנייה אתם בפנים',
      offline: 'יצירה והצטרפות צריכות חיבור לרשת',
      teach: 'בדרך כלל אחד פותח את הטיול, וכל השאר נכנסים עם הלינק שלו.',
    },
    stub: {
      newTrip: 'טיול חדש',
      join: 'הצטרפות לטיול',
      settings: 'הגדרות טיול',
      comingSoon: 'המסך הזה עוד בעבודה.',
    },
    newTrip: {
      back: 'חזרה',
      title: 'טיול חדש',
      lede: 'שלוש שאלות ויש טיול. בשאר נטפל אחר כך.',
      destLabel: 'לאן נוסעים?',
      destPlaceholder: 'יפן, יוון, גיאורגיה…',
      // Destination picker (ADR-0113) — a Google Places pick at any granularity.
      destPickerTitle: 'לאן נוסעים?',
      destSearchPlaceholder: 'עיר, אזור או מדינה…',
      destUseTyped: (name: string) => `שימוש ב"${name}"`,
      // The derived primary timezone, shown inline + editable (never a forced step).
      tzLabel: 'אזור זמן',
      tzMultiNote: 'היעד משתרע על כמה אזורי זמן · זו נקודת התחלה, אפשר לשנות',
      datesLabel: 'מתי?',
      // The two boxes sit under one label with no caption of their own, so an empty
      // field says which end it is (the native placeholder used to, badly).
      dateFrom: 'יציאה',
      dateTo: 'חזרה',
      dateError: 'רגע - תאריך הסיום לפני ההתחלה',
      datePast: 'רגע - התאריך כבר עבר',
      nameLabel: 'איך נקרא לזה?',
      namePlaceholder: 'נציע שם ברגע שנדע לאן',
      draftGhost: 'הטיול שלכם',
      draftPending: 'עוד רגע מקבל צורה…',
      draftMeta: (destination: string, days: number) => `${destination} · ${days} ימים`,
      draftTag: 'טיוטה',
      createButton: 'יאללה, יש טיול 🎉',
      ctaReason: 'מלאו יעד, תאריכים ושם כדי להמשיך',
      // …and if you press anyway, the CTA names the one that is missing, at the field
      // (ADR-0150). The note above says what is needed; these say where.
      destRequired: 'חסר יעד',
      datesRequired: 'חסרים תאריכים',
      nameRequired: 'חסר שם לטיול',
      offlineNote: 'יצירת טיול צריכה חיבור · לינק שחבר שולח ייפתח גם עכשיו',
      note: 'אזור זמן ומטבע מסתדרים לפי היעד · תקציב אפשר להוסיף אחר כך',
    },
    created: {
      modePill: 'מצב תכנון',
      emoji: '🎉',
      title: 'יש טיול!',
      sub: "עכשיו הכי חשוב - להכניס את החבר'ה.",
      inviteLabel: 'לינק הזמנה',
      invitePending: 'טוען לינק הזמנה…',
      inviteFailed: 'הלינק יהיה מוכן בהגדרות הטיול',
      inviteCopied: 'הלינק הועתק · שתף בקבוצת הוואטסאפ',
      teach: 'שולחים בקבוצה, וכל אחד מצטרף עם החשבון שלו - זה הכול.',
      planButton: 'לתכנון הטיול',
      laterButton: 'אשלח את הלינק אחר כך',
      laterToast: 'הלינק מחכה בהגדרות הטיול',
      // Trip birth's board — its first departure is the trip itself (ADR-0142 §2).
      boardLabel: 'לוח הטיול',
      boardLive: 'הלוח דולק',
      boardFirst: 'ההמראה הראשונה',
      boardDays: (n: number) => `${n} ימים`,
      // Names the tap target that lands the sequence. Never rendered as text — the
      // skip layer is invisible by design, so this is its accessible name only.
      skip: 'דילוג',
    },
    join: {
      loading: 'טוען את הלינק…',
      // The pass's stamp (ADR-0143). Short enough to read inside a rotated stamp on a
      // dark ticket — a sentence would not fit and would not read as a stamp.
      stamp: 'מצטרפים',
      stampRefused: 'פג תוקף',
      refusedTitle: 'הלינק כבר לא בתוקף',
      invalid: 'הלינק הזה כבר לא בתוקף. אפשר לבקש מהחבר שישלח לינק חדש.',
      expired: 'הטיול הזה כבר הסתיים · הלינק כבר לא פעיל.',
      offline: 'צריך חיבור לרשת כדי לטעון את הלינק',
      heroTitle: 'הוזמנת לטיול!',
      ticketBadge: 'הזמנה לטיול',
      members: (count: number) =>
        count === 1 ? 'נוסע אחד כבר בפנים' : `${count} נוסעים כבר בפנים`,
      membersSub: 'מחכים רק לך',
      joinButton: 'הצטרפות לטיול',
      joinError: 'ההצטרפות נכשלה · אפשר לנסות שוב',
      // DELIBERATELY NO "you were removed" string (owner, 2026-07-31). A blocked join
      // renders the same refused pass, with the same words, as an invalid code — naming
      // the block would disclose a roster decision to someone who is no longer a member.
      // If this line ever comes back, that is the reason it should not.
      note: 'תוך שנייה אתם בפנים · מתחברים עם החשבון האישי, והכול נפתח מיד',
    },
    switcher: {
      title: 'הטיולים שלך',
    },
    allTrips: {
      back: 'חזרה לטיול',
      title: 'הטיולים שלי',
      sectionNow: 'עכשיו',
      sectionSoon: 'בקרוב',
      sectionPast: 'הסתיים',
      chipSoon: (days: number) => countdownText(days),
      create: 'טיול חדש',
      offlineNote: 'מעבר בין טיולים שמורים עובד גם אופליין · יצירה צריכה חיבור',
    },
    account: {
      title: 'החשבון שלי',
      provider: 'מחובר עם Google',
      signOut: 'התנתקות',
      // The user settings page (ADR-0133). It replaces the account sheet, so it
      // inherits its title — the surface changed, the thing it is called did not.
      back: 'חזרה',
      identity: 'הזהות שלי',
      nameLabel: 'שם',
      sharedHint: 'השם והתמונה נראים לכל מי שנוסע איתכם.',
      // The theme control (ADR-0158 §8). Three rungs: `system` keeps following
      // the phone, which is why it is a rung rather than the absence of one.
      display: 'תצוגה',
      themeLabel: 'ערכת נושא',
      themeSystem: 'מערכת',
      themeLight: 'בהיר',
      themeDark: 'כהה',
      themeHint: 'הבחירה נשמרת במכשיר הזה. במצב מערכת האפליקציה עוקבת אחרי הטלפון.',
      // The home currency (ADR-0180 §2). Its hint has to say ACCOUNT where its
      // neighbour above says device — a row that inherited the theme's promise
      // would state the opposite of the truth.
      currencyLabel: 'מטבע',
      currencyHint: 'המטבע נשמר בחשבון ומגיע איתכם לכל מכשיר · לפיו מחושבת כל המרה בטיול.',
      currencyUnset: '-',
      mapStorage: 'מפות אופליין',
      mapStorageSize: 'כל המפות',
      mapStorageClear: 'למחוק הכל',
      mapStorageWorld: 'מפת העולם',
      mapStorageUnknownTrip: 'טיול שכבר לא קיים',
      mapStorageDelete: 'מחיקה',
      mapStorageDeleteTrip: (name: string) => `מחיקת ${name}`,
      mapStorageHint: 'המפות שמורות רק במכשיר הזה · מחיקה לא נוגעת במקומות או בפרטי הטיול.',
      // The notifications section (ADR-0197 §7.1, ADR-0198 §6). TWO cards, because the
      // device half and the preferences half have opposite persistence and ADR-0180 §2
      // already settled that this means one hint per card.
      notifications: 'התראות',
      notifyLabel: 'קבלת התראות',
      notifyDeviceHint: 'ההתראות נשמרות במכשיר הזה · בכל מכשיר צריך להפעיל אותן בנפרד.',
      // The five states where there is no switch. A control that reliably does nothing is
      // worse than no control, so each of these is a SENTENCE and the switch is absent.
      notifyGranted: 'ההרשאה כבר ניתנה בדפדפן הזה · הפעלה כאן לא תשאל שוב.',
      notifyDenied: 'חסמתם התראות מהאפליקציה הזאת · אפשר להחזיר רק מהגדרות הדפדפן, לא מכאן.',
      // No pseudo-markup for the emphasis the mockup drew: a copy string that carries its
      // own bold tags is a second templating language living in the i18n file, and the
      // sentence carries itself. The gershayim are the app's own quoting convention
      // (`נתב״ג`, `ק״מ`), not straight quotes.
      // Shortened when the install surface arrived (ADR-0204 §6). It used to teach the
      // share-sheet gesture here, in full, because this was the only place that could —
      // and that made two places in the app explaining one gesture. Now it states the
      // rule and points at the row directly below it, which is where the gesture is
      // actually drawn.
      notifyNeedsInstall:
        'באייפון ההתראות עובדות רק כשהאפליקציה על מסך הבית · אפשר להתקין אותה בשורה שמתחת.',
      notifyUnsupported: 'הדפדפן הזה לא יודע לקבל התראות · בכרום או בספארי זה יעבוד.',
      notifyFailed: 'לא הצלחנו להפעיל התראות במכשיר הזה. אפשר לנסות שוב.',
      notifyOff: '-',
      notifyBlockedValue: 'כבוי בדפדפן',
      // The categories card. TWO switches, for phases A and B — and `notifyGroup` still
      // absent, because a preference for a phase that may never ship is a promise and not a
      // control (ADR-0198 §6, amended).
      notifyTasksLabel: 'משימות ותזכורות',
      notifyObligationsLabel: 'טיסות, לינה וזמנים',
      notifyPrefsHint: 'הבחירה נשמרת בחשבון ומגיעה איתכם לכל מכשיר.',
      // The device list, which renders only when there IS another device.
      notifyDevices: 'המכשירים שלי',
      notifyDeviceHere: 'המכשיר הזה',
      notifyDeviceNeverSent: 'עוד לא נשלח',
      notifyDeviceLastSent: (when: string) => `נשלח לאחרונה ${when}`,
      notifyDeviceRemove: 'הסרה',
      notifyDeviceRemoveLabel: (name: string) => `הסרת ${name}`,
      notifyDevicesHint: 'הסרת מכשיר מפסיקה לשלוח אליו · אם אבד לכם טלפון, זה המקום.',
      accountSection: 'החשבון',
      emailLabel: 'אימייל',
      emailHint:
        'האימייל מגיע מהחשבון שנכנסתם איתו, ואי אפשר לשנות אותו כאן - הוא מה שמזהה את החשבון.',
      saveFailed: 'השינוי לא נשמר. בדקו את החיבור ונסו שוב.',
      // The picture page — two states, so the ramp shows only when the colour is
      // what actually gets drawn (ADR-0133 §6).
      picture: {
        title: 'התמונה שלי',
        change: 'שינוי תמונה',
        fromGoogle: 'התמונה מגוגל',
        initials: 'אותיות ראשונות',
        remove: 'הסרת התמונה',
        useGoogle: 'שימוש בתמונה מגוגל',
        hueLabel: 'צבע הרקע',
        // Upload (ADR-0133 §12). The badge on the hero has no label — that is the
        // convention it relies on — so it needs an accessible name instead, and the
        // primary action below it says which of the two acts it is.
        upload: 'העלאת תמונה',
        replace: 'החלפת תמונה',
        badgeLabel: 'בחירת תמונה חדשה',
        uploaded: 'התמונה שהעליתם',
        chooseFile: 'בחירה מהמכשיר',
        takePhoto: 'צילום תמונה',
        uploading: 'מעלה...',
        // A rejected pick is almost always "that file isn't a picture" — the size cap
        // is nearly unreachable once the phone re-encodes to a 512px square.
        uploadFailed: 'העלאת התמונה נכשלה. אפשר לנסות תמונה אחרת.',
        notAnImage: 'הקובץ שבחרתם הוא לא תמונה.',
        removeHint: 'הסרה כאן רק מפסיקה להשתמש בה. בגוגל היא נשארת, אז תמיד אפשר לחזור.',
        noPhotoHint: 'אין תמונה בחשבון הגוגל שנכנסתם איתו, אז מוצגות האותיות הראשונות.',
        uploadHint: 'התמונה נחתכת לריבוע ומוקטנת במכשיר לפני ההעלאה.',
        hueName: {
          plum: 'שזיף',
          rose: 'ורד',
          moss: 'טחב',
          denim: 'דנים',
          cocoa: 'קקאו',
        },
      },
    },
  },
  board: {
    freeLabel: 'פנוי',
    freeTitle: 'זמן חופשי',
    until: 'עד',
    nextLabel: 'הבא בתור',
    // The countdown's unit while a window is shutting (ADR-0184 §6) — the number is the
    // minutes left, so this says what they are left OF.
    //
    // **It sits BELOW the measure word, it does not replace it** (ADR-0206 §AR2). The tile spread
    // `formatCountdown` and then overwrote its `unit` with this, so a shutting window read
    // `15 · לסגירה` — a number with nothing saying what it counts. Same defect as `leaveIn`, and
    // found by fixing that one.
    closesIn: 'לסגירה',
    // **The same slot, pointed one step earlier** (ADR-0206 §Z1/§AA2). The board's one
    // countdown swaps what it counts TO once leaving is the live question, and `לסגירה` is the
    // precedent in grammar and in mechanism: a preposition plus the noun the minutes are left
    // of. `לצאת` was the alternative and reads as an instruction where this is a measurement.
    //
    // **The referent, on its own line UNDER the measure** (ADR-0206 §AR2). It used to replace
    // `formatCountdown`'s own word rather than join it, so the tile read `6 · ליציאה` and the owner
    // asked the obvious question — _"6 what?"_. That is ADR-0208 §1's rule, which this arm had
    // escaped: the slot carries the measure AND the referent, never one of the two.
    leaveIn: 'ליציאה',
    // **And once the leave-by has gone by: `15 · דקות באיחור · ליציאה`** (ADR-0208 §1). Two
    // words were reported unclear here before this one, and each was missing a different half
    // of the sentence. `מהיציאה` read as _measured from_ — "15, counted from the departure".
    // Then a bare `באיחור` said the number was lateness and named nothing it was late FOR, so
    // `15` could as easily have meant the event started a quarter of an hour ago.
    //
    // So the slot says all three parts: **how much** (the ladder's own word, below), **that it
    // is lateness**, and **what for** — and the third is `leaveIn` above, reused verbatim,
    // because the two arms are about the same departure and only differ on which side of it
    // the clock is.
    //
    // **The measure word is the LADDER's, never a literal** — `formatCountdown` steps to `H:MM`
    // past an hour, and a leg long enough to be an hour late is a drive, not a walk. A
    // hardcoded `דק׳` would have labelled `1:20` as minutes.
    //
    // **Still a measurement, not the accusation §Z5 §M4 refused.** `אתם באיחור` is a claim
    // about people, who may well be walking; this says what the NUMBER is — and by the time it
    // can print, `בדרך`, a device fix and the plan's own claim have each had a chance to
    // withdraw it (ADR-0207 §2, ADR-0208 §2).
    lateBy: (unit: string) => `${unit} באיחור`,
    endOfDay: 'סוף היום',
    /** **WHAT THE NOW-SLOT SAYS WHEN NOTHING IS RUNNING** (ADR-0211), keyed by
     *  `GapCharacter`. A `Record<…>`, so the compiler flags a missing case when that union
     *  grows (`frontend/CLAUDE.md`'s per-enum-lookup rule) — a sixth character has to say
     *  what it prints or the build stops.
     *
     *  **`open` reuses `freeLabel`/`freeTitle` above rather than restating them**, because
     *  the gap that really is a gap is the one case `זמן חופשי` was always right about, and a
     *  second copy of the phrase is how the board and the lifted hero would start disagreeing
     *  about it (root rule 8). Same for `day-done`, which reads `endOfDay` — the words the
     *  `הבא בתור` slot has always used for this.
     *
     *  **`at-the-stay` has no title here on purpose.** Its title is the stay's own NAME, which
     *  is data. What it does carry is the two band words, and they are claims about the HOUR
     *  rather than about the person (ADR-0208): `ישנים` would say what you are doing, and the
     *  app has no sensor for that. */
    gap: {
      onTheWay: { label: 'כרגע', title: 'בדרך' },
      atTheStay: { night: 'לילה', morning: 'בוקר' },
      dayDone: { label: 'היום' },
      emptyDay: { label: 'היום', title: 'יום פנוי' },
    },
    // Concurrency on the board (ADR-0041): the "ועוד N עכשיו" expander for extra
    // in-progress events, and the group-split header when several run at once.
    alsoNow: (n: number) => `ועוד ${n} עכשיו`,
    concurrentNow: 'עכשיו · במקביל',
    // **The middle of a bracketed span, by mode** (ADR-0059 §2's mid-span, generalized in
    // session 215). Keyed by `CategoryTimeProfile.midSpan`, resolved through
    // `lib/transitions.ts`'s `midSpanWord` — the same shape `transition` below already
    // uses for the two ENDS, for the same reason: the word is the mode's, not the
    // surface's. Before this, `בטיסה` was a literal on the board, so a train in motion
    // read as a flight and a car hire you were merely holding did too.
    //
    // Teal = "where you are" on the journey words; a held span's end is a deadline and
    // stays amber (root rule 4).
    midSpan: {
      flightLive: 'בטיסה',
      transitLive: 'בדרך',
      transitLabel: 'כרגע · בדרך',
      carHoldLive: 'הרכב אצלנו',
      carHoldLabel: 'כרגע · הרכב אצלנו',
      stayLive: 'שוהים',
      stayLabel: 'כרגע · שוהים כאן',
    },
    /** A journey's remaining time, on the rail's middle slot — the one thing that line
     *  can say which its two ends cannot. It used to print `עד HH:MM`, i.e. the arrival
     *  time the end label was already showing. */
    remaining: 'נותרו',
    /** The arrival countdown beside the landing time (`נחיתה 22:15 · בעוד 1:39 שע׳`).
     *  The length itself comes from the shared elapsed ladder (ADR-0114). */
    inPhrase: (length: string) => `בעוד ${length}`,
    /** A held span says since when it has been ours; its end is on the meta row above. */
    heldSince: (time: string) => `אצלנו מ־${time}`,
    /** **The clock jump, in words** — the lifted hero's form of the amber `🕐 +1 ש׳` pill
     *  the collapsed board keeps (owner, session 215: _"say explicitly מזיזים את השעון
     *  שעה אחורה or something like that"_). The pill is correct and unreadable to anyone
     *  who has not learned it: it does not say which way to turn the hands.
     *
     *  The length comes from the shared ladder (`hoursPhrase`), so no number word is
     *  invented here — and the direction is the sign of the same `deltaMinutes` the pill
     *  renders, never a guess. */
    clockShift: (length: string, direction: string) => `מזיזים את השעון ${length} ${direction}`,
    clockForward: 'קדימה',
    clockBack: 'אחורה',
  },
  // The LIFTED hero (ADR-0160 §3). Its own section rather than more `board` keys,
  // because these label the horizon's parts and the collapsed board has none of
  // them. `הבא בתור`, `עד`, `עכשיו · במקביל`, `קשיח`/`גמיש`, `היינו`/`דילגנו` are
  // NOT here — the lifted hero reads the board's and the settle control's own words,
  // which is what keeps one surface from renaming a thing the other already names.
  // **The three travel modes, as words** (ADR-0206). Top level rather than under `hero`, because
  // the hero's line, M6a's journey block and M8's mode control all name the same three things and
  // a second copy is how they start disagreeing (root rule 8).
  //
  // **The mode LEADS a travel line, and that is §D10 rather than decoration.** `~23 דקות הליכה`
  // and `שעה הליכה` disagree in a way the phrase does not expose, and ADR-0159 §1 dodged the
  // identical problem by leading with the noun (`פנוי · 2:40 שע׳`) — so `הליכה · ~23 דק׳`. It is
  // also what makes the number legible: 40 minutes is a different fact walking and driving.
  // Drawn that way in the M3 mockup's §1d.
  //
  // A `Record<LegTravelMode, string>`, so the compiler flags a missing case when the enum grows
  // (`frontend/CLAUDE.md`'s per-enum-lookup rule). These are the WORDS, not the control: §AA3
  // gives the chips three real icons and M6a/M8 own those.
  // **THE ACTIVITY, NEVER THE VEHICLE** (owner, 2026-08-26: _"it says רכב/הליכה · maybe it should
  // be changed to נסיעה?"_). Every call site uses these as the noun LEADING a duration —
  // `נסיעה · ~44 דק׳` on the day's journey block, the lifted hero's line, the Map — which is
  // §D10's agreement dodge, and the noun therefore has to name the thing being measured. Two of
  // the three named the OBJECT instead (`אופניים` is bicycles, `רכב` is a vehicle), so the set
  // mixed "walking" with "car" and only the walk read as a length of time. A fourth mode joins as
  // a gerund or it will read as an inventory.
  travelMode: {
    walking: 'הליכה',
    cycling: 'רכיבה',
    driving: 'נסיעה',
    // **The fourth is a leg's mode and not a routable one** (ADR-0206 §AA4/§AM5). This is the ONE
    // `Record<…>` of the three that widens: `TRAVEL_GATE` and the provider's `COSTING` keep three
    // entries, because a transit mode reaching either of those is the bug. Here it just needs a
    // word.
    transit: 'תחב״צ',
  } satisfies Record<LegTravelMode, string>,
  // ── WHAT A JOURNEY SAYS, ON EITHER ELEVATION (ADR-0206 §V1.2 / §V1.3 / §V1.4) ─────────
  // Top level beside `travelMode`, and for the identical reason: the horizon's line, the day's
  // journey block and the board all name one journey, so a second copy of `זמן היציאה עבר` is
  // how they start describing it differently (root rule 8). These four lived under `hero` while
  // the hero was the only surface that had them; M6a is the second, which is the moment they
  // move rather than get copied.
  travel: {
    // The clock arrives already isolated: `18:37` is a digit run inside Hebrew, and the maqaf
    // before it is a strong RTL character, so the run needs the isolate its caller gives it
    // (ADR-0118).
    //
    // **Two forms, because the two elevations are asking different things.** The hero is the
    // live surface and speaks to you — `צאו ב־18:37`, an instruction. The day list is a
    // schedule, and most of its holes are not the one you are standing in: an imperative on
    // every hole of the day would be the app telling you to leave four times before breakfast.
    // So the day's form is the NOUN (`יציאה 18:37`), which is §D10's own dodge again and reads
    // as a fact wherever it lands.
    leaveAt: (clock: string) => `צאו ב־${clock}`,
    leaveAtDay: (clock: string) => `יציאה ${clock}`,
    // **What a passed leave-by may claim, and it is only this** (§Z5 §M4): the time has gone
    // by. Never `אתם באיחור` — the app has no sensor and a settle mark is not one, so a claim
    // about where a person is would be a claim it cannot stand behind (§D5 applied to a
    // sentence rather than to a number). ADR-0208 §1 lets the countdown TILE carry `באיחור` in
    // its unit slot, where it labels a number rather than a person; this sentence is unchanged.
    leavePassed: (clock: string) => `זמן היציאה עבר ב־${clock}`,
    // **The one thing a fix lets the app say that the clock could not** (ADR-0207 §2). A passed
    // leave-by was a claim about a clock; with a position at the leg's first stop it becomes one
    // the app has actually checked, and this is that check said out loud. Drawn in the v2
    // mockup's §3d. It is still not `אתם באיחור` — it reports where you are, not what you are.
    stillHere: 'עדיין כאן',
    // **WHAT A DECLARED תחב״צ LEG SAYS** (ADR-0206 §AA4/§AL3). It names exactly what is absent and
    // promises nothing — no `עדיין`, no `טרם` — because the one thing §D9's original caution still
    // forbids is implying a transit ETA is coming. **It carries no `warn` glyph**, deliberately:
    // §AK claims that mark for "this journey does not fit", and two meanings on one block in one
    // release is the drift ADR-0138 exists to end. The absent duration is the statement; this only
    // labels the absence so it does not read as data that failed to load.
    noEstimate: 'בלי הערכת זמן',
    // **WHAT A MODE THE GATE REFUSES SAYS** (ADR-0206 §AM10). Deliberately NOT `noEstimate` above,
    // which reads as "we are not estimating this" — a statement about us. This is a statement about
    // the leg: the distance is past what that mode admits, so nothing is coming and the fix is to
    // pick another mode. It names the mode, because a hole showing four chips has to say which one
    // it means. A middle dot separates the two facts, never an em dash (root CLAUDE.md).
    tooFarFor: (mode: string) => `רחוק מדי ל${mode}`,
    // **WHAT A LEG STILL BEING COMPUTED SAYS** (ADR-0206 §AU1). Deliberately none of the three
    // sentences above: `noEstimate` says we are not estimating this, `tooFarFor` says it cannot be
    // done, and both are permanent. This one is temporary and says so — present tense, with the
    // three dots that are the only thing in the phrase promising anything.
    //
    // **`מחשב` and not `טוען`.** Nothing is being fetched from anywhere the reader can picture; a
    // route is being worked out, which is what the app is actually doing and the word people use
    // for it. And no `~`: §D5's hedge belongs on a NUMBER, and there is no number here yet.
    computing: 'מחשב מסלול…',
    // **WHAT A JOURNEY UNDER THE LADDER'S FLOOR SAYS** (ADR-0206 §AW). The fourth of these
    // sentences and the only one that is not about an absence: the app has the number, and
    // ADR-0114's minutes rung has no rung for ⁦12⁩ seconds. So it says the length in the one form
    // that is available — a bound — rather than borrowing `noEstimate`, which would claim we never
    // measured it, or printing `~0 דק׳`, which is the value this whole floor exists to refuse.
    // No `~`: §D5's hedge belongs on a number, and `פחות` is already the hedge.
    underMinute: 'פחות מדקה',
    // What is LEFT of the journey, once the fix says you are on it (ADR-0207 §6). An
    // approximation of an approximation, and `~` is what says so; the alternative was the
    // untouched total, which read as "44 minutes still to walk" two minutes from the door.
    remaining: (duration: string) => `נותרו ${duration}`,
    // **§V1.1's correction, said in the day's own slot** — and said the way somebody would say it
    // (owner, 2026-08-26: _"פנוי לפני X דקות is bad Hebrew · I'm not even sure what you meant to
    // say"_). It meant "of this hole, X is actually yours; the rest is the walk", and it reached
    // for `לפני` because the journey sits at the END of the hole — which is a fact about the
    // SHAPE of the slot that no reader was asking for, wrapped in a phrase that reads as "free
    // 46 minutes ago". Which side is free is answered by the `יציאה 14:11` beside it anyway.
    //
    // **The agreement is composed rather than dodged** (`freeTimePhrase`, `lib/duration.ts`).
    // Every other length in this app is noun-led precisely to avoid it — `פנוי · 2:40 שע׳` —
    // but here the natural word order puts the number first, and the ladder has exactly two
    // singular rungs (`שעה`, one minute) so agreeing costs three lines and buys `שעה פנויה`
    // instead of `שעה פנויות`. Reuse it; do not inline the plural.
    freeTime: (length: string) => `${length} פנויות`,
    freeTimeOneMinute: 'דקה פנויה',
    freeTimeOneHour: 'שעה פנויה',
    // **WHEN YOU WILL GET THERE, WHERE THE APP MAY NOT SAY WHEN TO LEAVE** (ADR-0206 §AI).
    //
    // A check-in window's `17:00` is the hour the door OPENS, so counting back from it invents a
    // deadline nobody set — and a departure that lands inside the row it leaves from is one you
    // could not have made. In both cases the arrival is what the app can stand behind: when you
    // can go, plus the leg.
    //
    // **Hedged, and the `~` is inside the isolate** — it is derived from an estimate, so it owes
    // the same admission `approxDuration` makes about a duration (§D5). The clock arrives already
    // isolated from the caller (ADR-0118).
    arriveAt: (clock: string) => `הגעה ${clock}`,
    // **AND BOTH, WHERE THERE IS A DEADLINE BUT NO SLACK** (§AJ2). The
    // departure is the origin's own end — go the moment you are done — and the arrival is why that
    // matters: `יציאה 14:00 · הגעה ~14:58` in front of a ⁦15:00⁩ start says "leave now and you only
    // just make it" in one line. Two nouns, the row's own voice, and the `·` the app separates
    // peer facts with.
    //
    // **It is what answers the owner's _"why does it sometimes say יציאה and some other times
    // הגעה"_.** The two words were serving three situations: no deadline at all, a window, and a
    // leg with no slack — the last of which is a warning and read exactly like the first, which is
    // reassurance. Now `יציאה` means the app has a deadline to advise against and `הגעה` alone
    // means it has none, which is a difference a reader can act on.
    //
    // Measured before it was written: ⁦140.06px⁩ of ink in the meta line's ⁦206.95px⁩ box at 360, so it
    // does not clip — and the widest sentence already shipping in that slot is ⁦171px⁩.
    leaveThenArrive: (leave: string, arrive: string) => `יציאה ${leave} · הגעה ${arrive}`,
    // …and the one warning nobody can currently be given at plan time: `hero-booking.ts` computes
    // `missed` off the CLOCK, once it is already too late. This is the same fact predicted, on the
    // surface that holds the plan, readable at breakfast.
    arriveAfterClose: (clock: string) => `הגעה ${clock} · אחרי סגירת החלון`,
    // **A LEG THAT DOES NOT FIT STILL LANDS SOMEWHERE** (ADR-0206 §AS5). The shortfall says how
    // much has to move; it does not say when you would actually get there, and those are different
    // questions when you are deciding what to cut. Reported off the deploy: _"I see the
    // חסרות 8 דקות לדרך row doesn't show the (late) arrival time. We'd want to know how late we
    // arrive, no?"_
    //
    // **The arrival here is the earliest one that exists** — you leave the instant the row above
    // frees you, because on this arm there is no departure to advise (`leaveByMs` is null and the
    // clamp already pulled it to the origin's own end). So it is a prediction the app can stand
    // behind rather than the best case of advice nobody can follow.
    overrunThenArrive: (shortfall: string, clock: string) => `${shortfall} · הגעה ${clock}`,
    // **THE LEG THAT DOES NOT FIT** (ADR-0206 §V1.1's third `fit`, drawn in
    // `where-a-route-shows-up-v1.html` §2's `tight` state). `freeAfterTravel` has answered
    // `overruns` since M2 and nothing rendered it, so a 78-minute walk into a 60-minute hole read
    // `פנוי לפני 0 דק׳` — which is not a small amount of free time, it is a journey nobody can
    // make. It says the SHORTFALL, because that is the number you act on: how much has to move.
    //
    // Noun-led like every other line here (§D10), and no `~` on the shortfall: the estimate is
    // hedged and the arithmetic on it is not, so hedging twice would be theatre. The one hedge is
    // already on the duration beside it.
    //
    // **The wording is the owner's correction, the length is the measured constraint**
    // (2026-08-26: _"`הדרך ארוכה מהפער ב X דקות` is also bad phrasing · maybe `הדרך ארוכה ב-X
    // דקות מהזמן שיש לנו`"_). Their version is right about what was wrong — `ארוכה מהפער ב־`
    // stacks two prepositions and asks the reader to hold `פער` in their head to parse it — and
    // it is **41 characters** where the meta line has ⁦180px⁩ of box at 360px, so it ellipsises on
    // the one arm that matters. `חסרות 18 דק׳ לדרך` says the same thing in half of it, leads with
    // the number you act on, and is the sibling of `אין זמן לדרך` below rather than a third way
    // of talking about the same hole. **The word `פער` is gone from the sentence** and nothing is
    // lost: what the journey is longer than is the hole it is drawn inside.
    shortfall: (length: string) => `חסרות ${length} לדרך`,
    // Agreement again, and only the hour rung needs it — the tolerance in
    // `TRAVEL_FIT_TOLERANCE_SECONDS` means a shortfall never rounds below two minutes.
    shortfallOneHour: 'חסרה שעה לדרך',
    // **And when there is no gap at all, the shortfall is not the thing to say.** Two rows that
    // touch — the next stop starting exactly when the previous one ends — have no gap for the
    // journey to be longer THAN, so `הדרך ארוכה מהפער ב־12 דק׳` is arithmetically true and reads
    // as nonsense. It is also the same number twice: with a zero gap the shortfall IS the
    // journey's own duration, which the head above already states, and printing one number in two
    // places is the ambiguity ADR-0207 §6 removed from the `בדרך` line.
    //
    // Covers an overlap too (a negative gap), where it is just as true.
    noTimeForTravel: 'אין זמן לדרך',
    // ── THE DAY'S OWN VERDICT (ADR-0206 §V1.7 / §AN) ──────────────────────────────────
    //
    // **Plan mode only, and that is a posture difference rather than a disagreement about a
    // fact** (ADR-0159 §1): a day-level verdict in Trip mode is a verdict on a day you are
    // already living, where every leg's own row is the useful scope. The words are here rather
    // than under `planDay` because they are about travel and `lib/duration.ts` composes them
    // beside `shortfall` above.
    //
    // **It must read as help, not refusal** — ADR-0206's own Consequence, and the copy is where
    // that is won or lost. So the subject is the JOURNEYS and never the planner: `לא נכנסות`
    // is a fact about how long the roads take, where anything shaped like `היום עמוס מדי` is
    // the app having an opinion about somebody's holiday.
    //
    // Two lines and not one, because they answer different questions — how many there are, and
    // how much has to move — and only the second is a number a leg's own row can also say.
    // Hebrew makes the verb agree with a count the phrase would otherwise have to expose, so
    // this takes the same three-rung dodge `planDay.gapHour`/`gapTwoHours`/`gapHours` does.
    //
    // **`ביום` and `בסך הכול` were drawn and then cut** (2026-08-27, measured on the mockup's
    // §5): with both, the row is ⁦314.9px⁩ of ink in a ⁦308px⁩ box at 360 and the count loses its
    // end. Neither word carries anything the reader cannot recover — the row is inside the day,
    // and a count beside a duration is already a sum — and what they cost is the measurement.
    dayInfeasibleOne: 'דרך אחת לא נכנסת',
    dayInfeasibleTwo: 'שתי דרכים לא נכנסות',
    dayInfeasible: (n: string) => `${n} דרכים לא נכנסות`,
    // The sum, on ADR-0114's one ladder like every other duration here. Deliberately the same
    // opening word as the leg's `חסרות X לדרך`: one scope up, same fact, and a reader who has
    // seen one should not have to learn a second vocabulary for the other.
    dayShortfall: (length: string) => `חסרות ${length}`,
    dayShortfallOneHour: 'חסרה שעה',
    // ── HOW FAR THE DAY GOES (ADR-0206 §V1.9, amended §AP) ────────────────────────────
    //
    // **No mode word, and that is a correction rather than a trim.** §V1.9 was written
    // `3.2 ק״מ · 48 דק׳ הליכה` on 2026-08-24, when a trip had one mode; M8b made the mode per-leg
    // three days later, so on a real day — walk to the station, declared תחב״צ to the next town,
    // drive the last stretch — `הליכה` names one leg of three and is simply false about the other
    // two. There is no true word to put there, because the day has no single mode.
    //
    // **And the minutes are hedged where the kilometres are not**, which is §D5 doing exactly the
    // job it was written for: the two halves do not cover the same legs (a declared leg keeps its
    // distance and has no duration, §AA4/§AM6), so the `~` is what says this counts what could be
    // counted. `approxTravelTime` owns it, along with the exact-hour rungs that take `כ` instead.
    //
    // Both halves are noun-led, so nothing has to agree with a number the phrase does not expose
    // (ADR-0159 §1's dodge, root `CLAUDE.md`'s separator).
    dayTotal: (distance: string, duration: string) => `${distance} · ${duration}`,
    // **AND WHEN THE TOTAL IS A FLOOR** (ADR-0206 §AT2). A hole with an end nobody placed is a leg
    // this app can never measure, so it is missing from both halves — and a total that covers three
    // of five hops while reading as the day's whole travel is §D4's own "the reader must not be
    // able to tell" failing in the direction that matters: it does not look absent, it looks wrong.
    //
    // One word, wrapping whatever the line already is, so the half-line case (a day of declared
    // legs, distance alone) needs no second string and cannot drift from this one. `לפחות` is true
    // of both halves at once, which is why it leads rather than trailing as a qualifier: the
    // kilometres and the minutes are each a floor, and a tag at the end would attach to the minutes.
    dayTotalFloor: (line: string) => `לפחות ${line}`,
  },
  hero: {
    title: 'עכשיו והבא בתור',
    close: 'סגירה',
    where: 'איפה',
    note: 'פתק',
    then: 'אחר כך',
    onMap: 'במפה',
    navigate: 'ניווט',
    toBooking: 'להזמנה',
    // The hero shows ONE note and says how many it is not showing, so a group that
    // wrote three does not read as a group that wrote one.
    //
    // **`1` is its own word in Hebrew** and both of these read it constantly: the note block
    // still shows one, so two notes is the common case and `ועוד 1 פתקים` was the common
    // string. It went unnoticed until the task cap rose to three and made the remainder-of-one
    // visible in a screenshot. `t.tasks.mark` already inflects this way — same fix, same shape.
    moreNotes: (n: number) => (n === 1 ? 'ועוד פתק אחד' : `ועוד ${n} פתקים`),
    // The fourth content type (ADR-0160 §U). **Plural since 2026-08-16** (owner: _"lifted hero
    // writes משימה and not משימות"_), because the block stopped being one row: it shows up to
    // `HERO_TASK_CAP` and this is the section's NOUN, exactly as `פתקים` is on a host surface —
    // a label naming a list does not inflect to the length of the list it happens to have.
    task: 'משימות',
    moreTasks: (n: number) => (n === 1 ? 'ועוד משימה אחת' : `ועוד ${n} משימות`),
  },
  // Real, offline-safe shortcuts only (ADR-0045): next confirmation code, WiFi,
  // documents. Empty tiles are an "add" affordance; documents stays a fixture
  // until the FE supports it.
  quick: {
    title: 'גישה מהירה',
    nextTicket: 'הכרטיס הבא',
    // The fourth tile, back from ADR-0045's deferral now that places carry real
    // coordinates (ADR-0106 §6): a directions deep-link to the next stop.
    navigateNext: 'ניווט ליעד הבא',
    wifiCode: 'קוד WiFi',
    documents: 'מסמכים',
    docsInvite: 'הוסיפו מסמך',
    wifiCopied: 'קוד ה-WiFi הועתק ללוח',
  },
  // Money (ADR-0180). `מבט מהיר` is the SECTION ADR-0045 removed for holding
  // fixtures and promised back "as their own glance cards" — this is that return,
  // so the title is the original words and not a new heading.
  fx: {
    sectionTitle: 'מבט מהיר',
    // The date is interpolated as an already-isolated LTR island (ADR-0118), never
    // built into the string — a numeric run inside an RTL sentence comes apart.
    asOf: (date: string) => `נכון ל־${date}`,
    // NOTE there is no `attribution` string here on purpose. The credit the
    // provider's terms make mandatory is its OWN wording, carried on the data
    // (ADR-0180 §7) and rendered verbatim — writing a Hebrew version of it here
    // would both break those terms and mean a second provider needs a copy change.
    converterTitle: 'המרת מטבע',
    amountTrip: 'סכום במטבע היעד',
    amountHome: 'סכום במטבע הבית',
    swap: 'החלפת כיוון',
    // Both absences read as a fact, not a failure (§4): there is no error state
    // anywhere on this surface. The first is "we have never held a set"; the
    // second is a pair this source does not price, which degrades identically.
    noRateYet: 'אין עדיין שער שמור · יתעדכן בחיבור הבא',
    pairUnpriceable: 'אין שער לצמד הזה במקור הנוכחי',
  },
  // Group change-feed (ADR-0081, review U-09): a quiet strip narrating recent
  // SHARED peer edits. The subject is inlined in each lead; a moved-to clock time
  // is appended separately as a dir="auto" island (never inside these strings).
  // **The one place a gendered verb survives the 2026-08-17 register pass**, and it is the
  // narration that forces it: the feed reports what a NAMED person did, so there is a
  // grammatical subject and Hebrew makes it pick a gender. The register rule's escapes do
  // not reach here — a verbal noun drops the actor (`הזזה של האירוע` says nothing about who),
  // and the passive drops them too. Masculine by convention, actor gender unknown. Revisit
  // only if `Member` ever carries a pronoun. No em dashes.
  changeFeed: {
    title: 'עדכונים מהקבוצה',
    clearAll: 'ניקוי הכל',
    clearAllLabel: 'ניקוי כל העדכונים',
    dismiss: 'הסתר עדכון',
    someone: 'מישהו',
    nouns: {
      event: 'האירוע',
      booking: 'ההזמנה',
      place: 'המקום',
      document: 'המסמך',
      note: 'הפתק',
      member: 'נוסע',
      trip: 'הטיול',
      item: 'הפריט',
    },
    movedTo: (subject: string) => `הזיז את ${subject} ל־`,
    moved: (subject: string) => `הזיז את ${subject}`,
    added: (subject: string) => `הוסיף את ${subject}`,
    removed: (subject: string) => `מחק את ${subject}`,
    updated: (subject: string) => `עדכן את ${subject}`,
    joined: 'הצטרף לטיול',
    relTime: {
      now: 'עכשיו',
      prefix: 'לפני',
      // The same word, composed with an already-phrased elapsed length (ADR-0114's
      // ladder) — so a note's "when" reads `לפני 3 ימים` without a second time vocabulary.
      agoPrefix: (elapsed: string) => `לפני ${elapsed}`,
      minUnit: 'ד׳',
      hrUnit: 'ש׳',
    },
  },
  // Day-at-a-glance: derived from events (ADR-0045). Counts are phase-based and
  // run on top-level blocks (ADR-0041), so a passed-unmarked event drops out of
  // "נותרו" and overlaps never inflate the day.
  glance: {
    title: 'היום במבט',
    remaining: 'נותרו היום',
    hardAnchor: 'עוגן קשיח',
    freeUntil: 'פנוי עד',
    dayEnds: 'מסתיים',
    // Collapsed composite blocks on the rail: a cluster of parallel peers ("×N")
    // or an envelope with nested children ("כולל N"); overnight end marker.
    concurrent: (n: number) => `×${n}`,
    contains: (n: number) => `כולל ${n}`,
    nextDay: '+1',
    emptyTitle: 'היום עוד פתוח',
    emptySub: 'אין אירועים מתוכננים · יום חופשי',
    emptyAdd: 'הוסיפו אירוע',
    // Ambient-span backdrop (a hotel / multi-day booking) shown across the days it
    // covers (ADR-0054) — not counted on the rail. **Two units, chosen by the event's
    // own type** (ADR-0163 §4): a stay is counted in nights, which is the traveller's
    // unit and the reason `לילה` was the only wording here; a car hire is counted in
    // the days you hold it, and `לילה 2 מתוך 5` was a hotel's word on a vehicle. The
    // choice is made in `lib/glance.ts`'s `ambientSpanLabel`, from the SAME
    // `durationUnit` the booking surfaces read — not by a second rule here.
    ambientNight: (night: number, nights: number) => `לילה ${night} מתוך ${nights}`,
    ambientDay: (day: number, days: number) => `יום ${day} מתוך ${days}`,
    // Amber transition markers on the rail + the shared booking grammar (ADR-0059
    // §3 / ADR-0063 profile keys): the two ends of a bracketed booking.
    // Wording is by mode, not hard-coded (ADR-0063 refinement): the generic
    // departure/arrival covers every surface transport (train, bus, ferry); a flight
    // refines to take-off/landing and a hire to pick-up/return, via ICON_TIME_PROFILE.
    transition: {
      checkIn: 'צ׳ק-אין',
      checkOut: 'צ׳ק-אאוט',
      departure: 'יציאה',
      arrival: 'הגעה',
      flightDeparture: 'המראה',
      flightArrival: 'נחיתה',
      carPickup: 'איסוף הרכב',
      carDropoff: 'החזרת הרכב',
    },
    // "Inside a booking" mid-stay strip (ADR-0059 §2) — teal "where you are".
    // The mid-stay strip's verb — LODGING only (ADR-0163 §4). Anything else ambient
    // states its own name; see the strip's comment in `screens/Home.tsx`.
    stayingPrefix: 'שוהים ב־',
    nightLabel: 'לילה',
    dayLabel: 'יום',
    dismissStay: 'הסתר',
  },
  // Plan-mode Home — the prep dashboard (modes.md; mockups/plan-mode-v1.html).
  // Only the rows we can honestly derive from the snapshot appear; the Gmail /
  // passports / Google-connection rows wait for their features (see DEFERRED).
  planHome: {
    prep: {
      departIn: 'היציאה',
      // Fallback for the rare plan-mode-while-the-trip-runs case (a manual
      // override peeking at Plan mid-trip): no countdown to show.
      underway: 'הטיול בעיצומו',
      readiness: 'מוכנות הטיול',
      /** **The second number, and the whole point is that it has its own noun**
       *  (ADR-0193 §2). `readiness` above is the five derived checks and nothing else,
       *  so 100% above eight open tasks told the same lie the `allDone` hint told. It is
       *  NOT folded into the percentage: that denominator grows every time somebody
       *  writes a task, so recording work would read as losing ground. Naming the second
       *  measurement is what stops the first from implying it covers it.
       *
       *  The overdue count reuses `t.tasks.band.overdue` rather than restating it — one
       *  phrasing for one fact, on whichever surface says it. */
      openTasks: 'משימות פתוחות',
    },
    checklist: {
      title: 'מה חסר להשלמה',
      /** **The empty state's two lines** (ADR-0193 §6). This was `הכול מוכן 🎉`, an 11px
       *  `.hint` in the section title — 15px of section against 136px of block, which is why
       *  the owner asked for an empty state while looking at one. Promoted into
       *  `EmptyState`, whose icon slot takes an `Icon`, so the emoji retires: emoji are
       *  CONTENT and icons are UI (design-language, ADR-0138).
       *
       *  `אפשר לנשום` and not `הכול מוכן` (owner's pick): the readiness bar directly above
       *  already says 100%, so repeating it here would be the same fact twice on one screen.
       *  What the bar cannot say is what it means for the reader. */
      emptyTitle: 'אפשר לנשום',
      emptyBody: 'אין מה להשלים לפני היציאה',
      done: 'הושלם',
      // Completed checks collapse into a one-line summary with a show/hide toggle
      // (ADR-0061), so the list stays about what's still missing.
      /** **Both toggles read as one pair** (owner, 2026-08-16: the Hebrew _"is bad"_ and
       *  wants improving on both). Three things were wrong and they were shared:
       *
       *  `הצג` ⇄ `כווץ` is not a pair — one is "show", the other "collapse", so the control
       *  described its own mechanism on the way back and its content on the way out. Both
       *  directions are `הצג`/`הסתר` now, which is the pair `Collapsible`'s own docstring
       *  already uses for the Index's past bookings.
       *
       *  `(3)` in brackets is a UI convention, not Hebrew. The count reads inline, before
       *  the noun, which is where Hebrew puts it when speaking.
       *
       *  And `שהושלמו` cannot carry a bracketed number as a bare noun — `הצג שהושלמו (3)`
       *  is "show that-were-completed (3)". With the count inline it becomes a real phrase:
       *  `הצג 3 שהושלמו`. */
      showCompleted: (n: number) => (n === 1 ? 'הצג אחת שהושלמה' : `הצג ${n} שהושלמו`),
      hideCompleted: 'הסתר',
      /** **The remainder, past the cap** (ADR-0193 §3, amended 2026-08-16). Not `רחוקות`
       *  and no longer a group with a meaning: it is simply what did not fit in the first
       *  `PLAN_TASK_CAP` rows, so the word is the one Trip Home's overflow row already uses.
       *  `הסתר` on the way back, because the row's caret says which way it goes. */
      showRest: (n: number) => (n === 1 ? 'עוד משימה אחת' : `עוד ${n} משימות`),
      hideRest: 'הסתר',
      // Flights = round-trip aware (ADR-0061): the meta names the missing leg, and
      // the CTA opens the flight form seeded with that direction.
      flightsTitle: 'טיסות',
      flightsDoneMeta: 'הלוך ושוב באינדקס',
      flightsMissingBothMeta: 'חסרות טיסת הלוך וטיסת חזור',
      flightsMissingReturnMeta: 'יש טיסת הלוך · חסרה טיסת חזור',
      flightsMissingOutboundMeta: 'יש טיסת חזור · חסרה טיסת הלוך',
      addFlight: 'הוסיפו טיסה',
      lodgingTitle: 'לינה',
      lodgingDoneMeta: 'כל הלילות מכוסים',
      lodgingMissingMeta: (covered: number, total: number) =>
        `${covered} מתוך ${total} לילות מכוסים`,
      addLodging: 'הוסיפו לינה',
      itineraryDoneTitle: 'כל הימים מתוכננים',
      itineraryDoneMeta: 'אין ימים ריקים',
      itineraryTitle: (n: number) => (n === 1 ? 'יום אחד ללא תוכנית' : `${n} ימים ללא תוכנית`),
      itineraryMeta: (days: string) => `ימים ${days} ריקים`,
      buildDay: 'בנו יום',
      // Documents = per-traveller passport rollup (ADR-0061), from the snapshot docs.
      documentsTitle: 'מסמכים ודרכונים',
      documentsDoneMeta: 'כל הנוסעים העלו דרכון',
      documentsMissingMeta: (have: number, total: number) => `${have} מתוך ${total} העלו דרכון`,
      uploadDocs: 'העלו',
      groupTitle: "החבר'ה",
      groupDoneMeta: (n: number) => `${n} נוסעים בפנים`,
      groupMissingTitle: 'עדיין לבד פה',
      groupMissingMeta: "הזמינו את החבר'ה עם לינק",
      invite: 'הזמינו',
    },
    /** **The lifted prep hero** (ADR-0193 §4). One word, because after the owner's
     *  2026-08-16 call the card carries no headings at all: it is one list in the tasks
     *  screen's own order (`orderTaskRows`), so the five band labels that used to live
     *  here — `דחוף`, `לפני היציאה`, `בזמן הטיול`, `ללא תאריך` and a reuse of
     *  `checklist.title` — are deleted rather than left unused. `title` survives as the
     *  card's accessible name, which a `Modal` requires. */
    lift: {
      title: 'ההכנות לטיול',
    },
    stats: {
      title: 'מבט על',
      bookings: 'הזמנות',
      events: 'אירועים',
      emptyDays: 'ימים ריקים',
    },
    // Past-trip retrospective — the calm read-only archive (ADR-0040). No prep
    // dashboard, no countdown, no board; a quiet summary and a way back into the
    // days.
    past: {
      complete: 'הטיול הסתיים',
      summary: 'לזיכרון',
      days: 'ימים',
      viewDays: 'עיון בימי הטיול',
    },
  },
  day: {
    heading: (day: number, weekday: string, destination: string) =>
      `יום ${day} · ${weekday} · ${destination}`,
    // **What sits between two events** (ADR-0159). Trip mode STATES the gap where Plan
    // mode offers to fill it, so the wording is a fact and not an invitation: no verb,
    // no `שבץ`. `פנוי · <משך>` and not `<משך> פנויות`, because the adjective has to
    // agree with a number the phrase does not expose (שעה פנויה / שעתיים פנויות /
    // 45 דקות פנויות) — the same dodge Plan's own edge chips already make.
    //
    // The strip is tappable now (ADR-0161 §9) and the VISIBLE words did not change: the tap
    // is a `＋`, and what the fact reads is still a measurement. `fillFree` is the accessible
    // name only — a screen reader needs the verb the glyph is standing in for.
    join: {
      free: (length: string) => `פנוי · ${length}`,
      fillFree: (length: string) => `שיבוץ לזמן הפנוי · ${length}`,
      // A connection is not free time, so it is named rather than measured: what the
      // stop is called, and how long you are in it. One word per transport mode —
      // a train changes, a flight stops over (ADR-0156's third mode says החלפה too:
      // a bus connection is a platform, not a terminal).
      word: {
        flight: 'עצירת ביניים',
        train: 'החלפה',
        transit: 'החלפה',
      } as Record<string, string>,
      // Descriptive, never advisory: the app does not know your terminal, so it says
      // the join is short and stops there.
      short: (word: string) => `${word} קצרה`,
      text: (word: string, length: string, place?: string) =>
        place ? `${word} · ${place} · ${length}` : `${word} · ${length}`,
    },
    // The shelf's two groups (ADR-0116 §2). A header renders only when its group has
    // content, so a trip that never uses a target day looks exactly as it did.
    shelfForDay: 'לְיום הזה',
    shelfPool: 'רעיונות',
    // The pool strip is a ranked shortlist now, not the whole pool, so its header
    // says what it is showing and its count says how many there are in all. The way
    // through carries the rest to the Map's אולי facet (ADR-0116 session-202 §5).
    shelfRanked: 'הכי מתאימים להיום',
    shelfMore: (n: number) => `עוד ${n} · במפה`,
    // The empty day group, conjured up mid-drag so there is somewhere to drop.
    shelfDropHere: 'שחררו כאן ליום הזה',
    maybeShelf: 'מדף האולי',
    // The STATE, not the gesture (owner, 2026-08-11): the card is a button and its tap
    // restores — what the line has to say is that this one was skipped.
    skippedTag: 'דילגתם',
    // The idea's sheet — the surface a tap now opens. `שיבוץ ליום` leads it, so the
    // verb the tile used to perform is one press away and named.
    idea: {
      actions: 'פעולות על הרעיון',
      subject: (author?: string) => (author ? `רעיון · נוסף על ידי ${author}` : 'רעיון'),
      schedule: 'שיבוץ ליום',
      // **Agreeing with a `fits-a-day` proposal** (ADR-0151's 2026-08-04 amendment). Not a
      // second kind of scheduling — `שיבוץ ליום` keeps the calendar glyph because that is what
      // it has always been — so this one is a tick: it is agreement, which is what a tick means
      // everywhere else in this app.
      markForDay: (relativeDay: string) => `סמנו ל${relativeDay}`,
      remove: 'הסרה',
    },
    // Why a suggestion sits where it does (ADR-0151 §8). The contract carries the
    // fact and this spells it, which is what lets a user disagree with the order.
    // Never a score and never a star: only the fact that put this one here.
    why: {
      nearStop: (distance: string, stop: string) => `${distance} מ${stop}`,
      aimedAtDay: (relativeDay: string) => `מכוון ל${relativeDay}`,
      recentlyAdded: 'נוסף לאחרונה',
      // **Which day this dateless idea looks like it belongs to** (ADR-0151's 2026-08-04
      // amendment). Two densities, and the split is a MEASUREMENT, not a preference: the stop
      // name wraps the tile's meta line and costs it 8px on a 76px tile drawn to save them
      // (measured in `mockups/day-scheduling-grammar-v1.html` §9), so the tile says the day and
      // the distance and the full sentence waits for the sheet, which has room.
      fitsDay: (relativeDay: string, distance: string) => `${relativeDay} · ${distance}`,
      fitsDayFull: (relativeDay: string, distance: string, stop: string) =>
        `${relativeDay} · ${distance} מ${stop}`,
    },
    scheduleTitle: (title: string) => `שיבוץ · ${title}`,
    // Concurrency (ADR-0041): a cluster of partially-overlapping events, and the
    // "contains N" note on an envelope that nests shorter events inside it.
    concurrent: 'בו-זמנית',
    contains: (n: number) => `כולל ${n}`,
    // Now-line + derived phases (ADR-0043). The now-line label reuses common.now.
    nowLineAria: (time: string) => `השעה עכשיו · ${time}`,
    // Settle strip on a passed-but-unmarked soft event ("still on?" → one tap).
    settleAsk: 'היינו שם?',
    // **A time that is a floor or a ceiling** (ADR-0171 §3). `exact` is unmarked —
    // it is the default, and marking it would put a word on nearly every row in the
    // app to say "normal". A floor reads "from", a ceiling "until".
    fromTime: (time: string) => `מ-${time}`,
    untilTime: (time: string) => `עד ${time}`,
    // A row that holds no position in the day at all, and so has no clock to print.
    noTime: 'ללא שעה',
    // **The boundary above the tail** (ADR-0171 §10a). Deliberately a boundary and not
    // a heading: the rows under it are things happening today whose window is too wide
    // to place, not a section of the day. Untimed events have rendered there all along
    // with nothing saying so, which is why one of them reads as "the last thing today".
    unplaced: 'ללא מיקום ביום',
    // Past-day archive (ADR-0029 signal / ADR-0040 language).
    archiveTag: 'לקריאה בלבד',
    pastBuildHint: 'הוספה או הזזה של אירוע ביום שעבר · במצב תכנון',
  },
  // Plan-mode Day-by-day — the itinerary builder (screens/PlanDay.tsx).
  planDay: {
    empty: 'היום ריק · אפשר להוסיף אירוע או לשבץ מהמדף',
    // A finished trip is a structural archive but stays settle-editable
    // (ADR-0044): the header note says so, since the ✓ / הסדרה is still live.
    pastNote: 'טיול שהסתיים · מבנה קפוא, אפשר להסדיר',
    pastEmpty: 'אין אירועים ביום זה',
    // The archive settle control (ADR-0044): tap ○ on an unresolved soft event
    // to record it — the "we were there / skip" the trip never got.
    settleTitle: (title: string) => `הסדרת «${title}»`,
    settleUnresolved: 'להסדיר: היינו או דילגנו',
    addToDay: 'אירוע חדש',
    // `move`/`moveChoose`/`moveHere` were the ⋯ sheet's `הזז` step (ADR-0138 §8) and went
    // with it: the row's own time opens the shared picker now (ADR-0161 §7), and its words
    // are the `slot*` and `seam*` keys above — one vocabulary for a position, however you
    // reach it. `resolveAfter`/`resolveBefore`/`resolveOther` went the same way, being the
    // other half of the pair the picker replaced.
    rowActions: 'פעולות',
    // The sheet's own copy moved to `slotFill` below: it serves two headers on two screens
    // now (ADR-0161 §6), so it stopped being Plan mode's.
    addIdea: 'הוספת רעיון למדף',
    addIdeaPlaceholder: 'רעיון חדש למדף…',
    removeIdea: 'הסרת הרעיון',
    // An empty day has no gaps to drop onto, so the empty state becomes the target
    // while a drag is live (ADR-0116 session-117). It has no slot to offer, so it
    // promises a time chooser rather than a schedule.
    dayDropHere: 'שחררו כאן לבחירת שעה',
    // An EVENT dropped on that same empty day keeps its time and just changes day
    // (session-123) — it exists already, so there is nothing to choose.
    moveDayDropHere: 'שחררו כאן להעברה ליום הזה',
    // …and the mirror image (session-118): a row dragged onto a shelf group leaves the
    // day and becomes an idea. Which group it lands on sets the idea's day, so the two
    // zones name their outcome rather than both saying "drop here".
    parkDropHere: 'שחררו כאן להעברה למדף · ליום הזה',
    parkSomedayDropHere: 'שחררו כאן להעברה למדף · מתישהו',
    // **`פער` and not `חור`, on the owner's call (2026-08-26)**, and this is the string that
    // settled it: the app already had a name for this slot, so `חור` was a third word for one
    // thing. `חלון` was the other candidate and is refused — the app spends "window" on a
    // check-in's own (ADR-0184 §6's `לסגירה`), and two windows would be worse than two gaps.
    // **The drawing says `חור`** (`where-a-route-shows-up-v1.html` §2) and a drawing is not
    // retrofitted; the note lives here so nobody restores it from there.
    gap: (label: string) => `פער של ${label} · שבץ`,
    // **Why the offer is smaller than the hole** (`where-a-route-shows-up-v1.html` §2's drawn
    // `bld-slot-note`). Plan mode does not display a hole, it OFFERS it — so when ADR-0206 §V1.1's
    // correction shrinks the offer, the chip owes the reader the arithmetic rather than a smaller
    // number with no account of itself. Both values are `gapLabel`'s, the same ladder the chip
    // above is written in.
    gapOfWhich: (hole: string, travel: string) => `מתוך ${hole} · ${travel} מהם דרך`,
    // A SEAM (ADR-0161 §2): the same position a gap chip offers, below the chip
    // threshold — including zero, two rows that touch. It exists only while a drag is
    // live, so it names its OUTCOME the way every other drop zone in the builder does
    // rather than describing itself. `seamAfter` takes the row above it, which is what
    // makes "right after the flight" a thing you can say.
    seamAfter: (title: string) => `אחרי ${title}`,
    seamDayStart: 'בתחילת היום',
    // The other half of the pair, used where naming the row BELOW is the more useful thing
    // to say — before a hard anchor, which is what the day is built around.
    seamBefore: (title: string) => `לפני ${title}`,
    // The whole day as one position (ADR-0161 §2, extended): an empty day, a day of
    // untimed rows, or one whose only entries are booking transition points. It says the
    // day is free rather than measuring a "gap of 17 hours", which is true and useless.
    gapWholeDay: 'היום פנוי · שבץ',
    seamDayEnd: 'בסוף היום',
    // The day's edges (session-123): free time with an event on one side only, so the
    // chip says which side it is on rather than calling itself a gap "between".
    gapBefore: (label: string) => `פנוי לפני · ${label} · שבץ`,
    gapAfter: (label: string) => `פנוי אחרי · ${label} · שבץ`,
    gapMinutes: (n: number) => measure(n, 'דק׳'),
    gapHour: 'שעה',
    gapTwoHours: 'שעתיים',
    gapHours: (n: number) => measure(n, 'שעות'),
    // Overlap cluster (ADR-0041) — deliberately distinct from a gap: a bound
    // violet group, plus a seam tag on the colliding row.
    overlapping: 'חופפים',
    overlapSeam: (label: string) => `חופף ${label}`,
    // THE DAY AS A TIME PICKER (ADR-0161 §4). The question, and the two ways out of it.
    // Each row's own words are built from the day: `seamAfter`/`seamDayStart`/`seamDayEnd`
    // above are the same phrases the drag's seams use, which is deliberate — the two paths
    // to a position should not name it differently.
    slotWhen: 'לאיזה מקום ביום?',
    slotFree: (label: string) => `פנוי ${label}`,
    slotNow: 'עכשיו',
    slotExactTime: 'שעה מדויקת…',
    // The single position a day with nothing timed on it offers (ADR-0161 §2's amendment).
    slotWholeDay: 'בשעה הראשונה של היום',
    // …and what an untimed row's empty time slot offers instead of nothing at all.
    slotAddTime: 'שעה',
    slotOtherDay: 'ליום אחר…',
    slotMoveTitle: (title: string) => `להזיז · ${title}`,
    // "הזז" resolve sheet: choose which soft event to move, then a clean slot.
    resolve: 'הזזה',
    resolveTitle: 'פתרו את החפיפה',
    resolveChoose: 'בחרו איזה אירוע גמיש להזיז',
    resolveAnchor: 'עוגן · לא זז',
    resolveFor: (title: string) => `להזיז את ${title}`,
    resolveBack: 'אירוע אחר',
  },
  /** **"Which idea fits this slot"** — one sheet, two questions (ADR-0161 §6). Filling a gap
   *  names the slot, because a gap has no other name; a replacement names the event being
   *  displaced, because that is the thing you are deciding about. Both are answered from the
   *  same ranked shelf, so the rest of the copy is shared. */
  slotFill: {
    gapTitle: (range: string) => `מילוי הפער · ${range}`,
    replaceTitle: (title: string) => `החלפה · ${title}`,
    /** Under a replacement header: the slot the replacement inherits, whole. */
    replaceSub: (range: string) => `אותה שעה, אותו אורך · ${range}`,
    empty: 'אין רעיונות במדף · אפשר להוסיף אירוע חדש',
    // The sheet is capped at the best few; these are the way past the cap and the
    // search that only appears once the pool is big enough to need one.
    search: 'חיפוש ברעיונות',
    searchClear: 'ניקוי',
    all: (n: number) => `כל ${n} הרעיונות`,
  },
  event: {
    hard: 'קשיח',
    soft: 'גמיש',
    softNow: 'גמיש · עכשיו',
    // Derived-phase tags (ADR-0043): a passed-but-unmarked event, and the
    // positive "we did this" record on a done one (--ok green, not amber).
    passed: 'עבר',
    notMarked: 'עבר · לא סומן',
    didThis: 'היינו',
    skipped: 'דילגנו',
    nextDay: 'מסתיים מחר',
    bookingLabel: 'הזמנה',
    hardWarn: 'קשיח · שינוי מחייב עדכון ההזמנה',
    // The conflicting event's title renders as a NODE between these two halves
    // (`ui/TitleLabel` — a flight reads as its shortened route with the SVG
    // arrow, ADR-0059 §3 session-101 amendment), not as an interpolated string.
    conflictWarn: {
      before: 'חופף ל-',
      after: (time: string) => `(קשיח) · ${time}`,
    },
    // Tooltip on the zone-shift pill (ADR-0107): how far this event's clock is
    // from the day's — the destination vs origin for a flight.
    zoneShift: 'הפרש שעון מאזור הזמן של היום',
    // Origin on a destination-primary transport row (ADR-0059 §3 amendment).
    routeFrom: (origin: string) => `מ־${origin}`,
  },
  actions: {
    restore: 'שחזור',
    // The done ✓ doubles as a one-tap undo (ADR-0043 revision) — its accessible
    // name / tooltip.
    undoDone: 'ביטול הסימון · שחזור',
    navigate: 'ניווט',
    // The view-on-map peer of navigate (directions). Kept to one word so the two
    // location actions ("ניווט · מפה") stay compact in the crowded card row.
    showOnMap: 'מפה',
    // "Back to the shelf" (ADR-0116 §4) — canonical here rather than in planDay,
    // now that both the builder row and the Trip-mode card expose the same verb.
    toShelf: 'העבר למדף',
    delayBy: (minutes: number) => `דחה ${minutes} דק׳`,
    earlierBy: (minutes: number) => `הקדם ${minutes} דק׳`,
    stepMinutes: (minutes: number) => `${minutes} דק׳`,
    onWay: 'בדרך',
    done: 'סיימנו',
    // THE SETTLE PAIR (ADR-0043/0044/0139), shared by all three of `SettleControl`'s
    // densities. Both halves are records of what happened, not actions: the skip
    // side reuses `event.skipped` ('דילגנו'), because the pair `היינו` / `דלג` mixed a
    // record with an imperative and read as "yes, or move it along".
    wasThere: 'היינו',
    // What the undo takes back, said as what it undoes rather than a bare "בטל".
    undoSettle: 'ביטול סימון',
    // The row-menu / action-row ACTION ("skip this one") — not the settle pair's other half,
    // which is the record `דילגנו`. The two stay different words on purpose.
    skip: 'דילוג',
    swap: 'החלפה',
    scheduleToDay: 'שיבוץ ליום',
    scheduled: 'שובץ',
    newEvent: 'אירוע חדש',
    edit: 'עריכה',
    delete: 'מחיקה',
    more: 'פעולות',
  },
  toast: {
    markedDone: 'סומן כבוצע',
    removed: 'הוסר מהיום',
    restored: 'האירוע חזר למקום',
    // `החלף` used to say "picked for replacement · choose a replacement from the shelf" and
    // then leave the slot empty, which was the report against it (ADR-0161 §6). It is one
    // decision now, so it gets one toast: what took the slot, and where the other one went.
    replaced: (title: string) => `${title} נכנס לשעה הזו · הקודם עבר למדף`,
    hardDelayed: 'נדחה · צריך לעדכן גם את ההזמנה',
    softDelayed: (minutes: number) => `נדחה ב-${minutes} דקות`,
    softEarlier: (minutes: number) => `הוקדם ב-${minutes} דקות`,
    // `בדרך` writes a device mark now (ADR-0206 §Z5 §M4) and the toast says exactly that. It
    // used to read `שותף לקבוצה · בדרך` over a verb that wrote nothing at all, which made it
    // the one confirmation in the app that was false.
    onWayMarked: 'בדרך · לא שותף לקבוצה עדיין',
    scheduled: (title: string, time: string) => `${title} שובץ ל-${time}`,
    rippleApplied: 'האירועים הבאים נדחו',
    hardConfirmRequired: 'שינוי אירוע קשיח מחייב אישור',
    writeFailed: 'משהו השתבש · אפשר לנסות שוב',
    moveIntoPast: 'אי אפשר לשבץ אירוע לשעה שכבר עברה',
    moveCrossesDay: 'העברה ליום אחר נעשית במצב תכנון',
    eventCreated: 'האירוע נוסף',
    eventUpdated: 'האירוע עודכן',
    // A booked save is ONE action however many writes it took (ADR-0136 §3), so it gets one
    // toast — and its undo reverses the booking, the link and the consume together.
    eventBooked: 'האירוע נוסף, וגם ההזמנה',
    eventDeleted: 'האירוע נמחק',
    // Two events traded positions, each keeping its own length (ADR-0161 §1). It was
    // `reordered: 'הסדר עודכן'`, which was true of the old slot permutation and is the
    // wrong word for a swap: what changed is where two things are, not the day's order.
    swappedPositions: 'האירועים החליפו מקומות',
    scheduledDay: (title: string) => `${title} נוסף ליום`,
    maybeAdded: 'הרעיון נוסף למדף',
    // Re-aiming an idea between the shelf's two groups (ADR-0116 §2) — a pencil
    // mark, so the copy deliberately doesn't say "שובץ" (that's a schedule).
    maybeAimedAtDay: 'הרעיון סומן ליום הזה',
    maybeBackToPool: 'הרעיון חזר לרעיונות',
    maybeRemoved: 'הרעיון הוסר מהמדף',
    movedToShelf: 'הועבר למדף האולי',
    placeDeleted: 'המקום נמחק',
  },
  ripple: {
    prompt: (movedTitle: string, direction: 'later' | 'earlier') =>
      direction === 'earlier'
        ? `${movedTitle} הוקדם - להקדים גם את האירועים שלפניו?`
        : `${movedTitle} נדחה - לדחות גם את האירועים שאחריו?`,
  },
  confirm: {
    // Both bodies open with the event's title as a NODE (`ui/TitleLabel`), so the
    // copy is what follows it — a flight names its route, shortened, with the SVG
    // arrow, like every other surface (ADR-0059 §3 session-101 amendment).
    hardEditTitle: 'לשנות אירוע קשיח?',
    hardEditBody: 'מחובר להזמנה אמיתית - שינוי כאן ידרוש לעדכן גם אותה. ממשיכים?',
    hardDeleteTitle: 'למחוק אירוע קשיח?',
    hardDeleteBody: 'מחובר להזמנה אמיתית - המחיקה לא מבטלת את ההזמנה עצמה. ממשיכים?',
  },
  iconPicker: {
    open: 'בחירת סמל',
    title: 'בחירת סמל',
    all: 'הכול',
    searchPlaceholder: 'חיפוש סמל או מדינה…',
    noMatch: 'לא נמצא סמל',
    categoryReadout: (label: string) => `קטגוריה: ${label}`,
    // Browse-group labels — keyed by IconGroup.id in @waypoint/shared's ICON_SET.
    groups: {
      transport: 'תחבורה',
      food: 'אוכל',
      drink: 'שתייה',
      lodging: 'לינה',
      sights: 'אתרים ותרבות',
      nature: 'טבע וחוץ',
      activity: 'פעילות ופנאי',
      shopping: 'קניות',
      practical: 'מעשי ובריאות',
      general: 'כללי',
    },
    // Canonical EventCategory labels — for the saved-category readout.
    categories: {
      transport: 'תחבורה',
      food: 'אוכל',
      lodging: 'לינה',
      sightseeing: 'אתרים',
      nature: 'טבע',
      activity: 'פעילות',
      shopping: 'קניות',
      services: 'מעשי',
      other: 'כללי',
    },
  },
  eventForm: {
    newTitle: 'אירוע חדש',
    editTitle: 'עריכת אירוע',
    scheduleTitle: 'שיבוץ מהמדף',
    titleLabel: 'כותרת',
    titlePlaceholder: 'למשל: ארוחת ערב',
    dateLabel: 'תאריך',
    startLabel: 'שעת התחלה',
    endLabel: 'שעת סיום',
    locationLabel: 'מיקום',
    locationPlaceholder: 'אופציונלי',
    categoryLabel: 'קטגוריה',
    // `CategoryField`'s leading pill when nothing is chosen AND nothing is inherited — the
    // way back to no category at all. A host that DOES inherit replaces this with where the
    // value came from (`לפי ההזמנה`), so this word only ever means "genuinely none".
    categoryNone: 'ללא',
    kindLabel: 'סוג',
    kindHard: 'קשיח',
    kindSoft: 'גמיש',
    // ── The `יש הזמנה` row (ADR-0136) ──────────────────────────────────────
    // You are always creating an event; this says it is ALSO booked. One tap, no
    // typing — which is what makes it work for a table booked by phone and for people
    // who never record a number. It carries no `field-label`: the button says the word,
    // and a label above it saying `הזמנה` is the same word twice for 20px.
    bookedLabel: 'יש הזמנה',
    // The code is a detail OF a booking, never what creates one — so it is optional and
    // says so. `קוד אישור` is the app's existing name for it (`index.form.codeLabel`),
    // not the mockup's ad-hoc `מספר אישור`.
    bookedCodePlaceholder: 'קוד אישור · לא חובה',
    // The one question the category cannot answer (§2): `EventCategory` has a single
    // `transport` while `BookingType` has flight, train and other. An accessible name for
    // the pill group only — the pills carry no visible label, since they say what they are
    // and the statement below names the result.
    bookedTypeLabel: 'סוג ההזמנה',
    // THE DERIVATION, STATED (§2) — never a second type picker; it moves with the
    // category pill, so the app is visibly understanding rather than quietly deciding.
    // Two tails because the two operations differ: a create can be completed later, a
    // conversion moves two fields off the event being edited (§3).
    //
    //
    // **The CREATE one names the kind it is setting; the convert one does not** (ADR-0192 §3).
    // `סוג` moved up into the time band, so it now sits ABOVE this row and can be re-derived
    // off screen — a clause pays for that rather than a second control. It is on the create
    // alone because the re-derivation only runs while the kind is UNTOUCHED, and ADR-0136 §4
    // counts an existing event as touched: on an edit this toggle never moves the kind, so
    // saying `יסומן …` there would announce a change that is not going to happen. A spec
    // caught that, which is the whole reason it is written down here.
    bookedDerived: (type: string, kind: string) =>
      `האירוע יירשם גם כהזמנה · ${type}, ויסומן ${kind}. אפשר להשלים אותה אחר כך`,
    bookedDerivedConvert: (type: string) =>
      `האירוע הזה יירשם גם כהזמנה · ${type}, והמיקום והקטגוריה יעברו אליה`,
    // Already linked: no control at all, a statement with a way in (§3) — the code, room
    // and notes live on the booking now, which is also what makes the path one-way.
    bookedLinkedLabel: 'הזמנה',
    bookedLinkedOpen: 'פתיחת ההזמנה',
    save: 'שמירה',
    cancel: 'ביטול',
    titleRequired: 'חסרה כותרת',
    dateRequired: 'חסר תאריך',
    dateOutOfRange: 'התאריך מחוץ לטווח הטיול',
    endBeforeStart: 'שעת הסיום צריכה להיות אחרי ההתחלה',
    // The zone chip (ADR-0107 §6): which zone the typed times mean, one tap
    // correctable. `zonePick` is the button's accessible name; `zoneReset` drops a
    // manual choice and hands the event back to the automatic zone.
    zoneLabel: 'השעות באזור',
    zonePick: (zone: string) => `אזור הזמן של השעות: ${zone}. לשינוי`,
    zoneReset: 'חזרה לאזור אוטומטי',
    // Time picker (T-054): compact start + duration fields, scroll list with a
    // typeable exact-time fallback. Multi-day events are out of scope, so the
    // duration is capped to the same calendar day.
    timeLabel: 'שעה',
    startCap: 'התחלה',
    durationCap: 'משך',
    // The word between a start and its duration, now that the clock reads as a
    // sentence rather than two captioned cells (ADR-0177 §1).
    forPrefix: 'למשך',
    addTime: 'הוספת שעה',
    addEnd: 'הוספת סיום',
    noTime: 'ללא שעה',
    exactStart: 'שעה מדויקת',
    exactEnd: 'סיום מדויק',
    endsAtPrefix: 'עד',
    invalidEnd: 'שעת סיום לא תקינה',
    nextDay: 'למחרת',
    // duration phrasing (mirrors formatCountdown's dual/plural Hebrew)
    durHour: 'שעה',
    durTwoHours: 'שעתיים',
    durHours: (n: number) => `${n} שעות`,
    durHoursMinutes: (h: number, m: number) => `${h}:${String(m).padStart(2, '0')} שע׳`,
    durMinutes: (m: number) => `${m} דק׳`,
  },
  // Places picker (ADR-0110 / ADR-0109 §12). The search is a paid Google relay
  // behind our proxy; the footer carries Google's required attribution.
  placePicker: {
    // Two corpora, one field (ADR-0131 §10) — the same two words the Map tab's sheet
    // uses, deliberately, because it is the same distinction in a second host.
    tripGroup: 'בטיול',
    googleGroup: 'מגוגל',
    open: 'בחירת מקום',
    empty: 'הוספת מקום',
    clear: 'הסרת המקום',
    // **A stop's ✕ removes the STOP, not just its place** (ADR-0203 §4). The control is the
    // same one; what differs is what it means on a row that is itself optional, and a screen
    // reader is the only place that difference can be heard.
    removeStop: 'הסרת העצירה',
    title: 'מקום',
    // Under an empty location field, in BOTH authoring forms — one key, because an
    // event and a booking lose exactly the same five things. Entities saved happily
    // with no location and then nothing anywhere said so; it cost a false bug report
    // (a two-night hotel "missing from the map" was a hotel with no place). The save
    // is NOT gated: a confirm on absence, on a non-destructive action, on a
    // legitimate mid-planning path would be clicked through (ADR-0109 §6's anti-nag
    // reasoning). So the note names what is lost and gets out of the way.
    noLocationHint:
      'בלי מיקום אין סימון במפה, אין ניווט ואין מרחק. והשעות ייקראו באזור הזמן של הקטע בטיול, לא של המקום עצמו.',
    searchPlaceholder: 'חיפוש מקום…',
    alreadyInTrip: 'כבר בטיול',
    saveNameOnly: (name: string) => `שמירת "${name}" כשם בלבד`,
    costFooter: 'מופעל על ידי Google',
    rateLimited: 'יותר מדי חיפושים · נסו שוב בעוד רגע',
    failed: 'החיפוש נכשל · בדקו את החיבור או שמרו שם בלבד',
  },
  // The shared zone picker (ADR-0113 §6) — trip settings, creation, event chip.
  zonePicker: {
    title: 'אזור זמן',
    searchPlaceholder: 'חיפוש לפי עיר או אזור…',
    suggested: 'מוצע',
    allZones: 'כל האזורים',
    noResults: 'לא נמצא אזור זמן',
  },
  // The currency picker (ADR-0180 §6) — the zone picker's sibling over
  // `Intl.supportedValuesOf('currency')`. Its own strings rather than a shared
  // set: "מוצע" happens to be the same word, and pretending that is one string
  // is how a picker ends up unable to say "כל המטבעות".
  currencyPicker: {
    title: 'מטבע',
    searchPlaceholder: 'חיפוש לפי שם, סמל או קוד…',
    suggested: 'מוצע',
    allCurrencies: 'כל המטבעות',
    noResults: 'לא נמצא מטבע',
  },
  // The "when" standard (WhenField). Shared span-endpoint copy for the tap-to-open
  // time field, the derived duration read-out, and the crosses-a-day marker.
  /** **A journey's schedule** (ADR-0203). The relative day is the load-bearing string: it
   *  replaces the arrival's second calendar date, which is what was read as a return flight. */
  journey: {
    sameDay: 'באותו יום',
    nextDay: 'למחרת',
    plusDays: (n: number) => `+${n} ימים`,
    /** The token's accessible name — the visible run is the day alone. */
    dayLabel: 'היום',
    /** A summarised node's one control: it reopens the node's real fields. */
    editTimes: 'עריכת הזמנים',
    waitShort: 'המתנה',
    /** The app's separator, between peer facts on a summarised line. */
    dot: '·',
    noPlace: '-',
    /** A summarised first node still carries the journey's ONE date — collapsing it away
     *  hides the single fact the design rests on — and reads it compactly (ADR-0176 allows
     *  both faces; the numeric one is what a summary is for). */
    shortDate: (iso: string) => {
      const [, m, d] = iso.split('-');
      return `${Number(d)}.${Number(m)}`;
    },
    /** Said while a seeded return is still an exact mirror of its outbound (§6), and gone
     *  the moment any of it diverges. */
    sameRouteReversed: 'אותו מסלול בהיפוך',
    /** The words a suggestion source may put on its pill (ADR-0203 §5/§8). Passed INTO
     *  `lib/form-suggest.ts` rather than imported there: that module is logic, and Hebrew
     *  copy lives here (ADR-0009). */
    suggest: {
      tripStart: 'תחילת הטיול',
      tripEnd: 'סוף הטיול',
      afterPrevious: 'יום הקטע הקודם',
      /** Which leg a suggested PLACE was read off. `הלוך`/`חזרה` are already one pair of
       *  words here (ADR-0154 §6) because the leg headings write them, so a suggestion says
       *  where it came from in vocabulary the reader has already seen on this form. */
      fromOutbound: 'מההלוך',
      fromReturn: 'מהחזרה',
    },
  },
  whenField: {
    // ONE label for the whole when (ADR-0177 §1), replacing a caption per atom — the
    // values say what they are, so "תאריך" over a date was the screen saying it twice.
    label: 'מתי',
    dateCap: 'תאריך',
    timeCap: 'שעה',
    addDate: 'הוספת תאריך',
    addTime: 'הוספת שעה',
    exactTime: 'שעה מדויקת',
    durationPrefix: 'משך:',
    crossesDay: 'חוצה יממה',
    // A date range reads as one sentence (ADR-0177 §1), so what used to be two
    // captions BESIDE the boxes — and overflowed the card by 21px doing it — are
    // words inside it. A word in a wrapping line cannot be clipped by an edge.
    rangeFrom: 'מ־',
    rangeTo: 'עד',
    // The opt-in second bound (ADR-0184). The placeholder carries the word so the empty
    // token says what it would add — `＋ עד` reads as an invitation where a bare `＋`
    // reads as a mystery. `windowCap` is the hidden caption a screen reader hears.
    //
    // **THE WORD IS PER EDGE, AND THAT IS A BUG FIX, NOT A NICETY.** A start edge's own
    // time is the window's FLOOR, so the second bound is its ceiling and reads `עד`. An
    // end edge is the other way round: the check-out time IS the deadline and the field
    // stores `endWindowStart`, the EARLIEST you may leave. Labelling that one `עד` too
    // invited exactly the input it cannot mean — check-out `06:00` plus `עד 11:00`, which
    // `windowBoundIso` then rolled back a day (a larger clock on an end edge reads as
    // yesterday) into a 19-hour window that rendered `11:00–06:00`.
    addWindow: '＋ עד',
    addWindowFrom: '＋ מ־',
    windowCap: 'סוף החלון',
    windowFromCap: 'תחילת החלון',
  },
  // **Itinerary sharing** (ADR-0213). Two readerships in one section: `owner` is written for
  // the person deciding what to publish, `public` for a stranger holding a link who has no
  // account and never will — which is why nothing under `public` mentions signing in until
  // the invitation at the very bottom of the page.
  share: {
    // The control, in the trip header. On All Trips there is no control: the way in is a
    // hold on the card (ADR-0033's 2026-08-30 amendment), and this is its visible twin.
    entry: 'שיתוף',
    owner: {
      // **The trip, not the itinerary** — the sheet grants two different things now, and
      // one of them adds a person to the trip (ADR-0213's 2026-08-30 amendment).
      title: 'שיתוף הטיול',
      // **The question changed with the model** (ADR-0213's tenth amendment). It used to ask
      // how much of the route would appear, because there was one link and the answer was a
      // setting on it. Now each level holds its own link, so the choice is which link you
      // are handing over — and nothing you touch here changes what somebody already holds.
      lead: 'איזה לינק לשלוח?',
      levels: {
        summary: 'תקציר',
        full: 'לו״ז מלא',
        everything: 'הכל',
      },
      // The consequence of the choice, said plainly. This is the only place a reader is
      // told what stays private, so it names the exclusions rather than implying them.
      scope: {
        summary: {
          title: 'התמונה הגדולה',
          detail: 'חלקי יום ועיקרי המסלול, בלי שעות מדויקות וכתובות',
        },
        full: {
          title: 'כל הלו״ז, בלי סודות',
          detail: 'שעות, מקומות, כתובות ונסיעות, בלי קודים ופרטים אישיים',
        },
        everything: {
          title: 'הלו״ז המלא, עם מה שתבחרו',
          detail: 'כל האפשרויות הרגישות מתחילות כבויות',
        },
      },
      privateRows: {
        bookingSecrets: { title: 'סודות הזמנה', detail: 'קודי אישור, חדר ו-WiFi' },
        notesAndTasks: { title: 'פתקים ומשימות', detail: 'רק תוכן שמחובר למסלול' },
        travelerIdentity: { title: 'זהות הנוסעים', detail: 'שמות בלבד, אף פעם לא אימייל' },
        documents: { title: 'כרטיסים והזמנות', detail: 'בחירה נפרדת של כל קובץ' },
      },
      noDocuments: 'אין עדיין קבצים בטיול',
      liveNote: 'לינק חי שמתעדכן עם הטיול',
      // The scope note's last line reports what exists at the selected level, so the sheet
      // says what is exposed before anything is pressed.
      noLinkYet: 'אין עדיין לינק ברמה הזאת · יווצר בשליחה',
      oneLive: 'לינק חי אחד · אפשר להחזיק כמה במקביל',
      manyLive: (n: number) => `${n} לינקים חיים · כל אחד עם המדיניות שלו`,
      /** A level card that already holds a live link. The dot is paint, so the card says so
       *  in its accessible name instead (`ChoiceGrid`'s `ariaLabel`). */
      levelLive: (level: string) => `${level} · לינק פעיל`,
      actions: {
        liveLink: 'שיתוף לינק חי',
        pdf: 'שיתוף PDF',
        download: 'הורדה',
        // A policy with no link yet. The press is what creates it, exactly as before — the
        // sheet must never publish a trip just because somebody looked at a control.
        createAndShare: 'יצירה ושליחה',
        another: 'לינק נוסף',
      },
      /**
       * **A link is named by what it reveals, never by who it went to.**
       *
       * A derived title is checkable — the app can prove `קודים · פתקים · 2 קבצים` is what
       * this policy publishes — where a name somebody typed says who received it, which
       * nothing can verify and which goes stale in silence (the tenth amendment §7 rejects
       * typed names on exactly that ground). Composed in the app's `·` grammar so a row
       * reads like every other list row.
       */
      policy: {
        secrets: 'קודים',
        notes: 'פתקים',
        travelers: 'שמות',
        files: (n: number) => (n === 1 ? 'קובץ אחד' : `${n} קבצים`),
        /** Everything switched off is still a policy, and saying so beats an empty title
         *  that reads as a rendering fault. */
        none: 'בלי תוספות',
      },
      pdf: {
        preparing: 'מכינים את ה-PDF',
        preparingDetail: 'המסלול נשאר פתוח בזמן ההכנה',
        ready: 'ה-PDF מוכן',
        failed: 'לא הצלחנו להכין את הקובץ. נסו שוב.',
      },
      copied: 'הלינק הועתק',
      // **`levelSaved` is gone, and its absence is the feature** (ADR-0213's tenth
      // amendment §2). It announced that moving the level control had changed what a live
      // link shows. With one link per policy nothing in this sheet changes a live link, so
      // there is no longer anything to announce.
      manage: 'ניהול הלינק',
      // Both verbs name their scope, because a "stop sharing" that stops one link out of
      // three is the most dangerous word in the sheet.
      rotate: 'החלפת הלינק הזה',
      rotateTitle: 'להחליף את הלינק?',
      rotateBody: 'הלינק הקודם יפסיק לעבוד מיד, גם אצל מי שכבר קיבל אותו. שאר הלינקים לא ישתנו.',
      rotateConfirm: 'החלפה',
      stop: 'הפסקת השיתוף הזה',
      stopTitle: 'להפסיק לשתף?',
      stopBody:
        'הלינק יפסיק לעבוד. שאר הלינקים של הטיול ימשיכו. תוכלו לשתף שוב מתי שתרצו, עם לינק חדש.',
      stopConfirm: 'הפסקה',
      // The panic button, shown only at two or more live links: whoever wants the sharing
      // to stop now should not have to visit three rows to do it.
      stopAll: (n: number) => `הפסקת כל השיתופים · ${n}`,
      stopAllTitle: 'להפסיק את כל השיתופים?',
      stopAllBody: 'כל הלינקים הציבוריים של הטיול יפסיקו לעבוד מיד.',
      stopAllConfirm: 'הפסקת הכל',
      // A peer may send an existing link but not change what it shows.
      peerNote: 'רק מנהלי הטיול יכולים לשנות מה הלינק מראה.',
      notShared: 'הטיול עדיין לא משותף.',
      /** The list's own header at Everything, where several links live side by side. */
      linksHere: 'הלינקים ברמה הזאת',
      manageLink: 'ניהול הלינק הזה',
      sendLink: 'שליחת הלינק',
      failed: 'משהו השתבש. נסו שוב.',
      copyLink: 'העתקת הלינק',
      // **The sheet's first question, because the two links are two GRANTS** (ADR-0213's
      // 2026-08-30 amendment). One adds a person to the trip, the other hands a stranger a
      // projection — so the audience is asked before anything else, and never offered as a
      // third button beside the two that are merely two formats of the same grant.
      audience: {
        lead: 'למי זה הולך?',
        join: 'מצטרפים לטיול',
        read: 'רק לצפייה',
      },
      join: {
        scope: {
          title: 'הלינק להצטרפות',
          detail: 'מי שנכנס נוסף לרשימת הנוסעים · רואה הכל ויכול לערוך · פעיל עד סוף הטיול',
        },
        note: 'לינק אחד לטיול · אפשר לשלוח אותו לקבוצה',
        action: 'שליחת הלינק',
        // Distinct from the read-only link's `החלפת הלינק`: this one also says who keeps
        // their place, which is the question anyone hesitates over before pressing it.
        rotate: 'לינק הזמנה חדש',
        rotateTitle: 'ליצור לינק הזמנה חדש?',
        rotateBody: 'הלינק הקודם יפסיק לעבוד מיד. מי שכבר הצטרף נשאר בטיול.',
        rotateConfirm: 'יצירה',
        rotated: 'נוצר לינק חדש · הקודם בוטל',
      },
    },
    public: {
      brand: 'Travelive',
      /**
       * **Where the trip IS, in the line that used to assert it was live** (ADR-0213's
       * eleventh amendment §4). `kicker` was the constant `מסלול חי`, printed identically on
       * a trip that ended six months ago; these three say something a reader can act on. The
       * numbers are isolated at the call site, not here.
       */
      phase: {
        soon: (days: number) => (days === 1 ? 'מתחילים מחר' : `עוד ${days} ימים`),
        live: (day: number, total: number) => `יום ${day} מתוך ${total}`,
        ended: 'הטיול הסתיים',
      },
      /** `עודכן לפני 4 ד׳` / `עודכן עכשיו`, over `duration.ts`'s `agoLabel` — the app's one
       *  elapsed ladder (ADR-0114) rather than a second time vocabulary for this page. It
       *  replaced a fixed `עודכן עכשיו` that was stamped at load and never revisited. */
      updated: (ago: string) => `עודכן ${ago}`,
      stale: 'לא הצלחנו לעדכן',
      staleBody: 'מוצגת הגרסה האחרונה שנטענה. ננסה לעדכן שוב כשהחיבור יחזור.',
      days: 'המסע יום אחר יום',
      schedule: 'הלו״ז',
      daysHint: 'כל יום לפי חלקיו',
      map: 'פתיחה במפה',
      // The counts sentence the deterministic narrative deliberately does NOT send from
      // the server (it ships data, this ships the words around it).
      counts: (days: number, events: number) =>
        `${days} ${days === 1 ? 'יום' : 'ימים'} · ${events} ${events === 1 ? 'אירוע' : 'אירועים'} במסלול`,
      // **The leg says WHAT it is before it says how long** (owner, 2026-08-30: _"the live
      // map doesn't show driving/walking etc. properly"_). It shipped as two bare numbers,
      // so a 121-minute walk and a 67-minute drive were the same shape of line and nothing
      // on the page said which. The noun leads the duration exactly as `travelMode`'s own
      // note requires, and it is `travelMode`'s word rather than a second copy of it.
      // Takes the WORD, not the mode key — `travelMode` is the one place those words live
      // and this file cannot reference `t` from inside its own literal. Same shape as
      // `DayJoinRow`, which is already handed `t.travelMode.walking` by its host.
      journey: (mode: string, minutes: number, km: number) =>
        `${mode} · ${measure(minutes, 'דק׳')} · ${measure(km, 'ק״מ')}`,
      /**
       * **The words a derived day headline is made of** (ADR-0213's 2026-08-30 amendment;
       * owner: _"Some day titles could also be derived (flying to Iceland, flying back…)"_).
       *
       * The projection ships `{ kind, …values }` and never a sentence — that is what keeps
       * one server derivation feeding a Hebrew page and a Hebrew PDF — so this is where a
       * `flightOut` becomes words. Every value arrives already bidi-isolated by the caller;
       * these add the Hebrew around it and nothing else.
       *
       * `PDF_COPY.dayTitle` in the backend is the print renderer's copy of exactly these
       * words, for the reason its own header explains. Reword one, reword the other.
       */
      dayTitle: {
        flightOut: (to: string) => `טסים ל${to}`,
        // No place: home is the absence of the trip, not somewhere the derivation knows —
        // and naming the arrival airport instead is what printed a full airport name twice
        // on every returning day.
        flightHome: 'טסים הביתה',
        flight: (to: string) => `טיסה ל${to}`,
        // **A day named by what its stops ARE** (Wikidata `P31`). Four waterfalls in one
        // day is a day of waterfalls — a better name than any two of their names. `region`
        // needs no entry: its value is a place name and prints as itself.
        kind: (noun: string) => `יום ${noun}`,
      },
      /** The owner's own phrasing for the day's second line: _"night at…, Sleeping at…"_. */
      daySummary: {
        stay: (place: string) => `לינה ב${place}`,
      },
      /** Names the route strip, which is otherwise an unexplained list of place names. */
      route: 'המסלול',
      // **A flight has to say when it lands** (owner, 2026-08-30: _"important time ranges, for
      // example flights must show when they start and when they finish"_). Both ends were in
      // the projection all along and both renderers printed only the first, so an eleven-hour
      // leg and a forty-minute one were the same shape of line. The numbers are isolated by
      // the caller; the en dash is the app's own range mark (`formatTripDates`).
      timeRange: (from: string, to: string) => `${from}–${to}`,
      // **How the trip moves**, in the owner's own words (2026-08-30): a circumnavigation
      // where the base changes every day or two is a different thing from a trip you take
      // from one place. `הקפה` is mine — a rolling trip that closes its circle is common
      // enough, and different enough in feel from a one-way traverse, to earn a word.
      tripShape: {
        base: 'טיול כוכב',
        loop: 'הקפה',
        line: 'טיול מתגלגל',
        // No nights recorded: the shape is unknown, and the clause is simply absent.
        unknown: '',
      },
      bases: (count: number) => `${count} ${count === 1 ? 'בסיס' : 'בסיסים'}`,
      // **Where you sleep, as the day's frame** (ADR-0213's 2026-08-30 amendment). The
      // value arrives isolated, so this joins it rather than composing around a raw name.
      stay: (place: string) => `לנים ${bindPrefix('ב', place)}`,
      // The wait between two legs of one journey. Named by the place you wait IN, because
      // "45 דקות" alone says nothing about where you are standing.
      layover: (place: string, span: string) => `המתנה ${bindPrefix('ב', place)} · ${span}`,
      /** **A download that reports itself** (owner, 2026-08-31: _"it simply downloads in the
       *  background, giving no indication"_). Four states now, because
       *  `shareFileOrDownload` returns three outcomes and `נשלח` is not `ירד`: on Android the
       *  file goes to the system share sheet, and telling a reader it "downloaded" when they
       *  sent it to WhatsApp is a small lie the mechanism does not require us to tell
       *  (ADR-0213 ninth amendment §5). `cancelled` says nothing at all — the reader
       *  dismissed the sheet on purpose, and a page that comments on that is nagging. */
      file: { working: 'מוריד…', done: 'ירד', shared: 'נשלח', failed: 'לא הצליח' },
      /** **A journey's header names where it ENDS** (ninth amendment §1) — the legs beneath
       *  it already spell the route out. `bindPrefix` because `לקפלאוויק` binds and
       *  `ל-Keflavík` takes the maqaf. */
      journeyTo: (place: string) => `טיסה ${bindPrefix('ל', place)}`,
      /** How many flights the journey is, so the header says what the container holds. */
      journeyLegs: (count: number) => (count === 2 ? 'שתי טיסות' : `${count} טיסות`),
      /** The reader's own copy of the itinerary. Not `שיתוף PDF` — that is the OWNER's verb
       *  in `share.owner.actions`; a stranger is taking it, not sharing it. */
      takePdf: 'הורדת המסלול כ-PDF',
      takePdfShort: 'PDF',
      takePdfWorking: 'מכינים…',
      takePdfFailed: 'לא הצלחנו להכין את הקובץ',
      ops: {
        // A count, because the row is otherwise a bare disclosure with nothing to promise.
        more: (count: number) => (count === 1 ? 'פרט אחד' : `${count} פרטים`),
      },
      commitments: {
        // **Not `מה שקבוע`** (owner, 2026-08-30: _"makes no sense in Hebrew"_). Every row
        // in this block is booking-backed — a flight, a car, a stay, a booked tour — so the
        // plain word for what they are is both accurate and what a person would say.
        title: 'ההזמנות',
        // **The day is stated, not jumped to** (owner, 2026-08-30: _"clicking on a booking
        // teleports you down which is inconvenient"_). A row that says which day it is on
        // answers the question the jump was answering, without moving the reader.
        day: (ordinal: number) => `יום ${ordinal}`,
      },
      appendix: {
        // **Not `פרטים נוספים`.** What is left here after the amendment is only what is
        // attached to no moment in the trip — the packing list, the group's own reminders.
        // That is a real category and deserves its own name rather than a catch-all.
        title: 'לקראת הנסיעה',
      },
      unavailableTitle: 'המסלול לא זמין',
      unavailableBody: 'יכול להיות שהלינק בוטל או שהטיול כבר לא קיים. בקשו לינק חדש ממי ששלח.',
      loading: 'טוען את המסלול…',
      inviteTitle: 'גם אתם מתכננים טיול?',
      inviteBody: 'Travelive מחבר את הלו״ז, המקומות והמסמכים במקום אחד.',
      inviteCta: 'תכננו טיול משלכם',
    },
    dayparts: {
      morning: 'בוקר',
      noon: 'צהריים',
      afternoon: 'אחר הצהריים',
      evening: 'ערב',
      night: 'לילה',
      flexible: 'גמיש',
    },
  },
  // Trip settings (ADR-0039): admin-governed. Mode-neutral chrome.
  settings: {
    title: 'הגדרות הטיול',
    back: 'חזרה לטיול',
    details: 'פרטי הטיול',
    edit: 'עריכה',
    save: 'שמירה',
    cancel: 'ביטול',
    nameLabel: 'שם הטיול',
    destinationLabel: 'יעד',
    iconLabel: 'סמל',
    datesLabel: 'תאריכים',
    // The three the save refuses on (ADR-0150). It used to be a dead button with no
    // note at all, so a form missing its destination said nothing whatsoever.
    nameRequired: 'חסר שם לטיול',
    destRequired: 'חסר יעד',
    datesRequired: 'חסרים תאריכים',
    dateFrom: 'מ־',
    dateTo: 'עד',
    timezoneLabel: 'אזור זמן',
    currencyLabel: 'מטבע',
    // Was a promise in the future tense until the derivation landed (ADR-0180
    // §1). Shipping the derivation without rewriting this would have left the
    // screen saying the feature does not exist yet.
    derivedHint: 'אזור-זמן ומטבע נגזרים מהיעד · אפשר לשנות ידנית בכל רגע',
    // The currency trigger before anything is derived — a country the table
    // does not carry, or a "use as typed" destination. A regular dash is the
    // app's "no value" placeholder.
    currencyUnset: '-',
    peerManaged: 'רק מנהל יכול לערוך את פרטי הטיול',
    party: "החבר'ה",
    memberCount: (n: number) => `${n} נוסעים`,
    // Renders after a name (`דן · זה אני`), which is why it is a clause and not `אתה`: the
    // roster is the one surface that has to point at the reader, and every second-person
    // singular in Hebrew picks a gender the app does not know.
    you: 'זה אני',
    roleAdmin: 'מנהל',
    rolePeer: 'נוסע',
    memberActions: (name: string) => `פעולות על ${name}`,
    // The member surface's detail rows (ADR-0133 §9) — the joined date moved here
    // off the row, which only names who is present.
    member: {
      roleLabel: 'תפקיד',
      joinedLabel: 'הצטרפות',
    },
    roster: "החבר'ה",
    rosterOpen: (n: number) => `החבר'ה, ${n} נוסעים`,
    rosterFoot: 'הזמנת אנשים חדשים והלינק לטיול נמצאים בהגדרות הטיול.',
    // The member surface closes rather than cancels: it is a detail card that may
    // carry actions, not a prompt you back out of.
    closeMember: 'סגירה',
    // **The infinitive, and it is the register rule's third carve-out.** The noun forms are
    // both unusable: `מינוי` is what a committee does, and `הפיכה למנהל` is not a phrase.
    // Hebrew's casual way to name an act on someone ELSE's state is the infinitive.
    promote: 'להפוך למנהל',
    removeMember: 'הסרה מהטיול',
    invite: "הזמנת החבר'ה",
    inviteGenerate: 'הצגת הלינק',
    inviteHint: 'לינק אחד לטיול · פעיל עד סוף הטיול · שתפו בקבוצה',
    inviteCopied: 'הלינק הועתק · שתפו בקבוצה',
    inviteReset: 'לינק חדש',
    inviteResetHint: 'מבטל את הלינק הקודם ויוצר חדש · למנהל בלבד',
    inviteReset_done: 'נוצר לינק חדש · הקודם בוטל',
    removedTitle: 'הוסרו מהטיול',
    removedHint: 'לא יוכלו לחזור דרך הלינק · אפשר להחזיר אותם',
    allowBack: 'החזרה לטיול',
    allowedBack: (name: string) => `${name} יכול לחזור דרך הלינק`,
    dangerZone: 'אזור רגיש',
    leave: 'יציאה מהטיול',
    leaveAction: 'יציאה',
    leaveHint: 'יוצאים מרשימת הנוסעים · אפשר לחזור עם לינק תקף',
    leaveConfirmTitle: 'לעזוב את הטיול?',
    leaveConfirmBody: (name: string) => `אתם יוצאים מ״${name}״. אפשר לחזור עם לינק תקף.`,
    delete: 'מחיקת הטיול לכולם',
    deleteAction: 'מחיקה',
    deleteHint: 'מחיקה זמינה למנהל בלבד · מוחקת את הטיול לכל הנוסעים',
    deleteConfirmTitle: 'למחוק את הטיול לכולם?',
    deleteConfirmBody: (name: string) => `״${name}״ יימחק לכל הנוסעים · אין דרך חזרה. ממשיכים?`,
    removeConfirmTitle: 'להסיר נוסע?',
    removeConfirmBody: (name: string) => `${name} יוסר מהטיול. תמיד אפשר להזמין מחדש.`,
    toast: {
      saved: 'הפרטים נשמרו',
      savedQueued: 'נשמר · יסונכרן כשנחזור לרשת',
      promoted: 'הנוסע הוא מנהל עכשיו',
      promotedQueued: 'עכשיו מנהל · יסונכרן כשנחזור לרשת',
      removed: 'הנוסע הוסר',
      left: 'עזבת את הטיול',
      deleted: 'הטיול נמחק',
    },
  },
} as const;
