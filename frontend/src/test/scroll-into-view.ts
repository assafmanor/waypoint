// **jsdom has no scrolling at all**, and `Element.prototype.scrollIntoView` is simply absent —
// so any surface that brings something into view on mount throws before it renders. The day's
// "land on now" is one (ADR-0159's now-line), and `test/pointer-events.ts` beside this file is
// the same shape for the same reason: a platform gap the suite states rather than works around.
//
// Deliberately a no-op and not a recorder: where the AIM matters it is measured in a browser
// (`frontend/CLAUDE.md` — jsdom reports every rect as zero, so an assertion on where it scrolled
// to would be asserting zero).
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
