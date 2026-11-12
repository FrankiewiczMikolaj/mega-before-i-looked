import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, NightDigest, ReadNight } from '../src/digest/types.js';

const row = (overrides: Partial<DigestRow> = {}): DigestRow => ({
  job: 'alpha', owner: null, runs: 4, retries: 3, lastStatus: 'fail',
  lastError: null, firstTime: '2026-10-28T21:00:00+02:00',
  lastTime: '2026-10-29T05:00:00+02:00', ...overrides,
});

// These are page tests against the shared reader contract, not a JSONL reader.
describe('digest HTML page', () => {
  let runsDir: string;
  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-page-'));
    vi.stubEnv('LANE_MARKER', 'TEST-DIGEST-MARKER');
  });
  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  function app(digest: NightDigest | null) {
    const readNight = vi.fn<ReadNight>(() => digest);
    const config = { adapter: 'shim', installed: 'test', beatEverySeconds: 60, runsDir };
    return { app: createApp(config, readNight), readNight, config };
  }

  it('renders a self-contained, sorted table with missing values and warnings', async () => {
    const digest = { rows: [row({ job: 'zeta', retries: 2, lastStatus: 'retry' }), row()], badLines: 1 };
    const { app: page, readNight } = app(digest);
    const res = await page.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(readNight).toHaveBeenCalledWith(runsDir, '2026-10-28');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('TEST-DIGEST-MARKER');
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<script|<link/);
    expect(html.match(/<table>/g)).toHaveLength(1);
    expect(html.indexOf('>alpha<')).toBeLessThan(html.indexOf('>zeta<'));
    expect(digest.rows[0].job).toBe('zeta');
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('<td class="warn"><strong>3</strong></td>');
    expect(html).toContain('<td class="warn"><strong>fail</strong></td>');
    expect(html).toContain('<td>2</td>');
    expect(html).toContain('malformed lines skipped: 1');
    expect(html).toContain('2026-10-28T21:00:00+02:00');
    expect(html).toContain('2026-10-29T05:00:00+02:00');
  });

  it('marks retries above the threshold and escapes log text', async () => {
    const { app: page } = app({ rows: [row({ job: '<script>bad</script>', owner: '<owner>', retries: 4, lastError: '<error>' })], badLines: 0 });
    const html = await (await page.request('/digest/2026-10-28')).text();
    expect(html).toContain('<strong>4</strong>');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).toContain('&lt;owner&gt;');
    expect(html).toContain('&lt;error&gt;');
    expect(html).not.toContain('<script>');
  });

  it('returns 404 for a missing night, with the usual layout', async () => {
    const { app: page } = app(null);
    const res = await page.request('/digest/missing');
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('night not found');
    expect(html).toContain('TEST-DIGEST-MARKER');
    expect(html).not.toContain('nothing ran');
  });

  it('renders nothing ran for an empty night', async () => {
    const { app: page } = app({ rows: [], badLines: 0 });
    const res = await page.request('/digest/empty');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });

  it('uses the real reader by default and returns 404 for a missing file', async () => {
    const { config } = app(null);
    const res = await createApp(config).request('/digest/2026-10-28');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('night not found');
  });
});
