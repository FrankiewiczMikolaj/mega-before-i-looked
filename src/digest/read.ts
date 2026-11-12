import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

type Entry = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

type Aggregate = {
  row: DigestRow;
  firstAt: number;
  lastAt: number;
  errorAt: number;
};

function isEntry(value: unknown): value is Entry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.at === 'string'
    && Number.isFinite(Date.parse(entry.at))
    && typeof entry.job === 'string'
    && entry.job.length > 0
    && (entry.status === 'ok' || entry.status === 'retry' || entry.status === 'fail')
    && (typeof entry.owner === 'string' || entry.owner === null)
    && (entry.error === undefined || typeof entry.error === 'string');
}

/** Read and aggregate valid records; only a missing file means a missing night. */
export const readNight: ReadNight = (runsDir, night) => {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const jobs = new Map<string, Aggregate>();
  let badLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    if (!isEntry(entry)) {
      badLines++;
      continue;
    }

    const at = Date.parse(entry.at);
    const existing = jobs.get(entry.job);
    if (!existing) {
      jobs.set(entry.job, {
        row: {
          job: entry.job,
          owner: entry.owner,
          runs: 1,
          retries: entry.status === 'retry' ? 1 : 0,
          lastStatus: entry.status,
          lastError: entry.error ?? null,
          firstTime: entry.at,
          lastTime: entry.at,
        },
        firstAt: at,
        lastAt: at,
        errorAt: entry.error === undefined ? -Infinity : at,
      });
      continue;
    }

    const { row } = existing;
    row.runs++;
    if (entry.status === 'retry') row.retries++;
    if (at < existing.firstAt) {
      existing.firstAt = at;
      row.firstTime = entry.at;
    }
    // Equal timestamps use the later line, consistently for owner, status and error.
    if (at >= existing.lastAt) {
      existing.lastAt = at;
      row.lastTime = entry.at;
      row.lastStatus = entry.status;
      row.owner = entry.owner;
    }
    if (entry.error !== undefined && at >= existing.errorAt) {
      existing.errorAt = at;
      row.lastError = entry.error;
    }
  }

  return {
    rows: [...jobs.values()].map(({ row }) => row)
      .sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
    badLines,
  };
};
