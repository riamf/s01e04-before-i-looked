import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

function isTimestamp(value: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts || parts[0] !== value) return false;

  const [, yearText, monthText, dayText, hour, minute, second, offsetHour, offsetMinute] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60
    && (offsetHour === undefined || (Number(offsetHour) < 24 && Number(offsetMinute) < 60));
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.at !== 'string' || !isTimestamp(data.at)
    || typeof data.job !== 'string' || data.job.length === 0
    || (data.status !== 'ok' && data.status !== 'retry' && data.status !== 'fail')) {
    return null;
  }

  const owner = data.owner ?? null;
  const error = data.error ?? null;
  if ((owner !== null && typeof owner !== 'string')
    || (error !== null && typeof error !== 'string')) return null;

  return { at: data.at, job: data.job, status: data.status, owner, error };
}

/** Read and aggregate a night according to the shared ReadNight contract. */
export const readNight: ReadNight = (runsDir, night) => {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error
      && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return null;
    throw error;
  }

  const rows = new Map<string, DigestRow>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const line of contents.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const event = parseEvent(line);
    if (!event) {
      badLines += 1;
      continue;
    }

    counts[event.status] += 1;
    let row = rows.get(event.job);
    if (!row) {
      row = {
        job: event.job,
        owner: event.owner,
        runs: 0,
        retries: 0,
        failures: 0,
        lastStatus: event.status,
        lastError: null,
        firstAt: event.at,
        lastAt: event.at,
      };
      rows.set(event.job, row);
    }

    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    if (event.status === 'fail') row.failures += 1;
    row.owner = event.owner;
    row.lastStatus = event.status;
    row.lastAt = event.at;
    if (event.error !== null && event.error.length > 0) row.lastError = event.error;
  }

  return {
    night,
    rows: [...rows.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
    badLines,
    counts,
  };
};
