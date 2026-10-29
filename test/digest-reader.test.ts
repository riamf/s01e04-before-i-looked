import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const fixtureDir = fileURLToPath(new URL('../runs/', import.meta.url));
const event = (overrides: Record<string, unknown> = {}) => ({
  at: '2026-10-29T01:00:00+01:00',
  job: 'lane/sync',
  status: 'ok',
  owner: 'rook',
  ...overrides,
});

describe('readNight', () => {
  let runsDir: string;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-reader-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  function writeEvents(events: unknown[], separator = '\n') {
    writeFileSync(join(runsDir, `${night}.jsonl`), events.map((value) => JSON.stringify(value)).join(separator));
  }

  it('reads the original fixture: five sorted jobs, one bad line, and event totals', () => {
    const digest = readNight(fixtureDir, night);
    expect(digest).not.toBeNull();
    expect(digest?.night).toBe(night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows).toEqual([
      {
        job: 'digest/render', owner: null, runs: 1, retries: 0, failures: 0,
        lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, failures: 0,
        lastStatus: 'ok', lastError: 'upstream 503',
        firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, failures: 0,
        lastStatus: 'ok', lastError: 'lock held',
        firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, failures: 1,
        lastStatus: 'fail', lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, failures: 0,
        lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
      },
    ]);
  });

  it('retains historical failures and the latest nonempty error after recovery', () => {
    writeEvents([
      event({ status: 'fail', error: 'first failure' }),
      event({ status: 'fail', error: 'latest failure' }),
      event(),
      event({ error: null }),
      event({ error: '' }),
    ]);
    const digest = readNight(runsDir, night);
    expect(digest?.rows[0]).toMatchObject({
      runs: 5, retries: 0, failures: 2, lastStatus: 'ok', lastError: 'latest failure',
    });
    expect(digest?.counts).toEqual({ ok: 3, retry: 0, fail: 2 });
  });

  it('uses file order for first/last events and preserves different offsets and fractions', () => {
    const firstAt = '2026-10-29T23:00:00.123456+05:30';
    const lastAt = '2026-10-28T01:00:00-07:00';
    writeEvents([
      event({ at: firstAt, status: 'fail', error: 'failed', owner: 'first' }),
      event({ at: lastAt, owner: 'last' }),
      event({ at: lastAt, status: 'retry', error: 'last error', owner: null }),
    ]);
    expect(readNight(runsDir, night)?.rows[0]).toEqual({
      job: 'lane/sync', owner: null, runs: 3, retries: 1, failures: 1,
      lastStatus: 'retry', lastError: 'last error', firstAt, lastAt,
    });
  });

  it('normalizes missing owner/error to null and accepts Z and extra fields', () => {
    writeEvents([event({ at: '2026-10-29T01:00:00Z', owner: undefined, extra: true })]);
    expect(readNight(runsDir, night)?.rows[0]).toMatchObject({
      owner: null, lastError: null, firstAt: '2026-10-29T01:00:00Z',
    });
  });

  it('uses the last owner even when it is absent', () => {
    writeEvents([event(), event({ owner: undefined })]);
    expect(readNight(runsDir, night)?.rows[0].owner).toBeNull();
  });

  it('sorts exact job identifiers by code-unit order, safely including object property names', () => {
    const jobs = ['a', 'ä', 'Z', '__proto__', 'constructor', 'A'];
    writeEvents(jobs.map((job) => event({ job })));
    expect(readNight(runsDir, night)?.rows.map((row) => row.job))
      .toEqual(['A', 'Z', '__proto__', 'a', 'constructor', 'ä']);
  });

  it.each(['', ' \r\n\t\n\r\n'])('returns an empty digest for an empty/blank file (%j)', (contents) => {
    writeFileSync(join(runsDir, `${night}.jsonl`), contents);
    expect(readNight(runsDir, night)).toEqual({
      night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns a digest rather than null when every nonblank line is bad', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '{bad\nnull\n\n');
    expect(readNight(runsDir, night)).toEqual({
      night, rows: [], badLines: 2, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('continues past malformed JSON and schema with CRLF and blank lines', () => {
    const lines = [
      JSON.stringify(event({ status: 'retry' })),
      '{"job":',
      JSON.stringify(event({ status: 'unknown' })),
      ' \t',
      JSON.stringify(event()),
      '',
    ];
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\r\n'));
    expect(readNight(runsDir, night)).toMatchObject({
      badLines: 2, counts: { ok: 1, retry: 1, fail: 0 },
      rows: [{ job: 'lane/sync', runs: 2, retries: 1, lastStatus: 'ok' }],
    });
  });

  it.each([
    null, [], 'text', 1,
    event({ job: undefined }), event({ job: '' }), event({ job: 1 }),
    event({ status: undefined }), event({ status: 'unknown' }),
    event({ at: undefined }), event({ at: 1 }), event({ at: 'not a timestamp' }),
    event({ at: '2026-10-29' }), event({ at: '2026-10-29T01:00:00' }),
    event({ at: '2026-02-29T01:00:00Z' }), event({ at: '1900-02-29T01:00:00Z' }),
    event({ at: '2026-04-31T01:00:00Z' }), event({ at: '2026-00-29T01:00:00Z' }),
    event({ at: '2026-13-29T01:00:00Z' }), event({ at: '2026-10-00T01:00:00Z' }),
    event({ at: '2026-10-29T24:00:01Z' }), event({ at: '2026-10-29T01:60:00Z' }),
    event({ at: '2026-10-29T01:00:60Z' }), event({ at: '2026-10-29T01:00:00+24:00' }),
    event({ at: '2026-10-29T01:00:00+01:60' }), event({ at: '2026-10-29T01:00:00Z\n' }),
    event({ owner: false }), event({ owner: {} }),
    event({ error: 1 }), event({ error: [] }),
  ])('counts an invalid event once and keeps reading (%j)', (invalid) => {
    writeEvents([invalid, event()]);
    const digest = readNight(runsDir, night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.rows[0].runs).toBe(1);
  });

  it.each(['2024-02-29T01:00:00Z', '2000-02-29T01:00:00Z'])('accepts leap dates (%s)', (at) => {
    writeEvents([event({ at })]);
    expect(readNight(runsDir, night)?.rows[0].firstAt).toBe(at);
  });

  it('returns null for a missing file, missing runs directory, or non-directory path', () => {
    expect(readNight(runsDir, night)).toBeNull();
    expect(readNight(join(runsDir, 'missing'), night)).toBeNull();
    writeFileSync(join(runsDir, 'file'), 'not a directory');
    expect(readNight(join(runsDir, 'file'), night)).toBeNull();
  });

  it.each([
    '', '../2026-10-28', '../../2026-10-28', '/2026-10-28', '2026-10-28/extra',
    '..\\2026-10-28', '2026-10-28.jsonl', '2026-1-28', '2026-10-28\n',
    '2026-10-28\0', '%2e%2e%2f2026-10-28',
  ])('rejects invalid night names before filesystem access (%j)', (invalidNight) => {
    expect(readNight('\0', invalidNight)).toBeNull();
  });

  it('checks night filename shape without imposing calendar validation', () => {
    const unusualNight = '2026-99-99';
    writeFileSync(join(runsDir, `${unusualNight}.jsonl`), '');
    expect(readNight(runsDir, unusualNight)?.night).toBe(unusualNight);
  });

  it('propagates filesystem errors other than missing paths', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow();
  });
});
