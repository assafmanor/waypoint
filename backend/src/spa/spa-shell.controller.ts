import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { REVALIDATE } from '../common/static-cache';
import { applyPublicShareHeaders } from '../sharing/public-response-headers';
import { SharingService } from '../sharing/sharing.service';
import { TripsService } from '../trips/trips.service';
import { homeMeta, inviteMeta, liveMeta, type TripPreviewFacts } from './share-meta';
import { SpaShellService } from './spa-shell.service';

/**
 * **The three URLs people paste, answered with their own preview** (ADR-0220 §5).
 *
 * Not an API, which is why it is `@ApiExcludeController()` — and that is a statement about
 * what these routes are, not a way past `openapi-contract.spec.ts`. `SERVER_ROUTE_PREFIXES`
 * lists the paths the service worker must let reach the network; `/`, `/join/<code>` and
 * `/s/<code>` are **app routes**, and an installed user should keep being served the
 * precached shell for them. The server answers them only for the two readers that have no
 * worker: a cold navigation, and a link-preview crawler.
 *
 * That also bounds what this controller is worth. A person with the app installed never sees
 * these tags; the crawler is the whole audience.
 *
 * **The 20/min per-IP cap is the same one the JSON reads carry** and it is here for the
 * identical reason (B-10, ADR-0213 §5): an 8-character base58 code is the credential, and an
 * unthrottled HTML route that answers differently for a real code than a fake one is a
 * cheaper enumeration oracle than the API it sits beside. Which is also why an unknown code
 * falls through to the app's generic tags rather than a 404 — see `factsOr`.
 */
@ApiExcludeController()
@Controller()
@Public()
export class SpaShellController {
  constructor(
    private readonly shell: SpaShellService,
    private readonly trips: TripsService,
    private readonly sharing: SharingService,
  ) {}

  @Get()
  home(@Req() req: Request, @Res() res: Response): Promise<void> {
    return this.send(req, res, homeMeta(), { bearerLink: false });
  }

  @Get('join/:code')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async join(
    @Param('code') code: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const facts = await this.factsOr(() => this.invitePreview(code));
    return this.send(req, res, facts ? inviteMeta(code, facts) : homeMeta(), {
      bearerLink: true,
    });
  }

  @Get('s/:code')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async live(
    @Param('code') code: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const facts = await this.factsOr(() => this.sharing.previewByCode(code));
    return this.send(req, res, facts ? liveMeta(code, facts) : homeMeta(), { bearerLink: true });
  }

  private async invitePreview(code: string): Promise<TripPreviewFacts> {
    const preview = await this.trips.getInvitePreview(code);
    return {
      name: preview.tripName,
      destination: preview.destination,
      startDate: preview.startDate,
      endDate: preview.endDate,
      travellers: preview.memberCount,
    };
  }

  /**
   * **A code that does not resolve gets the app's own tags, never an error.**
   *
   * Three reasons, and the third is the one that would be missed. A 404 here would be an
   * existence oracle the JSON routes deliberately refuse to be (a missing, revoked, rotated
   * and blocked code are one indistinguishable answer). An expired invite throws 410, and a
   * person who was sent a stale link should still land on the join screen and read _why_ —
   * the screen says it, and a 404 shell would replace that with nothing. And the app shell is
   * the same document either way: this only decides which `<meta>` tags ride along, so
   * failing the page over a preview would be the tail wagging the dog.
   */
  private async factsOr(
    resolve: () => Promise<TripPreviewFacts>,
  ): Promise<TripPreviewFacts | null> {
    try {
      return await resolve();
    } catch {
      return null;
    }
  }

  private async send(
    req: Request,
    res: Response,
    meta: Parameters<SpaShellService['render']>[0],
    { bearerLink }: { bearerLink: boolean },
  ): Promise<void> {
    const html = this.shell.render(meta, this.shell.origin(req.headers));
    if (!html) {
      // No built PWA (dev/test, ADR-0020). Nothing here can serve the app, and inventing a
      // body would hide a broken deploy — the global filter's JSON 404 is the honest answer.
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }
    if (bearerLink) {
      // `no-store` + `no-referrer` + `noindex` (ADR-0213 §5). The invite shell needs all
      // three for the first time now that it carries the trip's name: before ADR-0220 it was
      // a content-free document at a secret URL, and it is now the trip's name at one.
      applyPublicShareHeaders(res);
    } else {
      // The shell names the current build's hashed chunks and a deploy deletes the previous
      // ones, so it is never cached past a revalidation (`static-cache.ts`).
      res.setHeader('Cache-Control', REVALIDATE);
    }
    res.type('html').send(html);
  }
}
