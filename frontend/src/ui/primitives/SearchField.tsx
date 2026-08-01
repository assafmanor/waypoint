// The app's one search input: a pill with a magnifier, a field, and a `✕` that
// appears once there is something to clear.
//
// It was `.search-overlay-field`, private to `SearchOverlay` (ADR-0101). ADR-0116's
// session-202 amendment gave the gap sheet a search past a threshold, and copying
// the markup there would have been the second copy — which is how ADR-0120's filter
// apparatus got duplicated the first time. So it is a primitive now, and the
// overlay is its first consumer rather than its owner (root rule 8).
//
// Layout is the HOST's, not this component's: `SearchOverlay` pins it under the
// chrome bar, the gap sheet sits it above a list. Hence `className` and no margin
// of its own.
import { useRef, type Ref } from 'react';
import './search-field.css';
import { Icon } from '../Icon';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name for the clear button. */
  clearLabel: string;
  /** The host's placement (margins, flex behaviour). */
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function SearchField({
  value,
  onChange,
  placeholder,
  clearLabel,
  className,
  inputRef,
}: SearchFieldProps) {
  const fallbackRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? fallbackRef;
  return (
    <div className={'wp-searchfield' + (className ? ` ${className}` : '')}>
      <Icon name="search" />
      <input
        ref={ref}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="clear"
          aria-label={clearLabel}
          onClick={() => onChange('')}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
