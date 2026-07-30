// Hebrew UI copy — the active locale. All user-facing strings live here so logic
// stays language-agnostic (conventions.md). Interpolated copy is a function;
// runs that must render left-to-right (times, codes) stay as JSX in the caller.
import { countdownText } from '../lib/time';
import { type OutboxVerb } from '../lib/outbox';
import { measure } from '../lib/bidi';

export const t = {
  common: {
    undo: 'בטל',
    yes: 'כן',
    no: 'לא',
    now: 'עכשיו',
    loading: 'טוען',
    // Canonical action labels — one wording shared by every FormActions bar and
    // confirm dialog (U-02), so Save/Cancel/Delete never drift between forms.
    save: 'שמירה',
    cancel: 'ביטול',
    delete: 'מחיקה',
    // Unsaved-changes discard confirm (U-05), shown when closing a dirty form.
    discardTitle: 'לצאת בלי לשמור?',
    discardBody: 'יש שינויים שעדיין לא נשמרו. אם תצא עכשיו הם יאבדו.',
    discardConfirm: 'צא בלי לשמור',
    discardCancel: 'המשך עריכה',
  },
  // FilePicker (ADR-0086): the two pick tiles + preview clear, shared by every
  // attachment surface so the wording never drifts.
  filePicker: {
    upload: 'העלאת קובץ',
    capture: 'צלמו עכשיו',
    remove: 'הסר',
  },
  // Shared feedback-state family (ADR-0078): generic copy for the empty / loading
  // / error / status shells. Screens pass their own specific copy; these are the
  // sensible defaults (retry, a neutral "loading", a generic error title, dismiss).
  feedback: {
    retry: 'נסו שוב',
    loading: 'טוען',
    errorTitle: 'משהו השתבש',
    dismiss: 'סגירה',
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
    // MAKING a place on the canvas (ADR-0147). Two sources, one card: a long press yields a
    // spot that needs naming, a tap on one of Google's own sights yields a place Google will
    // name once the add is confirmed. So `namePrompt` asks and `googleTitle` states.
    make: {
      namePrompt: 'מה יש כאן?',
      namePlaceholder: 'שם המקום',
      // The card sits ON the spot and the camera framed it, so the coordinates are
      // confirmation rather than instruction — and a dropped pin has no address, on purpose
      // (a reverse geocode is paid). `measure` keeps the numeric run an LTR island.
      googleTitle: 'המקום שסימנתם',
      // Google's own label is the preview: it is drawn under your finger, which is why the
      // card does not repeat a name it would have to pay to learn.
      googleHint: 'גוגל ישלים את השם בהוספה',
      add: 'הוספה למדף',
      cancel: 'ביטול',
      failed: 'ההוספה נכשלה · נסו שוב',
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
      km: (km: number) => measure(km, 'ק״מ'),
      // Offline: you can't re-locate, so a number would be a stale claim.
      unavailable: 'מרחק לא זמין',
      prompt: {
        title: 'למיין לפי קרבה',
        body: 'כדי להראות מה קרוב אליכם עכשיו נשתמש במיקום המכשיר. המיקום נשאר במכשיר ואינו משותף עם הקבוצה.',
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
    // The way-in block's one primary action (ADR-0135 §1): a place in the trip could only
    // ever be an idea, and nothing said "put this on Tuesday at 14:00". Names the verb, not
    // the schema — "event or booking?" is the app's question, not the traveller's.
    scheduleToDay: 'שיבוץ ליום',
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
    },
    // The day's stops as one free Google directions link (ADR-0121 §10) — it
    // ships with the connector, so Plan mode's day scope, and costs nothing.
    dayRoute: 'מסלול היום בגוגל',
  },
  header: {
    dayOf: (day: number, total: number) => `יום ${day} מתוך ${total}`,
    // Plan mode, pre-trip: the header leads with the countdown to departure
    // instead of "day X of Y" (mockups/plan-mode-v1.html). Reads relative near
    // the date (ADR-0085): "יוצאים מחר", "יוצאים בעוד 3 ימים".
    leavingIn: (days: number) => `יוצאים ${countdownText(days)}`,
    pendingSync: (count: number) => `${count} שינויים מחכים לסנכרון`,
    offlineNow: 'אופליין · נתונים שמורים',
    // Day-scope context ribbon under the strip when viewing a non-today day in
    // Trip mode (ADR-0043 / ADR-0029), plus the one-tap way back to today.
    pastDay: 'יום שהיה · היסטוריה',
    futureDay: 'יום עתידי · תצוגה מקדימה',
    backToToday: 'חזרה להיום',
  },
  // Per-entity sync status (U-04, ADR-0080): the per-row SyncBadge, the header
  // failed-summary affordance, and the review/retry (dead-letter) sheet.
  sync: {
    badge: {
      synced: 'נשמר',
      pending: 'ממתין לסנכרון',
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
      setMemberRole: 'עדכון הרשאות חבר',
      removeMember: 'הסרת חבר',
      deleteTrip: 'מחיקת הטיול',
      createBooking: 'הוספת הזמנה',
      updateBooking: 'עדכון הזמנה',
      deleteBooking: 'מחיקת הזמנה',
      createPlace: 'הוספת מקום',
      updatePlace: 'עדכון מקום',
      uploadDocument: 'העלאת מסמך',
      // `satisfies Record<OutboxVerb, string>`, not `as Record<string, string>`: this map is
      // read as `t.sync.verb[f.verb]`, so a verb missing from it renders a queued failure with
      // NO name — and the loose cast made that silent. Typed, a new outbox verb is a compile
      // error here, which is how every other per-enum lookup in this app behaves.
    } satisfies Record<OutboxVerb, string>,
    review: {
      title: 'שינויים שלא נשמרו',
      intro: 'השינויים האלה נדחו בסנכרון. אפשר לנסות שוב או להשליך.',
      reason: 'השרת דחה את השינוי',
      retry: 'נסו שוב',
      discard: 'השליכו',
      discardAll: 'השליכו הכל',
      empty: 'אין שינויים שממתינים לטיפול.',
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
      clear: 'נקה חיפוש',
      backAria: 'סגירת חיפוש',
    },
    pastToggle: {
      show: (n: number) => `הצג הזמנות מהעבר (${n})`,
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
    emptyBody: 'טיסות, לינה ושאר ההזמנות שלכם יופיעו כאן · ידנית או מיובאות אוטומטית מ-Gmail',
    toast: {
      saved: 'ההזמנה נשמרה',
      savedQueued: 'יישמר כשנחזור לרשת',
      deleted: 'ההזמנה נמחקה',
    },
    // Read-only booking detail view (ADR-0053): tap a booking → facts + a visible
    // edit button + a "⋯" menu (edit / delete).
    detail: {
      // Imperatives, matching the event menus (ADR-0138 §6). These were the
      // nouns עריכה/מחיקה while the very same actions on an event read ערוך/מחק —
      // a menu item is something you tell the app to do, so the verb wins.
      edit: 'ערוך',
      actions: 'פעולות',
      delete: 'מחק',
      /** The verb the row's own `לא משובצת במסלול` was asking for (§7). */
      schedule: 'שבץ במסלול',
      reschedule: 'שנה שיבוץ',
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
      provider: 'ספק',
      room: 'חדר',
      wifi: 'WiFi',
      notes: 'הערות',
      hardNote: 'הזמנה קשיחה',
    },
    sheet: {
      editTitle: 'עריכת הזמנה',
      titlePlaceholder: 'שם ההזמנה',
      codeLabel: 'קוד אישור',
      locationLabel: 'מיקום',
      roomLabel: 'חדר',
      notesLabel: 'הערות',
      wifiTitle: 'WiFi',
      wifiHotelOnly: 'שדה למלון בלבד',
      wifiNetwork: 'רשת',
      wifiPassword: 'סיסמה',
      scheduledOn: (label: string) => `משובצת במסלול · ${label}`,
      notScheduled: 'לא משובצת במסלול · תזמון יתווסף בהמשך',
      save: 'שמור',
      cancel: 'בטל',
      delete: 'מחק הזמנה זו',
    },
    form: {
      add: 'הוסף הזמנה',
      createTitle: 'הזמנה חדשה',
      originLabel: 'מוצא 📍',
      destLabel: 'יעד 📍',
      routeLabel: 'מסלול',
      // Title-row preview when neither endpoint is picked yet.
      routePreviewGhost: 'בחרו מוצא ויעד',
      routeHint: 'מקומות אמיתיים · מזינים את המפה ואזורי הזמן',
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
      autoCaption: 'נבחר לפי סוג ההזמנה',
      reset: 'איפוס',
    },
    del: {
      linkedTitle: 'ההזמנה משובצת במסלול',
      linkedBody: 'יש אירוע במסלול שמסתמך על ההזמנה. מה לעשות?',
      hardNote: 'האירוע קשיח · מחויבות',
      both: 'מחק את שניהם',
      bothSub: 'ההזמנה והאירוע במסלול יימחקו',
      unlink: 'בטל שיוך ושמור את האירוע',
      unlinkSub: 'האירוע יישאר במסלול כרשומה ידנית',
      plainTitle: 'למחוק את ההזמנה?',
      plainBody: 'ההזמנה תוסר מהאינדקס.',
      confirmDelete: 'מחק',
      cancel: 'בטל',
    },
  },
  docs: {
    title: 'מסמכים',
    encrypted: 'מוצפן',
    add: 'הוסף מסמך',
    loading: 'טוען מסמכים…',
    offline: 'המסמכים ייטענו כשנחזור לרשת',
    emptyTitle: 'אין עדיין מסמכים שמורים',
    emptyBody: 'דרכונים, ביטוח וויזות · מוצפנים ונשמרים בבטחה',
    emptyAdd: 'העלה מסמך ראשון',
    group: {
      passport: 'דרכונים',
      insurance: 'ביטוח נסיעות',
      visa: 'ויזות',
      other: 'אחר',
    },
    type: {
      passport: 'דרכון',
      insurance: 'ביטוח',
      visa: 'ויזה',
      other: 'אחר',
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
      save: 'העלה',
      saving: 'מעלה…',
      queued: 'ממתין להעלאה',
      cancel: 'בטל',
      saved: 'המסמך הועלה',
      failed: 'ההעלאה נכשלה, נסו שוב',
      tooLarge: (mb: number) => `הקובץ גדול מדי · עד ${mb}MB`,
      wrongType: 'אפשר להעלות תמונה או PDF בלבד',
      offline: 'אין חיבור · ההעלאה תמתין לרשת',
    },
    viewer: {
      close: 'סגור',
      loading: 'טוען ומפענח…',
      error: 'לא הצלחנו לפתוח את המסמך',
      open: 'פתח בכרטיסייה',
      download: 'הורדה',
      handoff: 'הקובץ מוכן · פתחו אותו באפליקציה המתאימה או הורידו',
    },
    // Per-row manage menu + optimistic-action toasts (ADR-0052).
    manage: {
      actions: 'פעולות',
      // Imperatives, matching every other row menu (ADR-0138 §6).
      edit: 'ערוך',
      delete: 'מחק',
      nameField: 'שם',
      save: 'שמירה',
      saved: 'המסמך עודכן',
      deleteTitle: 'למחוק את המסמך?',
      deleteBody: 'הקובץ מוצפן ונמחק לצמיתות. אי אפשר לשחזר.',
      deleteConfirm: 'מחק לצמיתות',
      cancel: 'ביטול',
      deleted: 'המסמך נמחק',
      failed: 'הפעולה נכשלה, נסו שוב',
    },
  },
  mode: {
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
      featSync: 'כל החבורה מסונכרנת',
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
      boardOffBody: 'טיול ראשון מדליק אותו - מה עכשיו, מה הבא, וכל ההזמנות של החבורה במקום אחד.',
      create: 'טיול חדש',
      createSub: 'אתה זה שמארגן',
      join: 'הצטרף עם לינק',
      joinSub: 'קיבלת הזמנה מחבר',
      joinToast: 'קיבלת לינק מחבר? פשוט פתח אותו - ותוך שנייה אתה בפנים',
      offline: 'יצירה והצטרפות צריכות חיבור לרשת',
      teach: 'בחבורה של חמישה, בדרך כלל אחד יוצר את הטיול - וכל השאר נכנסים עם הלינק שלו.',
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
      dateError: 'רגע - תאריך הסיום לפני ההתחלה',
      datePast: 'רגע - התאריך כבר עבר',
      nameLabel: 'איך נקרא לזה?',
      namePlaceholder: 'נציע שם ברגע שנדע לאן',
      nameHint: 'הצענו לפי היעד - אפשר לשנות',
      draftGhost: 'הטיול שלכם',
      draftPending: 'עוד רגע מקבל צורה…',
      draftMeta: (destination: string, days: number) => `${destination} · ${days} ימים`,
      draftTag: 'טיוטה',
      createButton: 'יאללה, יש טיול 🎉',
      ctaReason: 'מלאו יעד, תאריכים ושם כדי להמשיך',
      offlineNote: 'יצירת טיול צריכה חיבור · לינק שחבר שולח ייפתח גם עכשיו',
      note: 'אזור זמן ומטבע מסתדרים לפי היעד · תקציב אפשר להוסיף אחר כך',
    },
    created: {
      modePill: 'מצב תכנון',
      emoji: '🎉',
      title: 'יש טיול!',
      sub: 'עכשיו הכי חשוב - להכניס את החבורה.',
      inviteLabel: 'לינק הזמנה · לחצו להעתקה ושיתוף',
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
      loading: 'טוען הזמנה…',
      // The pass's stamp (ADR-0143). Short enough to read inside a rotated stamp on a
      // dark ticket — a sentence would not fit and would not read as a stamp.
      stamp: 'מצטרפים',
      stampRefused: 'פג תוקף',
      refusedTitle: 'ההזמנה כבר לא בתוקף',
      invalid: 'הלינק הזה כבר לא בתוקף. אפשר לבקש מהחבר שישלח לינק חדש.',
      expired: 'הטיול הזה כבר הסתיים · הלינק כבר לא פעיל.',
      offline: 'צריך חיבור לרשת כדי לטעון את ההזמנה',
      heroTitle: 'הוזמנת לטיול!',
      heroBody: 'החברים כבר בפנים - נשארה רק ההצטרפות שלך.',
      ticketBadge: 'כרטיס הזמנה',
      members: (count: number) => (count === 1 ? 'חבר אחד כבר בפנים' : `${count} חברים כבר בפנים`),
      membersSub: 'מחכים רק לך',
      joinButton: 'הצטרפות לטיול',
      joinError: 'ההצטרפות נכשלה · אפשר לנסות שוב',
      // DELIBERATELY NO "you were removed" string (owner, 2026-07-31). A blocked join
      // renders the same refused pass, with the same words, as an invalid code — naming
      // the block would disclose a roster decision to someone who is no longer a member.
      // If this line ever comes back, that is the reason it should not.
      note: 'תוך שנייה אתה בפנים · מתחברים עם החשבון האישי, והכול נפתח מיד',
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
      chipPast: 'הסתיים',
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
      accountSection: 'החשבון',
      emailLabel: 'אימייל',
      emailHint: 'האימייל מגיע מהחשבון שאיתו נכנסתם ואינו נערך כאן, כי הוא מזהה את החשבון.',
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
        notAnImage: 'הקובץ שנבחר אינו תמונה.',
        removeHint: 'הסרה כאן היא ״לא להשתמש בה״, ולא מחיקה אצל גוגל, ולכן תמיד יש דרך חזרה.',
        noPhotoHint: 'אין תמונה בחשבון גוגל שאיתו נכנסתם, ולכן מוצגות האותיות הראשונות.',
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
    endOfDay: 'סוף היום',
    // Concurrency on the board (ADR-0041): the "ועוד N עכשיו" expander for extra
    // in-progress events, and the group-split header when several run at once.
    alsoNow: (n: number) => `ועוד ${n} עכשיו`,
    concurrentNow: 'עכשיו · במקביל',
    // "In transit" hero (ADR-0059 §2): a flight in the air fills the NOW slot,
    // teal = "where you are"; amber stays only on the time-to-landing.
    inTransitLive: 'בטיסה',
    inTransitLabel: 'כרגע · בדרך',
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
  // Group change-feed (ADR-0081, review U-09): a quiet strip narrating recent
  // SHARED peer edits. The subject is inlined in each lead; a moved-to clock time
  // is appended separately as a dir="auto" island (never inside these strings).
  // Verbs are masculine by convention (actor gender is unknown), matching the
  // settings/toast copy. No em dashes.
  changeFeed: {
    title: 'עדכונים מהקבוצה',
    clearAll: 'נקה הכל',
    clearAllLabel: 'נקה את כל העדכונים',
    dismiss: 'הסתר עדכון',
    someone: 'מישהו',
    nouns: {
      event: 'האירוע',
      booking: 'ההזמנה',
      place: 'המקום',
      document: 'המסמך',
      member: 'משתתף',
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
    // Ambient-span backdrop (a hotel / multi-day booking) shown across its nights
    // (ADR-0054) — not counted on the rail.
    ambientNight: (night: number, nights: number) => `לילה ${night} מתוך ${nights}`,
    // Amber transition markers on the rail + the shared booking grammar (ADR-0059
    // §3 / ADR-0063 profile keys): the two ends of a bracketed booking.
    // Wording is by mode, not hard-coded (ADR-0063 refinement): the generic
    // departure/arrival covers every surface transport (train, bus, ferry, car);
    // a flight refines to take-off/landing via ICON_TRANSITION_KEYS.
    transition: {
      checkIn: 'צ׳ק-אין',
      checkOut: 'צ׳ק-אאוט',
      departure: 'יציאה',
      arrival: 'הגעה',
      flightDeparture: 'המראה',
      flightArrival: 'נחיתה',
    },
    // "Inside a booking" mid-stay strip (ADR-0059 §2) — teal "where you are".
    stayingPrefix: 'שוהים ב־',
    nightLabel: 'לילה',
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
    },
    checklist: {
      title: 'מה חסר להשלמה',
      allDone: 'הכול מוכן 🎉',
      done: 'הושלם',
      // Completed checks collapse into a one-line summary with a show/hide toggle
      // (ADR-0061), so the list stays about what's still missing.
      showCompleted: (n: number) => `הצג שהושלמו (${n})`,
      hideCompleted: 'כווץ שהושלמו',
      completedSummary: 'הושלמו',
      // Short labels for the collapsed-summary pills (one per completed check).
      summaryLabels: {
        flights: 'טיסות',
        lodging: 'לינה',
        itinerary: 'ימים',
        documents: 'מסמכים',
        group: 'הקבוצה',
      },
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
      documentsDoneMeta: 'כל המטיילים העלו דרכון',
      documentsMissingMeta: (have: number, total: number) => `${have} מתוך ${total} העלו דרכון`,
      uploadDocs: 'העלו',
      groupTitle: 'החבורה',
      groupDoneMeta: (n: number) => `${n} מטיילים בפנים`,
      groupMissingTitle: 'עדיין רק אתה',
      groupMissingMeta: 'הזמינו את החבורה עם לינק',
      invite: 'הזמינו',
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
    // The shelf's two groups (ADR-0116 §2). A header renders only when its group has
    // content, so a trip that never uses a target day looks exactly as it did.
    shelfForDay: 'לְיום הזה',
    shelfPool: 'רעיונות',
    // The empty day group, conjured up mid-drag so there is somewhere to drop.
    shelfDropHere: 'שחררו כאן ליום הזה',
    maybeShelf: 'מדף האולי',
    tapToSchedule: 'לחצו כדי לשבץ ליום',
    skippedTag: 'דילגתם · לחצו להחזרה',
    scheduleTitle: (title: string) => `שיבוץ · ${title}`,
    // Concurrency (ADR-0041): a cluster of partially-overlapping events, and the
    // "contains N" note on an envelope that nests shorter events inside it.
    concurrent: 'בו-זמנית',
    contains: (n: number) => `כולל ${n}`,
    // Now-line + derived phases (ADR-0043). The now-line label reuses common.now.
    nowLineAria: (time: string) => `השעה עכשיו · ${time}`,
    // Settle strip on a passed-but-unmarked soft event ("still on?" → one tap).
    settleAsk: 'היינו שם?',
    // Past-day archive (ADR-0029 signal / ADR-0040 language).
    archiveTag: 'לקריאה בלבד',
    pastBuildHint: 'הוספה או הזזה של אירוע ביום שעבר · במצב תכנון',
  },
  // Plan-mode Day-by-day — the itinerary builder (screens/PlanDay.tsx).
  planDay: {
    empty: 'היום ריק · הוסף אירוע או שבץ מהמדף',
    // A finished trip is a structural archive but stays settle-editable
    // (ADR-0044): the header note says so, since the ✓ / הסדרה is still live.
    pastNote: 'טיול שהסתיים · מבנה קפוא, אפשר להסדיר',
    pastEmpty: 'אין אירועים ביום זה',
    // The archive settle control (ADR-0044): tap ○ on an unresolved soft event
    // to record it — the "we were there / skip" the trip never got.
    settleTitle: (title: string) => `הסדרת «${title}»`,
    settleUnresolved: 'הסדר: היינו או דלג',
    addToDay: 'הוסף אירוע',
    // Reorder from the ⋯ sheet (ADR-0138 §8). One item, always present, opening a
    // step that shows WHERE the event lands — replacing the הקדם/אחר pair, which
    // was a blind one-slot swap that also came and went with the row's position.
    move: 'הזז',
    moveChoose: 'לאיזה מקום להזיז?',
    moveHere: 'כאן עכשיו',
    pinned: 'אירוע קשיח · מעוגן בזמן',
    rowActions: 'פעולות',
    gapFillTitle: (start: string, end: string) => `מילוי הפער · ${start}–${end}`,
    gapFillEmpty: 'אין רעיונות במדף · הוסף אירוע חדש',
    // Plan mode's shelf also drags (ADR-0116 §5): the hint teaches the hold, since
    // a press-and-hold is the one part of the gesture nobody guesses.
    shelfHint: 'לחצו כדי לשבץ · לחיצה ארוכה לגרירה',
    addIdea: 'הוסף רעיון למדף',
    addIdeaPlaceholder: 'רעיון חדש למדף…',
    removeIdea: 'הסר רעיון',
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
    gap: (label: string) => `פער של ${label} · שבץ`,
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
    // "הזז" resolve sheet: choose which soft event to move, then a clean slot.
    resolve: 'הזז',
    resolveTitle: 'פתרו את החפיפה',
    resolveChoose: 'בחרו איזה אירוע גמיש להזיז',
    resolveAnchor: 'עוגן · לא זז',
    resolveFor: (title: string) => `להזיז את ${title}`,
    resolveBack: 'אירוע אחר',
    resolveAfter: 'אחרי',
    resolveBefore: 'לפני',
    resolveOther: 'זמן אחר…',
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
    nextDay: 'מסתיים למחרת',
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
    restore: 'שחזר',
    // The done ✓ doubles as a one-tap undo (ADR-0043 revision) — its accessible
    // name / tooltip.
    undoDone: 'בטל סימון · שחזר',
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
    // densities. Both halves are records of what happened, not instructions: the skip
    // side reuses `event.skipped` ('דילגנו'), because the pair `היינו` / `דלג` mixed a
    // record with an imperative and read as "yes, or move it along".
    wasThere: 'היינו',
    // What the undo takes back, said as what it undoes rather than a bare "בטל".
    undoSettle: 'ביטול הסימון',
    // The row-menu / action-row verb, which IS an instruction ("skip this one") — not the
    // settle pair's other half.
    skip: 'דלג',
    swap: 'החלף',
    scheduleToDay: 'שבץ ליום',
    scheduled: 'שובץ',
    newEvent: 'אירוע חדש',
    edit: 'ערוך',
    delete: 'מחק',
    more: 'פעולות',
  },
  toast: {
    markedDone: 'סומן כבוצע',
    removed: 'הוסר מהיום',
    restored: 'האירוע חזר למקום',
    swapPrompt: 'נבחר להחלפה · בוחרים תחליף מהמדף',
    hardDelayed: 'נדחה · צריך לעדכן גם את ההזמנה',
    softDelayed: (minutes: number) => `נדחה ב-${minutes} דקות`,
    softEarlier: (minutes: number) => `הוקדם ב-${minutes} דקות`,
    onWayShared: 'שותף לקבוצה · בדרך',
    scheduled: (title: string, time: string) => `${title} שובץ ל-${time}`,
    rippleApplied: 'האירועים הבאים נדחו',
    eventMoved: 'האירוע הוזז',
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
    reordered: 'הסדר עודכן',
    scheduledDay: (title: string) => `${title} נוסף ליום`,
    maybeAdded: 'הרעיון נוסף למדף',
    // Re-aiming an idea between the shelf's two groups (ADR-0116 §2) — a pencil
    // mark, so the copy deliberately doesn't say "שובץ" (that's a schedule).
    maybeAimedAtDay: 'הרעיון סומן ליום הזה',
    maybeBackToPool: 'הרעיון חזר לרעיונות',
    maybeRemoved: 'הרעיון הוסר מהמדף',
    movedToShelf: 'הועבר למדף האולי',
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
    hardEditBody: 'מחובר להזמנה אמיתית - שינוי כאן מחייב עדכון שלה. ממשיכים?',
    hardDeleteTitle: 'למחוק אירוע קשיח?',
    hardDeleteBody: 'מחובר להזמנה אמיתית - המחיקה לא מבטלת את ההזמנה עצמה. ממשיכים?',
  },
  iconPicker: {
    open: 'בחר סמל',
    title: 'בחירת סמל',
    all: 'הכול',
    searchPlaceholder: 'חפש סמל או מדינה…',
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
    bookedDerived: (type: string) => `האירוע יירשם גם כהזמנה · ${type}, ואפשר להשלים אותה אחר כך`,
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
    addTime: 'הוסף שעה',
    addEnd: 'הוסף סיום',
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
    title: 'מקום',
    // Under an empty location field, in BOTH authoring forms — one key, because an
    // event and a booking lose exactly the same five things. Entities saved happily
    // with no location and then nothing anywhere said so; it cost a false bug report
    // (a two-night hotel "missing from the map" was a hotel with no place). The save
    // is NOT gated: a confirm on absence, on a non-destructive action, on a
    // legitimate mid-planning path would be clicked through (ADR-0109 §6's anti-nag
    // reasoning). So the note names what is lost and gets out of the way.
    noLocationHint:
      'בלי מיקום אין סימון במפה ואין שורה ברשימה, אין ניווט, אין מרחק ואין דירוג, והשעות ייקראו באזור הזמן של הקטע בטיול ולא של המקום עצמו.',
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
  // The "when" standard (WhenField). Shared span-endpoint copy for the tap-to-open
  // time field, the derived duration read-out, and the crosses-a-day marker.
  whenField: {
    dateCap: 'תאריך',
    timeCap: 'שעה',
    addTime: 'הוסף שעה',
    exactTime: 'שעה מדויקת',
    durationPrefix: 'משך:',
    crossesDay: 'חוצה יממה',
  },
  // Trip settings (ADR-0039): admin-governed. Mode-neutral chrome.
  settings: {
    title: 'הגדרות הטיול',
    back: 'חזרה לטיול',
    details: 'פרטי הטיול',
    edit: 'עריכה',
    save: 'שמור',
    cancel: 'ביטול',
    nameLabel: 'שם הטיול',
    destinationLabel: 'יעד',
    iconLabel: 'סמל',
    datesLabel: 'תאריכים',
    dateFrom: 'מ־',
    dateTo: 'עד',
    timezoneLabel: 'אזור זמן',
    budgetLabel: 'תקציב יומי לקבוצה',
    derivedHint: 'אזור-זמן ומטבע נערכים ידנית כרגע · בעתיד ייגזרו אוטומטית מהיעד',
    peerManaged: 'רק מנהל יכול לערוך את פרטי הטיול',
    party: 'חבורה',
    memberCount: (n: number) => `${n} משתתפים`,
    you: 'אתה',
    roleAdmin: 'מנהל',
    rolePeer: 'משתתף',
    memberActions: (name: string) => `פעולות על ${name}`,
    // The member surface's detail rows (ADR-0133 §9) — the joined date moved here
    // off the row, which only names who is present.
    member: {
      roleLabel: 'תפקיד',
      joinedLabel: 'הצטרף',
    },
    roster: 'חבורה',
    rosterOpen: (n: number) => `החבורה, ${n} נוסעים`,
    rosterFoot: 'הזמנה של אנשים חדשים והלינק לטיול נמצאים בהגדרות הטיול.',
    // The member surface closes rather than cancels: it is a detail card that may
    // carry actions, not a prompt you back out of.
    closeMember: 'סגירה',
    promote: 'הפוך למנהל',
    removeMember: 'הסר מהטיול',
    invite: 'הזמנת חברים',
    inviteGenerate: 'הצג לינק הזמנה',
    inviteHint: 'לינק אחד לטיול · פעיל עד סוף הטיול · שתפו בקבוצה',
    inviteCopied: 'הלינק הועתק · שתפו בקבוצה',
    inviteReset: 'אפס לינק',
    inviteResetHint: 'מבטל את הלינק הקודם ויוצר חדש · למנהל בלבד',
    inviteReset_done: 'נוצר לינק חדש · הקודם בוטל',
    removedTitle: 'הוסרו מהטיול',
    removedHint: 'לא יוכלו לחזור דרך הלינק · אפשר להחזיר אותם',
    allowBack: 'החזר לטיול',
    allowedBack: (name: string) => `${name} יכול לחזור דרך הלינק`,
    dangerZone: 'אזור רגיש',
    leave: 'עזוב את הטיול',
    leaveAction: 'עזוב',
    leaveHint: 'תוסר מרשימת המשתתפים · אפשר לחזור דרך לינק תקף',
    leaveConfirmTitle: 'לעזוב את הטיול?',
    leaveConfirmBody: (name: string) => `תוסר מ״${name}״. אפשר להצטרף מחדש דרך לינק הזמנה תקף.`,
    delete: 'מחק את הטיול לכולם',
    deleteAction: 'מחק',
    deleteHint: 'מחיקה זמינה למנהל בלבד · מוחקת את הטיול לכל המשתתפים',
    deleteConfirmTitle: 'למחוק את הטיול לכולם?',
    deleteConfirmBody: (name: string) => `״${name}״ יימחק לכל המשתתפים · אין דרך חזרה. ממשיכים?`,
    removeConfirmTitle: 'להסיר משתתף?',
    removeConfirmBody: (name: string) => `${name} יוסר מהטיול. תמיד אפשר להזמין מחדש.`,
    toast: {
      saved: 'הפרטים נשמרו',
      savedQueued: 'נשמר · יסונכרן כשנחזור לרשת',
      promoted: 'המשתתף קודם למנהל',
      promotedQueued: 'קודם למנהל · יסונכרן כשנחזור לרשת',
      removed: 'המשתתף הוסר',
      left: 'עזבת את הטיול',
      deleted: 'הטיול נמחק',
    },
  },
} as const;
