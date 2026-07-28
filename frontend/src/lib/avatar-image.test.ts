import { describe, expect, it } from 'vitest';
import { AVATAR_IMAGE_EDGE_PX } from '@waypoint/shared';
import { squareCrop } from './avatar-image';

describe('squareCrop', () => {
  it('takes the whole frame when the source is already square', () => {
    expect(squareCrop(1000, 1000)).toEqual({
      sx: 0,
      sy: 0,
      size: 1000,
      edge: AVATAR_IMAGE_EDGE_PX,
    });
  });

  it('centres the crop on a landscape source', () => {
    // 1600×900: the square is 900 wide, so 350 comes off each side.
    const { sx, sy, size } = squareCrop(1600, 900);
    expect({ sx, sy, size }).toEqual({ sx: 350, sy: 0, size: 900 });
  });

  it('centres the crop on a portrait source — a face sits nearer the middle than the top', () => {
    const { sx, sy, size } = squareCrop(900, 1600);
    expect({ sx, sy, size }).toEqual({ sx: 0, sy: 350, size: 900 });
  });

  it('downscales a large photo to the target edge', () => {
    expect(squareCrop(4032, 3024).edge).toBe(AVATAR_IMAGE_EDGE_PX);
  });

  it('never UPSCALES a small picture — a bigger blur is not an improvement', () => {
    const { size, edge } = squareCrop(64, 90);
    expect(size).toBe(64);
    expect(edge).toBe(64);
  });

  it('rounds the offset on an odd difference, so the rect stays integral', () => {
    const { sx, size } = squareCrop(101, 100);
    expect(size).toBe(100);
    expect(Number.isInteger(sx)).toBe(true);
  });
});
