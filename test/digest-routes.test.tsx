import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Digest, DigestRow } from '../src/digest/types.js';

const REAL_RUNS = fileURLToPath(new URL('../runs', import.meta.url));

const configFor = (runsDir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

const MAIN_LINES = [
  '{"at":"2026-10-28T22:00:00+01:00","job":"sync-invoices","status":"ok","owner":"anna"}',
  '{"at":"2026-10-28T22:05:00+01:00","job":"Zeta-export","status":"fail","owner":null,"error":"timeout"}',
  '   ',
  '{"at":"2026-10-28T22:10:00+01:00","job":"sync-invoices","status":"retry","owner":"anna","error":"429"}',
  '{oops',
  '{"at":"2026-10-28T22:15:00+01:00","job":"sync-invoices","status":"retry","owner":"anna","error":"429"}',
  '{"at":"2026-10-28T22:20:00+01:00","job":"sync-invoices","status":"retry","owner":"anna","error":""}',
  '{"at":"2026-10-28T22:25:00+01:00","job":"sync-invoices","status":"ok","owner":"anna"}',
  '{"at":"2026-10-28T22:30:00+01:00","job":"alpha-report","status":"fail","owner":"bo","error":"500"}',
  '{"at":"2026-10-28T22:30:00+01:00","job":"alpha-report","status":"ok","owner":null}',
  '{"at":"2026-10-28T22:35:00+01:00","job":"Zeta-export","status":"ok"}',
  '{"at":"2026-10-28T23:00:00+01:00","job":"quiet-job","status":"ok","owner":"cy","error":null}',
  '{"at":"2026-10-28T23:01:00+01:00","job":"bad-owner","status":"ok","owner":7}',
  '{"at":"2026-10-28T23:02:00","job":"no-offset","status":"ok"}',
  '{"at":"2026-10-28T23:03:00Z","job":"","status":"ok"}',
  '{"at":"2026-10-28T23:04:00Z","job":"done-status","status":"done"}',
];

const MAIN_ROWS: DigestRow[] = [
  {
    job: 'Zeta-export',
    owner: null,
    runs: 2,
    retries: 0,
    failures: 1,
    lastStatus: 'ok',
    lastError: 'timeout',
    firstAt: '2026-10-28T22:05:00+01:00',
    lastAt: '2026-10-28T22:35:00+01:00',
  },
  {
    job: 'alpha-report',
    owner: null,
    runs: 2,
    retries: 0,
    failures: 1,
    lastStatus: 'ok',
    lastError: '500',
    firstAt: '2026-10-28T22:30:00+01:00',
    lastAt: '2026-10-28T22:30:00+01:00',
  },
  {
    job: 'quiet-job',
    owner: 'cy',
    runs: 1,
    retries: 0,
    failures: 0,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-28T23:00:00+01:00',
    lastAt: '2026-10-28T23:00:00+01:00',
  },
  {
    job: 'sync-invoices',
    owner: 'anna',
    runs: 5,
    retries: 3,
    failures: 0,
    lastStatus: 'ok',
    lastError: '429',
    firstAt: '2026-10-28T22:00:00+01:00',
    lastAt: '2026-10-28T22:25:00+01:00',
  },
];

const MAIN_DIGEST: Digest = {
  night: '2026-10-28',
  rows: MAIN_ROWS,
  badLines: 5,
  counts: { ok: 5, retry: 3, fail: 2 },
};

const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const bodyRows = (html: string): string[] =>
  (html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? []).filter((row) => /<td\b/.test(row));

const rowFor = (html: string, job: string): string => {
  const row = bodyRows(html).find((candidate) => text(candidate).includes(job));
  if (row === undefined) throw new Error(`no table row for job ${job}`);
  return row;
};

describe('digest routes', () => {
  let dirs: string[] = [];

  const newRunsDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    dirs.push(dir);
    return dir;
  };

  const writeNight = (dir: string, night: string, content: string): void => {
    writeFileSync(join(dir, `${night}.jsonl`), content, 'utf8');
  };

  beforeEach(() => {
    dirs = [];
  });

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs = [];
  });

  describe('page GET /digest/:night', () => {
    it('renders the night with 200 and one table row per job', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', `${MAIN_LINES.join('\n')}\n`);
      const res = await createApp(configFor(dir)).request('/digest/2026-10-28');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(bodyRows(html)).toHaveLength(MAIN_ROWS.length);
    });

    it('lists jobs in the same order as the JSON route', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', `${MAIN_LINES.join('\n')}\n`);
      const app = createApp(configFor(dir));
      const html = await (await app.request('/digest/2026-10-28')).text();
      const digest = (await (await app.request('/api/digest/2026-10-28')).json()) as Digest;
      const positions = digest.rows.map((row) => html.indexOf(row.job));
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    it('shows owner null as an em dash, not an empty cell', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', `${MAIN_LINES.join('\n')}\n`);
      const html = await (await createApp(configFor(dir)).request('/digest/2026-10-28')).text();
      expect(text(rowFor(html, 'Zeta-export'))).toContain('—');
      expect(text(rowFor(html, 'alpha-report'))).toContain('—');
    });

    it('returns 404 when the night has no file', async () => {
      const dir = newRunsDir();
      const res = await createApp(configFor(dir)).request('/digest/2026-01-01');
      expect(res.status).toBe(404);
    });

    it('returns 404 for a night stem that is not YYYY-MM-DD', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', `${MAIN_LINES.join('\n')}\n`);
      const res = await createApp(configFor(dir)).request('/digest/not-a-night');
      expect(res.status).toBe(404);
    });

    it('says "nothing ran" for an empty file', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', '');
      const res = await createApp(configFor(dir)).request('/digest/2026-10-28');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(text(html)).toMatch(/nothing ran/i);
    });

    it('says "nothing ran" for a whitespace-only file', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', '  \n\t\n   \n');
      const res = await createApp(configFor(dir)).request('/digest/2026-10-28');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(text(html)).toMatch(/nothing ran/i);
    });

    it('renders 200 for a file with only bad lines and shows the bad count', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', '{oops\nnot json\n');
      const res = await createApp(configFor(dir)).request('/digest/2026-10-28');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(text(html)).toMatch(/\b2\b[^a-z]{0,3}(?:\w+\s+){0,3}(?:bad|invalid|rejected|skipped)/i);
    });

    it('exposes the bad line count next to a bad-line label', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', `${MAIN_LINES.join('\n')}\n`);
      const html = await (await createApp(configFor(dir)).request('/digest/2026-10-28')).text();
      expect(text(html)).toMatch(/\b5\b[^a-z]{0,3}(?:\w+\s+){0,3}(?:bad|invalid|rejected|skipped)/i);
    });

    it('still renders valid rows alongside malformed and schema-invalid lines', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', `${MAIN_LINES.join('\n')}\n`);
      const html = await (await createApp(configFor(dir)).request('/digest/2026-10-28')).text();
      for (const row of MAIN_ROWS) expect(html).toContain(row.job);
      expect(html).not.toContain('bad-owner');
      expect(html).not.toContain('done-status');
    });

    it('flags a recovered failure and a retry count of 3 or more', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', `${MAIN_LINES.join('\n')}\n`);
      const html = await (await createApp(configFor(dir)).request('/digest/2026-10-28')).text();
      expect(rowFor(html, 'sync-invoices')).toMatch(/warn/i);
      expect(rowFor(html, 'Zeta-export')).toMatch(/warn/i);
      expect(rowFor(html, 'alpha-report')).toMatch(/warn/i);
      expect(rowFor(html, 'quiet-job')).not.toMatch(/warn/i);
    });

    it('does not flag a job with two retries and no failures', async () => {
      const dir = newRunsDir();
      writeNight(
        dir,
        '2026-10-28',
        [
          '{"at":"2026-10-28T22:00:00+01:00","job":"two-retries","status":"retry","owner":"dee"}',
          '{"at":"2026-10-28T22:01:00+01:00","job":"two-retries","status":"retry","owner":"dee"}',
          '{"at":"2026-10-28T22:02:00+01:00","job":"two-retries","status":"ok","owner":"dee"}',
          '{"at":"2026-10-28T22:03:00+01:00","job":"three-retries","status":"retry","owner":"dee"}',
          '{"at":"2026-10-28T22:04:00+01:00","job":"three-retries","status":"retry","owner":"dee"}',
          '{"at":"2026-10-28T22:05:00+01:00","job":"three-retries","status":"retry","owner":"dee"}',
          '{"at":"2026-10-28T22:06:00+01:00","job":"three-retries","status":"ok","owner":"dee"}',
          '',
        ].join('\n'),
      );
      const html = await (await createApp(configFor(dir)).request('/digest/2026-10-28')).text();
      expect(rowFor(html, 'two-retries')).not.toMatch(/warn/i);
      expect(rowFor(html, 'three-retries')).toMatch(/warn/i);
    });

    it('escapes owner, error, and job text', async () => {
      const dir = newRunsDir();
      writeNight(
        dir,
        '2026-10-28',
        [
          '{"at":"2026-10-28T22:00:00+01:00","job":"job<b>1","status":"fail","owner":"<script>alert(1)</script>","error":"a & \\"b\\""}',
          '',
        ].join('\n'),
      );
      const html = await (await createApp(configFor(dir)).request('/digest/2026-10-28')).text();
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<b>1');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('job&lt;b&gt;1');
      expect(html).toContain('&amp;');
    });

    it('accepts CRLF line endings with the same rows as LF', async () => {
      const lf = newRunsDir();
      const crlf = newRunsDir();
      writeNight(lf, '2026-10-28', `${MAIN_LINES.join('\n')}\n`);
      writeNight(crlf, '2026-10-28', `${MAIN_LINES.join('\r\n')}\r\n`);
      const lfHtml = await (await createApp(configFor(lf)).request('/digest/2026-10-28')).text();
      const crlfHtml = await (await createApp(configFor(crlf)).request('/digest/2026-10-28')).text();
      expect(bodyRows(crlfHtml)).toHaveLength(bodyRows(lfHtml).length);
      expect(text(crlfHtml)).toBe(text(lfHtml));
    });
  });

  describe('JSON GET /api/digest/:night', () => {
    it('returns 200 with the full Digest object', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', `${MAIN_LINES.join('\n')}\n`);
      const res = await createApp(configFor(dir)).request('/api/digest/2026-10-28');
      expect(res.status).toBe(200);
      expect((await res.json()) as Digest).toEqual(MAIN_DIGEST);
    });

    it('preserves timestamps exactly as logged, with their offsets', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', `${MAIN_LINES.join('\n')}\n`);
      const digest = (await (await createApp(configFor(dir)).request('/api/digest/2026-10-28')).json()) as Digest;
      const row = digest.rows.find((candidate) => candidate.job === 'sync-invoices');
      expect(row?.firstAt).toBe('2026-10-28T22:00:00+01:00');
      expect(row?.lastAt).toBe('2026-10-28T22:25:00+01:00');
    });

    it('returns 404 when the night has no file', async () => {
      const dir = newRunsDir();
      const res = await createApp(configFor(dir)).request('/api/digest/2026-01-01');
      expect(res.status).toBe(404);
    });

    it('returns 404 for a night stem that is not YYYY-MM-DD', async () => {
      const dir = newRunsDir();
      const res = await createApp(configFor(dir)).request('/api/digest/..%2Fsecret');
      expect(res.status).toBe(404);
    });

    it('returns an empty digest with 200 for an empty file', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', '\n   \n');
      const res = await createApp(configFor(dir)).request('/api/digest/2026-10-28');
      expect(res.status).toBe(200);
      expect((await res.json()) as Digest).toEqual({
        night: '2026-10-28',
        rows: [],
        badLines: 0,
        counts: { ok: 0, retry: 0, fail: 0 },
      });
    });

    it('counts bad lines and keeps valid rows for a file with only bad lines', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', '{oops\n{"at":"2026-10-28T22:00:00+01:00","job":"","status":"ok"}\n');
      const res = await createApp(configFor(dir)).request('/api/digest/2026-10-28');
      expect(res.status).toBe(200);
      expect((await res.json()) as Digest).toEqual({
        night: '2026-10-28',
        rows: [],
        badLines: 2,
        counts: { ok: 0, retry: 0, fail: 0 },
      });
    });

    it('accepts CRLF line endings with the same digest as LF', async () => {
      const dir = newRunsDir();
      writeNight(dir, '2026-10-28', `${MAIN_LINES.join('\r\n')}\r\n`);
      const res = await createApp(configFor(dir)).request('/api/digest/2026-10-28');
      expect((await res.json()) as Digest).toEqual(MAIN_DIGEST);
    });
  });

  describe('page and JSON agree on the real night', () => {
    it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line, page and JSON in the same order', async () => {
      const app = createApp(configFor(REAL_RUNS));
      const digest = (await (await app.request('/api/digest/2026-10-28')).json()) as Digest;
      const html = await (await app.request('/digest/2026-10-28')).text();

      expect(digest.rows.map((row) => row.job)).toEqual([
        'digest/render',
        'fixtures/refresh',
        'lane/sync',
        'notes/backup',
        'rig/rotate-logs',
      ]);
      expect(digest.badLines).toBe(1);
      expect(digest.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
      expect(bodyRows(html)).toHaveLength(5);
      expect(rowFor(html, 'digest/render')).toContain('—');
      expect(rowFor(html, 'fixtures/refresh')).toMatch(/warn/i);
      expect(rowFor(html, 'notes/backup')).toMatch(/warn/i);
      expect(rowFor(html, 'lane/sync')).not.toMatch(/warn/i);
    });
  });
});
