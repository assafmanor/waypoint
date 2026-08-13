// **The document-type picker, written once** — the upload sheet and the manage sheet's
// edit step show the same one, and a second copy of an eight-option picker is how two modes
// start disagreeing about what a type picker is (`BookingSheet`'s `typeGrid`, same
// reasoning). Options and their order come from the shared table (ADR-0052 §6).
//
// **It is a pill ROW, not a card grid, and that is not a size tweak.** Eight cards at
// `columns={3}` are three rows — 202px measured — which pushed the upload sheet's body to
// 652px against the 488px its own `80vh` cap allows, so the form opened with 140px to scroll
// before `העלה` and the file field, the one thing the form cannot be saved without, sat below
// the fold (owner: _"it looks ugly and is hard to use"_ — which turned out to be arithmetic).
// The row is 38px.
//
// Nothing here is new: `CategoryField` has put **nine** `EventCategory` options in exactly
// this row since ADR-0109 §11, and `ChoiceGrid`'s own doc comment names the reason ("too many
// options for a fixed grid on a narrow phone"). This is that mechanism's third host, so the
// whole picker is one `layout="pills"` inside the `.category-pills` density wrapper and no CSS
// of its own. Two things arrive with it for free: the selected pill centres itself
// (`useCenterSelected`), which is what makes the manage sheet open ON the document's current
// type rather than three rows down, and the row's Hebrew labels are SHORTER than the nine
// event categories already carried this way (713px of scroll against 806px).
import { DOCUMENT_TYPE, type DocumentType } from '@waypoint/shared';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { DOCUMENT_TYPE_ICON } from '../constants';
import { t } from '../i18n/he';

const TYPE_OPTIONS = Object.values(DOCUMENT_TYPE).map((ty) => ({
  value: ty,
  icon: DOCUMENT_TYPE_ICON[ty],
  label: t.docs.type[ty],
}));

export function DocumentTypePills({
  value,
  onChange,
  disabled,
}: {
  /** `undefined` = nothing chosen yet, which is how the upload form opens. */
  value?: DocumentType;
  onChange: (type: DocumentType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="category-pills">
      <ChoiceGrid
        layout="pills"
        options={TYPE_OPTIONS}
        value={value}
        onChange={onChange}
        disabled={disabled}
        ariaLabel={t.docs.upload.typeLabel}
      />
    </div>
  );
}
