// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { resetWarmImages, warmImages, warmedImages } from './image-warm';
import { WARM_IMAGE_LIMIT } from '../constants';

describe('warmImages', () => {
  afterEach(() => resetWarmImages());

  it('holds one picture per URL however often it is asked for', () => {
    warmImages(['/a.jpg', '/b.jpg']);
    warmImages(['/a.jpg']);
    expect(warmedImages()).toEqual(['/b.jpg', '/a.jpg']);
  });

  it('lets go of the least recently asked for past the limit', () => {
    const urls = Array.from({ length: WARM_IMAGE_LIMIT + 1 }, (_, i) => `/${i}.jpg`);
    warmImages(urls.slice(0, 1));
    warmImages(urls.slice(1, WARM_IMAGE_LIMIT));
    // Asked for again, so the next eviction takes `/1.jpg` instead.
    warmImages(['/0.jpg']);
    warmImages(urls.slice(WARM_IMAGE_LIMIT));
    expect(warmedImages()).toHaveLength(WARM_IMAGE_LIMIT);
    expect(warmedImages()).toContain('/0.jpg');
    expect(warmedImages()).not.toContain('/1.jpg');
  });
});
