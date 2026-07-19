// Hebrew UI copy — the active locale. All user-facing strings live here so logic
// stays language-agnostic (conventions.md). Interpolated copy is a function;
// runs that must render left-to-right (times, codes) stay as JSX in the caller.
import { formatDaysUntil } from '../lib/time';

export const t = {
  common: {
    undo: 'בטל',
    yes: 'כן',
    no: 'לא',
    now: 'עכשיו',
    loading: 'טוען',
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
  // Visible directional arrows render as SVGs (ui/NavArrow, ui/Icon) so they
  // centre cleanly — the Assistant body font has no arrow glyphs and the
  // fallback sits low. This one stays textual: it's only used to build the
  // screen-reader label for a transport route (origin → destination), never
  // shown, so an SVG would add nothing.
  arrows: {
    route: '←',
  },
  tabs: {
    home: 'בית',
    map: 'מפה',
    index: 'אינדקס',
    days: 'יום-יום',
  },
  header: {
    dayOf: (day: number, total: number) => `יום ${day} מתוך ${total}`,
    // Plan mode, pre-trip: the header leads with the countdown to departure
    // instead of "day X of Y" (mockups/plan-mode-v1.html).
    leavingIn: (phrase: string) => `יוצאים בעוד ${phrase}`,
    pendingSync: (count: number) => `${count} שינויים מחכים לסנכרון`,
    offlineNow: 'אופליין · נתונים שמורים',
    // A queued write that the server rejected on flush (F-03) — real data loss if
    // left silent. Tapping the badge dismisses it.
    syncFailed: (count: number) =>
      count === 1 ? 'שינוי אחד לא נשמר · הקישו לסגירה' : `${count} שינויים לא נשמרו · הקישו לסגירה`,
    // Day-scope context ribbon under the strip when viewing a non-today day in
    // Trip mode (ADR-0043 / ADR-0029), plus the one-tap way back to today.
    pastDay: 'יום שהיה · היסטוריה',
    futureDay: 'יום עתידי · תצוגה מקדימה',
    backToToday: 'חזרה להיום',
  },
  placeholder: {
    comingSoon: 'המסך הזה עוד בעבודה.',
  },
  index: {
    bookingsTitle: 'הזמנות',
    offlineBadge: 'עובד אופליין',
    pastHead: 'כבר מאחוריכם',
    unlinked: 'לא משובצת במסלול',
    today: 'היום',
    dayN: (n: number) => `יום ${n}`,
    bookingType: {
      flight: 'טיסה',
      hotel: 'לינה',
      restaurant: 'מסעדה',
      train: 'רכבת',
      activity: 'פעילות',
      other: 'אחר',
    },
    emptyTitle: 'האינדקס עוד ריק',
    emptyBody: 'כרטיסי טיסה, מלונות והזמנות אחרים יופיעו כאן, ידנית או מיובאים אוטומטית מ-Gmail',
    toast: {
      saved: 'ההזמנה נשמרה',
      savedQueued: 'יישמר כשנחזור לרשת',
      deleted: 'ההזמנה נמחקה',
    },
    // Read-only booking detail view (ADR-0053): tap a booking → facts + a visible
    // edit button + a "⋯" menu (edit / delete).
    detail: {
      edit: 'עריכה',
      actions: 'פעולות',
      delete: 'מחיקה',
      timing: 'מתי',
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
      add: '＋ הוסף הזמנה',
      createTitle: 'הזמנה חדשה',
      originLabel: 'מוצא 📍',
      destLabel: 'יעד 📍',
      routeHint: 'שמות המקומות מזינים את המפה בהמשך',
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
      kindHard: '🔒 קשיח',
      kindSoft: 'גמיש',
      titleRequired: 'צריך שם להזמנה',
      // Transport is identified by its route, not a name (ADR-0059 §3): the route
      // endpoints are the title row (short placeholders), and a route is required.
      originShort: 'מוצא',
      destShort: 'יעד',
      routeRequired: 'צריך מוצא או יעד',
      dateOutOfRange: 'התאריך מחוץ לטווח הטיול',
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
    add: '＋ הוסף מסמך',
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
      fileLabel: 'קובץ (תמונה או PDF)',
      fileRequired: 'צריך לבחור קובץ',
      titleLabel: 'שם',
      titlePlaceholder: 'למשל: דרכון · אסף',
      save: 'העלה',
      saving: 'מעלה…',
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
      edit: 'עריכה',
      delete: 'מחיקה',
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
      offlineNote: 'יצירת טיול צריכה חיבור · לינק שחבר שולח ייפתח גם עכשיו',
      note: 'אזור זמן ומטבע מסתדרים לפי היעד · תקציב אפשר להוסיף אחר כך',
    },
    created: {
      modePill: '✏️ מצב תכנון',
      emoji: '🎉',
      title: 'יש טיול!',
      sub: 'עכשיו הכי חשוב - להכניס את החבורה.',
      inviteLabel: 'לינק הזמנה · הקש להעתקה ושיתוף',
      invitePending: 'טוען לינק הזמנה…',
      inviteFailed: 'הלינק יהיה מוכן בהגדרות הטיול',
      inviteCopied: 'הלינק הועתק · שתף בקבוצת הוואטסאפ',
      teach: 'שולחים בקבוצה, וכל אחד מצטרף עם החשבון שלו - זה הכול.',
      planButton: 'לתכנון הטיול',
      laterButton: 'אשלח את הלינק אחר כך',
      laterToast: 'הלינק מחכה בהגדרות הטיול',
    },
    join: {
      loading: 'טוען הזמנה…',
      invalid: 'הלינק הזה כבר לא בתוקף. אפשר לבקש מהחבר שישלח לינק חדש.',
      expired: 'הטיול הזה כבר הסתיים · הלינק כבר לא פעיל.',
      offline: 'צריך חיבור לרשת כדי לטעון את ההזמנה',
      heroTitle: 'הוזמנת לטיול!',
      heroBody: 'החברים כבר בפנים - נשארה רק ההצטרפות שלך.',
      ticketBadge: 'כרטיס הזמנה',
      countdownPrefix: 'בעוד',
      members: (count: number) => (count === 1 ? 'חבר אחד כבר בפנים' : `${count} חברים כבר בפנים`),
      membersSub: 'מחכים רק לך',
      joinButton: 'הצטרפות לטיול',
      joinError: 'ההצטרפות נכשלה · אפשר לנסות שוב',
      joinBlocked: 'הוסרת מהטיול הזה · אפשר לבקש ממנהל הטיול להוסיף אותך מחדש.',
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
      chipSoon: (days: number) => `בעוד ${formatDaysUntil(days)}`,
      chipPast: 'הסתיים',
      create: 'טיול חדש',
      offlineNote: 'מעבר בין טיולים שמורים עובד גם אופליין · יצירה צריכה חיבור',
    },
    account: {
      title: 'החשבון שלי',
      provider: 'מחובר עם Google',
      signOut: 'התנתקות',
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
    wifiCode: 'קוד WiFi',
    documents: 'מסמכים',
    docsInvite: 'הוסיפו מסמך',
    wifiCopied: 'קוד ה-WiFi הועתק ללוח',
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
      departIn: 'היציאה בעוד',
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
    maybeShelf: 'מדף האולי',
    tapToSchedule: 'הקשה משבצת ליום',
    skippedTag: 'דילגת · הקש להחזרה',
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
    moveEarlier: 'הקדם',
    moveLater: 'אחר',
    drag: 'גרור לסידור',
    pinned: 'אירוע קשיח · מעוגן בזמן',
    toShelf: 'העבר למדף',
    rowActions: 'פעולות',
    gapFillTitle: (start: string, end: string) => `מילוי הפער · ${start}–${end}`,
    gapFillEmpty: 'אין רעיונות במדף · הוסף אירוע חדש',
    addIdea: 'הוסף רעיון למדף',
    addIdeaPlaceholder: 'רעיון חדש למדף…',
    removeIdea: 'הסר רעיון',
    gap: (label: string) => `פער של ${label} · ＋ שבץ`,
    gapMinutes: (n: number) => `${n} דק׳`,
    gapHour: 'שעה',
    gapTwoHours: 'שעתיים',
    gapHours: (n: number) => `${n} שעות`,
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
    conflictWarn: (title: string, time: string) => `חופף ל-${title} (קשיח) · ${time}`,
  },
  actions: {
    restore: 'שחזר',
    // The done ✓ doubles as a one-tap undo (ADR-0043 revision) — its accessible
    // name / tooltip.
    undoDone: 'בטל סימון · שחזר',
    navigate: 'ניווט',
    delayBy: (minutes: number) => `דחה ${minutes} דק׳`,
    earlierBy: (minutes: number) => `הקדם ${minutes} דק׳`,
    stepMinutes: (minutes: number) => `${minutes} דק׳`,
    onWay: 'בדרך',
    done: 'סיימנו',
    // Affirmative settle on a passed event — the "we did this" record (ADR-0043).
    wasThere: 'היינו',
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
    openingNav: 'פותח ניווט',
    scheduled: (title: string, time: string) => `${title} שובץ ל-${time}`,
    rippleApplied: 'האירועים הבאים נדחו',
    eventMoved: 'האירוע הוזז',
    hardConfirmRequired: 'שינוי אירוע קשיח מחייב אישור',
    writeFailed: 'משהו השתבש · אפשר לנסות שוב',
    moveIntoPast: 'אי אפשר לשבץ אירוע לשעה שכבר עברה',
    moveCrossesDay: 'העברה ליום אחר נעשית במצב תכנון',
    eventCreated: 'האירוע נוסף',
    eventUpdated: 'האירוע עודכן',
    eventDeleted: 'האירוע נמחק',
    reordered: 'הסדר עודכן',
    scheduledDay: (title: string) => `${title} נוסף ליום`,
    maybeAdded: 'הרעיון נוסף למדף',
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
    hardEditTitle: 'לשנות אירוע קשיח?',
    hardEditBody: (title: string) =>
      `${title} מחובר להזמנה אמיתית - שינוי כאן מחייב עדכון שלה. ממשיכים?`,
    hardDeleteTitle: 'למחוק אירוע קשיח?',
    hardDeleteBody: (title: string) =>
      `${title} מחובר להזמנה אמיתית - המחיקה לא מבטלת את ההזמנה עצמה. ממשיכים?`,
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
    kindLabel: 'סוג',
    kindHard: '🔒 קשיח',
    kindSoft: 'גמיש',
    save: 'שמירה',
    cancel: 'ביטול',
    titleRequired: 'חסרה כותרת',
    dateRequired: 'חסר תאריך',
    dateOutOfRange: 'התאריך מחוץ לטווח הטיול',
    endBeforeStart: 'שעת הסיום צריכה להיות אחרי ההתחלה',
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
