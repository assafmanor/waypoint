import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const paneCss = readFileSync(
  fileURLToPath(new URL('../ui/domain/map-pane.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

describe('map stacking', () => {
  it('contains renderer marker z-indexes inside the pane stacking context', () => {
    const paneRule = paneCss.match(/\.map-pane\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(paneRule).toMatch(/\bisolation\s*:\s*isolate\s*;/);
  });
});
