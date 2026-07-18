import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { DocumentsController } from './documents.controller';
import type { DocumentsService } from './documents.service';

// B-03: the /content route must force a download (never inline-render caller
// bytes with a caller-declared type) — Content-Disposition: attachment plus
// X-Content-Type-Options: nosniff. A stubbed service + a header-capturing
// Response isolates the controller's header contract.
describe('DocumentsController.getContent headers', () => {
  function fakeRes(): Response & { headers: Record<string, string>; body?: Buffer } {
    const res = {
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
        return this;
      },
      send(body: Buffer) {
        this.body = body;
        return this;
      },
    };
    return res as unknown as Response & { headers: Record<string, string>; body?: Buffer };
  }

  it('sends attachment + nosniff, with a Unicode-safe filename', async () => {
    const buffer = Buffer.from('pdf-bytes');
    const documents = {
      getContent: vi.fn().mockResolvedValue({
        buffer,
        mimeType: 'application/pdf',
        title: 'דרכון של אסף', // Hebrew title → filename* path
      }),
    } as unknown as DocumentsService;
    const controller = new DocumentsController(documents);
    const res = fakeRes();

    await controller.getContent('trip-1', 'doc-1', res);

    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Content-Disposition']).toContain('attachment');
    expect(res.headers['Content-Disposition']).toContain("filename*=UTF-8''");
    expect(res.body).toBe(buffer);
  });

  it('strips CR/LF and quotes from the ASCII filename fallback (no header injection)', async () => {
    const documents = {
      getContent: vi.fn().mockResolvedValue({
        buffer: Buffer.from('x'),
        mimeType: 'application/pdf',
        title: 'a"b\r\nSet-Cookie: evil',
      }),
    } as unknown as DocumentsService;
    const controller = new DocumentsController(documents);
    const res = fakeRes();

    await controller.getContent('trip-1', 'doc-1', res);

    const disposition = res.headers['Content-Disposition'];
    expect(disposition).not.toContain('\r');
    expect(disposition).not.toContain('\n');
    // The quote in the title must not escape the quoted ASCII filename.
    expect(disposition).toContain('attachment; filename="a_b');
  });
});
