import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createDigestJsonRoutes } from '../src/digest/json.js';
import type { DigestRow, NightDigest, ReadNight } from '../src/digest/types.js';

const rows: DigestRow[] = [
  {
    job: 'alpha', owner: null, runs: 4, retries: 3, lastStatus: 'fail',
    lastError: 'unavailable', firstTime: '2026-10-28T01:00:00+02:00',
    lastTime: '2026-10-28T02:00:00+02:00',
  },
  {
    job: 'zeta', owner: 'reader', runs: 1, retries: 0, lastStatus: 'ok',
    lastError: null, firstTime: '2026-10-28T03:00:00+02:00',
    lastTime: '2026-10-28T03:00:00+02:00',
  },
];

function setup(digest: NightDigest | null) {
  const readNight = vi.fn<ReadNight>(() => digest);
  const app = new Hono();
  app.route('/', createDigestJsonRoutes('/injected-fixtures', readNight));
  return { app, readNight };
}

describe('digest JSON adapter', () => {
  it('returns shared rows in reader order without changing values', async () => {
    const digest = { rows, badLines: 0 };
    const { app, readNight } = setup(digest);
    const response = await app.request('/api/digest/2026-10-28');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual(digest);
    expect(readNight).toHaveBeenCalledExactlyOnceWith('/injected-fixtures', '2026-10-28');
    expect(digest.rows).toBe(rows);
  });

  it('returns 404 only for a missing night', async () => {
    const { app } = setup(null);
    expect((await app.request('/api/digest/missing')).status).toBe(404);
  });

  it('returns an empty night as a successful digest', async () => {
    const digest = { rows: [], badLines: 0 };
    const { app } = setup(digest);
    const response = await app.request('/api/digest/empty');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(digest);
  });

  it('preserves malformed-line counts and surviving rows', async () => {
    const digest = { rows, badLines: 2 };
    const { app } = setup(digest);
    const response = await app.request('/api/digest/malformed');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(digest);
  });

  it('does not disguise reader I/O failures as missing nights', async () => {
    const readNight: ReadNight = () => { throw new Error('I/O failure'); };
    const app = createDigestJsonRoutes('/injected-fixtures', readNight);
    app.onError((_error, c) => c.text('Internal Server Error', 500));
    expect((await app.request('/api/digest/unreadable')).status).toBe(500);
  });
});
