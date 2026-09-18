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

  // …and again inside the canvas, or the pane's own furniture loses to a pin. The rule above
  // only protects the pane's SIBLINGS; the camera cluster, the area readout and the OSM
  // attribution are its children, so without this a marker's z-index still out-paints them.
  it('contains them inside the canvas too, where the furniture is a sibling', () => {
    const canvasRule = paneCss.match(/\.map-canvas\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(canvasRule).toMatch(/\bisolation\s*:\s*isolate\s*;/);
  });
});
