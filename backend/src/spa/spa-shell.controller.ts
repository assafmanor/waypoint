import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { REVALIDATE } from '../common/static-cache';
import { applyPublicShareHeaders } from '../sharing/public-response-headers';
import { SharingService } from '../sharing/sharing.service';
import { TripsService } from '../trips/trips.service';
import type { CoverKind } from './og-cover.template';
import { OgImageService } from './og-image.service';
import {
  homeMeta,
  inviteMeta,
  liveMeta,
  OG_COVER_PREFIX,
  type TripPreviewFacts,
} from './share-meta';
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
    private readonly covers: OgImageService,
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

  /**
   * **The picture the two shells above point `og:image` at** (ADR-0220's 2026-09-06
   * amendment). Same code, same throttle, same resolution as the shell — the cover simply
   * draws the facts the tags describe.
   *
   * An unresolvable code gets the generic cover rather than a 404, for `factsOr`'s reason:
   * the shell it accompanies already fell back to the app's own tags, and a 404 here would
   * be the existence oracle both routes exist to refuse.
   */
  @Get(`${OG_COVER_PREFIX.invite}/:code`)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  inviteCover(@Param('code') code: string, @Res() res: Response): Promise<void> {
    return this.sendCover('invite', code, () => this.invitePreview(stripPng(code)), res);
  }

  @Get(`${OG_COVER_PREFIX.live}/:code`)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  liveCover(@Param('code') code: string, @Res() res: Response): Promise<void> {
    return this.sendCover('live', code, () => this.sharing.previewByCode(stripPng(code)), res);
  }

  private async sendCover(
    kind: CoverKind,
    code: string,
    resolve: () => Promise<TripPreviewFacts>,
    res: Response,
  ): Promise<void> {
    const facts = await this.factsOr(resolve);
    const png = facts ? await this.covers.render(kind, facts) : await this.covers.generic(kind);
    if (!png) {
      // No built PWA to read the fallback from (dev/test, ADR-0020) — the same honest 404
      // the shell route gives, rather than an empty body a crawler would cache as an image.
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }
    // The path carries a bearer code and the picture now names the trip, so it takes the
    // same three headers the shell does (ADR-0213 §5).
    applyPublicShareHeaders(res);
    res.type('png').send(png);
  }

  private async invitePreview(code: string): Promise<TripPreviewFacts> {
    const preview = await this.trips.getInvitePreview(code);
    return {
      name: preview.tripName,
      destination: preview.destination,
      startDate: preview.startDate,
      endDate: preview.endDate,
      travellers: preview.memberCount,
      icon: preview.icon,
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

/** `.png` is decoration on the cover URL (`share-meta.ts`), so the code is what is left when
 *  it is taken off. Written here rather than as a route pattern because Express's `:code.png`
 *  is a path-to-regexp subtlety, and a URL that silently matched nothing would be a broken
 *  image in every chat card. */
function stripPng(code: string): string {
  return code.endsWith('.png') ? code.slice(0, -4) : code;
}
