// **The document-type picker, written once** — the upload sheet and the manage sheet's
// edit step show the same one, and a second copy of an eight-card grid is how two modes
// start disagreeing about what a type picker is (`BookingSheet`'s `typeGrid`, same
// reasoning). Options and their order come from the shared table (ADR-0052 §6); three
// columns because eight cards in one row is the booking picker's answer too.
import { DOCUMENT_TYPE, type DocumentType } from '@waypoint/shared';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { DOCUMENT_TYPE_ICON } from '../constants';
import { t } from '../i18n/he';

const TYPE_OPTIONS = Object.values(DOCUMENT_TYPE).map((ty) => ({
  value: ty,
  icon: DOCUMENT_TYPE_ICON[ty],
  label: t.docs.type[ty],
}));

export function DocumentTypeGrid({
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
    <ChoiceGrid
      options={TYPE_OPTIONS}
      value={value}
      onChange={onChange}
      columns={3}
      disabled={disabled}
      ariaLabel={t.docs.upload.typeLabel}
    />
  );
}
