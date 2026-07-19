import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Rate limiting (backend-review B-10): the public invite-preview endpoint is an
// HMAC oracle, so it carries a tight per-IP cap (20/min). This boots the real app
// and hammers it to prove the cap trips with a 429 + Retry-After.
describe('rate limiting (B-10)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('429s the invite-preview endpoint past the per-IP cap, with Retry-After', async () => {
    const url = `${baseUrl}/invites/some-token`;
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < 25; i++) {
      const res = await fetch(url);
      statuses.push(res.status);
      if (res.status === 429) retryAfter ??= res.headers.get('retry-after');
    }

    // The first calls pass the throttle (404 — bad token), then it trips to 429.
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(retryAfter).not.toBeNull();
  });
});
