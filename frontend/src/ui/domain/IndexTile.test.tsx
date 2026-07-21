// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { IndexTile } from './IndexTile';

describe('IndexTile', () => {
  afterEach(() => cleanup());

  it('renders the title, count, and subtitle, and opens on tap', () => {
    const onOpen = vi.fn();
    render(
      <IndexTile
        icon="🎫"
        title="הזמנות"
        count={17}
        subtitle="הבא: Ichiran Ramen"
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText('הזמנות')).toBeTruthy();
    expect(screen.getByText('17')).toBeTruthy();
    expect(screen.getByText('הבא: Ichiran Ramen')).toBeTruthy();
    screen.getByRole('button').click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
