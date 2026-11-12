import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';
import type { DigestRow } from '../src/digest/types.js';

// Integration prerequisites: reader (#2), injected HTML route (#3), JSON factory (#4).
// No mock reader: both endpoints must interpret the same on-disk JSONL records.
const cacheDir = fileURLToPath(new URL('../.cache/', import.meta.url));
const night = '2026-10-28';
const firstTime = '2026-10-28T01:00:00+01:00';
const lastTime = '2026-10-28T01:04:00+01:00';
const expectedRows: DigestRow[] = [
  {
    job: 'alpha', owner: null, runs: 1, retries: 0,
    lastStatus: 'ok', lastError: null, firstTime, lastTime: firstTime,
  },
  {
    job: 'zeta', owner: 'night crew', runs: 4, retries: 3,
    lastStatus: 'fail', lastError: 'still unavailable', firstTime, lastTime,
  },
];

// Deliberately not job-sorted; repeated entries must become one aggregate row.
const records = [
  { at: firstTime, job: 'zeta', owner: 'night crew', status: 'retry', error: 'unavailable' },
  { at: firstTime, job: 'alpha', owner: null, status: 'ok' },
  { at: '2026-10-28T01:01:00+01:00', job: 'zeta', owner: 'night crew', status: 'retry' },
  { at: '2026-10-28T01:02:00+01:00', job: 'zeta', owner: 'night crew', status: 'retry' },
  { at: lastTime, job: 'zeta', owner: 'night crew', status: 'fail', error: 'still unavailable' },
].map((record) => JSON.stringify(record));

// Read only table body cells, not arbitrary text elsewhere in the layout.
// Fixtures contain no HTML entities; placeholders are literal em dashes.
function tableRows(html: string): string[][] {
  const body = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)]
      .map((cell) => cell[1].replace(/<[^>]*>/g, '').trim()),
  );
}

function displayedRows(rows: DigestRow[]): string[][] {
  return rows.map((row) => [
    row.job, row.owner ?? '—', String(row.runs), String(row.retries),
    row.lastStatus, row.lastError ?? '—', row.firstTime, row.lastTime,
  ]);
}

describe('digest routes with the real reader', () => {
  let runsDir: string;

  beforeEach(() => {
    mkdirSync(cacheDir, { recursive: true });
    runsDir = mkdtempSync(join(cacheDir, 'digest-routes-'));
  });

  afterEach(() => {
    if (runsDir) rmSync(runsDir, { recursive: true, force: true });
  });

  function app() {
    const config = {
      adapter: 'shim', installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60, runsDir,
    };
    return createApp(config, readNight);
  }

  function writeNight(lines: string[]) {
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n'), 'utf8');
  }

  it('returns 200 and the same ordered job values in HTML and JSON', async () => {
    writeNight(records);
    const routes = app();
    const htmlResponse = await routes.request(`/digest/${night}`);
    const jsonResponse = await routes.request(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.headers.get('content-type')).toContain('text/html');
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-type')).toContain('application/json');
    const digest: unknown = await jsonResponse.json();
    expect(digest).toEqual({ rows: expectedRows, badLines: 0 });
    const html = await htmlResponse.text();
    const cells = tableRows(html);
    expect(cells).toEqual(displayedRows(expectedRows));
    // Compare against the actual JSON response as well as the independent fixture oracle.
    expect(digest).toHaveProperty('rows');
    const jsonRows = (digest as { rows: DigestRow[] }).rows;
    expect(cells).toEqual(displayedRows(jsonRows));
  });

  it.each(['/digest', '/api/digest'])('returns 404 at %s for a night with no file', async (endpoint) => {
    const response = await app().request(`${endpoint}/${night}`);
    expect(response.status).toBe(404);
  });

  it('distinguishes an empty night from a missing night at both endpoints', async () => {
    writeNight([]);
    const routes = app();
    const htmlResponse = await routes.request(`/digest/${night}`);
    const jsonResponse = await routes.request(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(200);
    const html = await htmlResponse.text();
    expect(html).toContain('nothing ran');
    expect(tableRows(html)).toEqual([]);
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({ rows: [], badLines: 0 });
  });

  it('skips and counts a malformed line without losing rows before or after it', async () => {
    writeNight([records[0], '{not valid json', ...records.slice(1)]);
    const routes = app();
    const htmlResponse = await routes.request(`/digest/${night}`);
    const jsonResponse = await routes.request(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(200);
    const html = await htmlResponse.text();
    expect(tableRows(html)).toEqual(displayedRows(expectedRows));
    expect(html).toContain('malformed lines skipped: 1');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({ rows: expectedRows, badLines: 1 });
  });
});
