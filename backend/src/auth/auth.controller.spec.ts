import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

function fakeRes() {
  return { cookie: vi.fn(), clearCookie: vi.fn(), redirect: vi.fn() };
}

describe('AuthController.googleCallback', () => {
  it('redirects home (not a 401) when Google reports error=access_denied', async () => {
    const controller = new AuthController({} as AuthService);
    const res = fakeRes();

    await controller.googleCallback(
      undefined as unknown as string,
      'some-state',
      'access_denied',
      { headers: {} },
      res,
    );

    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^https?:\/\//));
    expect(res.clearCookie).toHaveBeenCalledWith('wp_oauth', { path: '/auth' });
  });

  it('redirects home instead of throwing on state mismatch', async () => {
    const controller = new AuthController({} as AuthService);
    const res = fakeRes();
    const req = {
      headers: {
        cookie:
          'wp_oauth=' +
          encodeURIComponent(JSON.stringify({ state: 'expected', codeVerifier: 'v' })),
      },
    };

    await controller.googleCallback(
      'some-code',
      'wrong-state',
      undefined as unknown as string,
      req,
      res,
    );

    expect(res.redirect).toHaveBeenCalled();
  });
});
