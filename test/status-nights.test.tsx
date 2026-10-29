import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readStatus } from '../src/status.js';

function runsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

const event = (job: string, status: string) =>
  JSON.stringify({ at: '2026-10-28T06:00:00+01:00', job, status, owner: 'ops' });

describe('status board nights', () => {
  it('lists nights newest first with event counts and digest links', async () => {
    const dir = runsDir({
      '2026-10-27.jsonl': [event('a', 'ok'), event('b', 'fail')].join('\n'),
      '2026-10-28.jsonl': [event('a', 'ok'), event('a', 'retry'), event('b', 'fail'), 'not json'].join('\n'),
      '2026-10-29.jsonl': '   \n',
    });
    const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir };

    const status = readStatus(config);
    expect(status.nights).toEqual(['2026-10-29', '2026-10-28', '2026-10-27']);
    expect(status.counts['2026-10-28']).toEqual({ ok: 1, retry: 1, fail: 1 });
    expect(status.counts['2026-10-27']).toEqual({ ok: 1, retry: 0, fail: 1 });
    expect(status.counts['2026-10-29']).toEqual({ ok: 0, retry: 0, fail: 0 });

    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('ok 1');
    expect(html).toContain('retry 1');
    expect(html).toContain('fail 1');
  });

});
