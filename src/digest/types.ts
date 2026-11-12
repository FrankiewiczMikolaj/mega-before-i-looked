export type DigestStatus = 'ok' | 'retry' | 'fail';

/** One row per job for a single night. */
export type DigestRow = {
  job: string;
  owner: string | null;
  /** Total valid log entries for this job, including retries. */
  runs: number;
  /** Number of entries with status retry. */
  retries: number;
  lastStatus: DigestStatus;
  /** Most recent recorded error, or null if none was recorded. */
  lastError: string | null;
  /** Earliest and latest at values; preserve their original offsets. */
  firstTime: string;
  lastTime: string;
};

export type NightDigest = {
  /** Sorted by job; HTML and JSON consumers must use the same order. */
  rows: DigestRow[];
  /** Malformed lines are counted and skipped, not fatal to the night. */
  badLines: number;
};

/**
 * Contract for readNight(runsDir, night), implemented by the reader task.
 * Reads runsDir/<night>.jsonl synchronously, matching rig's existing readers.
 * Returns null only when the night file does not exist (routes return 404).
 * An empty file returns { rows: [], badLines: 0 }, not null.
 * Other I/O failures propagate rather than masquerading as missing nights.
 * This module exports types only; it provides no runtime reader or stub.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
