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

  // An installed PWA captures the callback navigation, so the browser and the app window
  // both redeem one single-use code and the loser gets `invalid_grant` from Google. The
  // winner has already set the refresh cookie in the jar they share, so the loser must land
  // home signed in rather than render a 500 over a login that worked.
  it('redirects home when the code is refused (a second redemption of one code)', async () => {
    const auth = {
      handleGoogleCallback: vi
        .fn()
        .mockRejectedValue(
          new Error('Google token exchange failed: 400 {"error":"invalid_grant"}'),
        ),
    } as unknown as AuthService;
    const controller = new AuthController(auth);
    const res = fakeRes();
    const req = {
      headers: {
        cookie:
          'wp_oauth=' + encodeURIComponent(JSON.stringify({ state: 'st', codeVerifier: 'v' })),
      },
    };

    await controller.googleCallback('spent-code', 'st', undefined as unknown as string, req, res);

    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^https?:\/\//));
    expect(res.clearCookie).toHaveBeenCalledWith('wp_oauth', { path: '/auth' });
    // And emphatically NOT a session: the winning request owns the refresh cookie.
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
