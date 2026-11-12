import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const night = '2026-10-28';
let dir: string;

beforeEach(() => {
  const root = join(process.cwd(), '.cache', 'reader-tests');
  mkdirSync(root, { recursive: true });
  dir = mkdtempSync(join(root, 'night-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fixture(lines: unknown[]) {
  writeFileSync(join(dir, `${night}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'));
}

function entry(job: string, status: 'ok' | 'retry' | 'fail' = 'ok', at = '2026-10-28T01:00:00+01:00') {
  return { at, job, status, owner: 'rook' };
}

describe('readNight', () => {
  it('distinguishes missing, empty and whitespace-only files', () => {
    expect(readNight(dir, night)).toBeNull();
    fixture([]);
    expect(readNight(dir, night)).toEqual({ rows: [], badLines: 0 });
    writeFileSync(join(dir, `${night}.jsonl`), ' \r\n\t\n');
    expect(readNight(dir, night)).toEqual({ rows: [], badLines: 0 });
  });

  it('aggregates five sorted jobs and counts one broken JSON line', () => {
    const file = join(dir, `${night}.jsonl`);
    // A final unterminated record must also be read.
    writeFileSync(file, [
      ...[
        entry('zebra'), entry('bravo', 'retry'),
        { ...entry('alpha'), owner: null }, entry('delta', 'fail'), entry('charlie'),
        { ...entry('bravo', 'retry', '2026-10-28T02:00:00+01:00'), error: 'timeout' },
      ].map((line) => JSON.stringify(line)),
      '{broken', JSON.stringify(entry('bravo', 'ok', '2026-10-28T03:00:00+01:00')),
    ].join('\r\n'));
    const result = readNight(dir, night)!;
    expect(result.badLines).toBe(1);
    expect(result.rows.map((row) => row.job)).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'zebra']);
    expect(result.rows[0]).toMatchObject({ owner: null, runs: 1, retries: 0, lastError: null });
    expect(result.rows[1]).toEqual({
      job: 'bravo', owner: 'rook', runs: 3, retries: 2, lastStatus: 'ok', lastError: 'timeout',
      firstTime: '2026-10-28T01:00:00+01:00', lastTime: '2026-10-28T03:00:00+01:00',
    });
    expect(result.rows[3].lastStatus).toBe('fail');
  });

  it('uses chronological instants, not line order or offset string order', () => {
    fixture([
      { ...entry('job', 'fail', '2026-10-28T02:00:00+01:00'), owner: null, error: 'latest' },
      { ...entry('job', 'retry', '2026-10-28T03:00:00+03:00'), error: 'earlier' },
      entry('job', 'ok', '2026-10-28T01:30:00+01:00'),
    ]);
    expect(readNight(dir, night)?.rows).toEqual([{
      job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'fail', lastError: 'latest',
      firstTime: '2026-10-28T03:00:00+03:00', lastTime: '2026-10-28T02:00:00+01:00',
    }]);
  });

  it('breaks timestamp ties by later line and preserves an empty recorded error', () => {
    fixture([
      { ...entry('job', 'fail'), error: 'first' },
      { ...entry('job', 'retry'), owner: null, error: '' },
    ]);
    expect(readNight(dir, night)?.rows[0]).toMatchObject({
      owner: null, runs: 2, retries: 1, lastStatus: 'retry', lastError: '',
    });
  });

  it('counts invalid shapes as malformed without losing subsequent valid records', () => {
    fixture([
      null, [], 4, 'text', {},
      { ...entry('job'), at: 'not-a-time' },
      { ...entry('job'), job: 12 }, { ...entry('job'), job: '' },
      { ...entry('job'), status: 'unknown' },
      { ...entry('job'), owner: undefined }, { ...entry('job'), owner: 7 },
      { ...entry('job'), error: 7 }, entry('kept'),
    ]);
    expect(readNight(dir, night)).toMatchObject({ badLines: 12, rows: [{ job: 'kept', runs: 1 }] });
  });

  it('returns an empty digest, not a missing night, when every record is malformed', () => {
    writeFileSync(join(dir, `${night}.jsonl`), '{broken\nnull\n');
    expect(readNight(dir, night)).toEqual({ rows: [], badLines: 2 });
  });

  it('propagates non-ENOENT I/O errors', () => {
    mkdirSync(join(dir, `${night}.jsonl`));
    expect(() => readNight(dir, night)).toThrow();
  });
});
