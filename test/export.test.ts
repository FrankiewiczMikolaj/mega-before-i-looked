import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportPreview } from '../src/export.js';

let outputDir: string | undefined;
afterEach(() => {
  vi.unstubAllEnvs();
  if (outputDir) rmSync(outputDir, { recursive: true, force: true });
});

describe('preview export', () => {
  it.each([['TEST-EXPORT-MARKER', true], ['', false]])(
    'exports the template digest and safely reports banner presence',
    async (marker, markerSet) => {
      vi.stubEnv('LANE_MARKER', marker);
      mkdirSync('.cache/export-tests', { recursive: true });
      outputDir = mkdtempSync('.cache/export-tests/preview-');
      const result = await exportPreview(outputDir);
      const html = readFileSync(join(outputDir, 'index.html'), 'utf8');
      expect(result.path).toBe(join(outputDir, 'index.html'));
      expect(result.bytes).toBe(Buffer.byteLength(html));
      expect(result.bannerPresent).toBe(true);
      expect(result.markerSet).toBe(markerSet);
      expect(result.templateSampleVerified).toBe(true);
      expect(html).toContain('digest · 2026-10-28');
      expect(html.match(/<th scope="row">/g)).toHaveLength(5);
      expect(html).toContain('<style>');
      expect(html).not.toMatch(/<script\b|<link\b|\s(?:src|href)\s*=/i);
      if (markerSet) expect(JSON.stringify(result)).not.toContain(marker);
      else expect(html).toContain('no marker set');
    },
  );
});
