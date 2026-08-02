// @vitest-environment jsdom
// The form-level refusal slot (ADR-0150). Two things are the whole contract: it is silent
// when nothing is wrong, and when something is, it is an `alert` — a form-level message
// focuses nothing and scrolls nothing, so the live region is the only thing telling a
// screen reader the save did not happen.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FormError } from './FormError';

describe('FormError', () => {
  afterEach(cleanup);

  it('renders nothing when there is nothing wrong, so no call site guards it', () => {
    const { container } = render(<FormError>{null}</FormError>);
    expect(container.innerHTML).toBe('');
  });

  it('announces the refusal', () => {
    render(<FormError>{'השמירה נכשלה'}</FormError>);
    expect(screen.getByRole('alert').textContent).toBe('השמירה נכשלה');
  });
});
