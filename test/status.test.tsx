import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

let runsDir: string;
const config = () => ({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

describe('status board', () => {
  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-board-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('links every night to its digest, newest first, with the lane banner', async () => {
    vi.stubEnv('LANE_MARKER', 'TEST-MARKER');
    writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), 'not json\n');
    writeFileSync(join(runsDir, 'notes.txt'), '');
    const res = await createApp(config()).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html.indexOf('/digest/2026-10-28')).toBeLessThan(html.indexOf('/digest/2026-10-27'));
    expect(html).not.toContain('notes.txt');
  });

  it('counts each job once by final status, including retry then success', async () => {
    const entries = [
      { at: '2026-10-28T01:00:00+01:00', job: 'recovered', owner: null, status: 'retry' },
      { at: '2026-10-28T02:00:00+01:00', job: 'recovered', owner: null, status: 'ok' },
      { at: '2026-10-28T02:00:00+01:00', job: 'pending', owner: null, status: 'retry' },
      { at: '2026-10-28T02:00:00+01:00', job: 'broken', owner: null, status: 'fail' },
    ];
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), entries.map((entry) => JSON.stringify(entry)).join('\n'));
    writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');
    const app = createApp(config());
    const response = await app.request('/');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('ok 1 / retry 1 / fail 1');
    expect(html).toContain('ok 0 / retry 0 / fail 0');
    // The links are real destinations, not just correctly formatted anchors.
    for (const night of ['2026-10-28', '2026-10-27']) {
      expect((await app.request(`/digest/${night}`)).status).toBe(200);
    }
  });

  it('shows the empty state without digest links when no nights exist', async () => {
    const res = await createApp(config()).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing in runs/');
    expect(html).not.toContain('href="/digest/');
  });

  it('shows the empty state when the runs directory is missing', async () => {
    const missing = join(runsDir, 'missing');
    const res = await createApp({ ...config(), runsDir: missing }).request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing in runs/');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config()).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
