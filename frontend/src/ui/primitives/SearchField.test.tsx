// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SearchField } from './SearchField';

describe('SearchField', () => {
  afterEach(() => cleanup());

  it('reports what was typed', () => {
    const onChange = vi.fn();
    render(<SearchField value="" onChange={onChange} clearLabel="נקה חיפוש" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ראמן' } });
    expect(onChange).toHaveBeenCalledWith('ראמן');
  });

  // The clear button is the affordance, so it must not be there when there is
  // nothing to clear — an always-on `✕` reads as "there is a filter on".
  it('offers a clear only once there is something to clear', () => {
    const { rerender } = render(
      <SearchField value="" onChange={() => {}} clearLabel="נקה חיפוש" />,
    );
    expect(screen.queryByRole('button', { name: 'נקה חיפוש' })).toBeNull();
    rerender(<SearchField value="ר" onChange={() => {}} clearLabel="נקה חיפוש" />);
    expect(screen.getByRole('button', { name: 'נקה חיפוש' })).toBeTruthy();
  });

  it('clears to empty rather than to undefined', () => {
    const onChange = vi.fn();
    render(<SearchField value="ראמן" onChange={onChange} clearLabel="נקה חיפוש" />);
    fireEvent.click(screen.getByRole('button', { name: 'נקה חיפוש' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  // Placement belongs to the host — SearchOverlay pins it under the chrome bar,
  // the gap sheet sits it above a list — so the class has to reach the element.
  it('takes the host’s placement class alongside its own', () => {
    const { container } = render(
      <SearchField
        value=""
        onChange={() => {}}
        clearLabel="נקה"
        className="gapfill-search"
        placeholder="חיפוש ברעיונות"
      />,
    );
    expect(container.querySelector('.wp-searchfield.gapfill-search')).toBeTruthy();
    expect(screen.getByPlaceholderText('חיפוש ברעיונות')).toBeTruthy();
  });
});
