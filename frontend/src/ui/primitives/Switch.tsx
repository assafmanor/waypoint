// **A boolean.** The app had none — `grep -r 'role="switch"' src` returned nothing before
// this, and every `aria-checked` in the tree belonged to `ChoiceGrid`'s radiogroup.
//
// Which is why this is new infrastructure and not a duplicate (root rule 8 / ADR-0096): the
// notifications settings surface brings **four** booleans at once, and the mockup measured
// the alternatives against exactly those four
// (`mockups/notifications-in-settings-v1.html` §3):
//
//   · this `Switch`                          293px
//   · a two-option `ChoiceGrid` per row      373px  (+80px, and it reads as a form field)
//   · a `.set-edit` text verb                341px  (+48px once ADR-0017's floor is honoured;
//                                                   as shipped it measures 25px, so it only
//                                                   looked cheaper by being illegal)
//
// It is shaped so the next boolean is one line rather than another copy: label-less, sized by
// tokens, and taking nothing but the state and the change.
import './switch.css';

export function Switch({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The switch has no text of its own — a settings row's `.lab` is beside it, not inside
   *  it — so it is named here or it is unnamed to a screen reader. */
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className="wp-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      {/* Decorative: the button carries the state in `aria-checked`, so the thumb is paint. */}
      <span className="wp-switch-thumb" aria-hidden="true" />
    </button>
  );
}
