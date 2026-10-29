import { describe, expect, it } from 'vitest';
import type { Digest, DigestRow } from '../src/digest/types.js';
import { DigestView } from '../src/views/digest.js';

function row(over: Partial<DigestRow> & { job: string }): DigestRow {
  return {
    owner: null,
    runs: 1,
    retries: 0,
    failures: 0,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-28T02:00:00+01:00',
    lastAt: '2026-10-28T02:05:00+01:00',
    ...over,
  };
}

function digest(over: Partial<Digest>): Digest {
  return {
    night: '2026-10-28',
    rows: [],
    badLines: 0,
    counts: { ok: 0, retry: 0, fail: 0 },
    ...over,
  };
}

async function render(d: Digest): Promise<string> {
  return await (<DigestView digest={d} />).toString();
}

describe('digest view', () => {
  it('renders rows in the given order with dashes for missing owner and error', async () => {
    const html = await render(
      digest({
        rows: [
          row({ job: 'backup', owner: 'ada', firstAt: '2026-10-28T02:00:00+01:00', lastAt: '2026-10-28T02:10:00Z' }),
          row({ job: 'sync', owner: null, lastError: 'timeout' }),
        ],
        counts: { ok: 2, retry: 0, fail: 0 },
      }),
    );
    expect(html.indexOf('backup')).toBeLessThan(html.indexOf('sync'));
    expect(html).toContain('<td>ada</td>');
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('timeout');
    expect(html).toContain('2026-10-28T02:00:00+01:00');
    expect(html).toContain('2026-10-28T02:10:00Z');
  });

  it('marks retries of 3 or more and any historical failure, not only a failing last status', async () => {
    const html = await render(
      digest({
        rows: [
          row({ job: 'flaky', retries: 3, runs: 3, lastStatus: 'retry' }),
          row({ job: 'recovered', failures: 1, runs: 2, lastStatus: 'ok' }),
          row({ job: 'calm', retries: 2, runs: 2, lastStatus: 'retry' }),
        ],
      }),
    );
    expect(html).toContain('retries 3');
    expect(html).toContain('failed 1×');
    expect(html).not.toContain('retries 2');
  });

  it('shows the bad line count and still lists valid rows', async () => {
    const html = await render(digest({ rows: [row({ job: 'ok-job' })], badLines: 2 }));
    expect(html).toContain('bad lines 2');
    expect(html).toContain('ok-job');
  });

  it('says nothing ran for a night with no rows', async () => {
    const html = await render(digest({ badLines: 0 }));
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('escapes job and error text', async () => {
    const html = await render(digest({ rows: [row({ job: '<script>x</script>', lastError: '<b>no</b>' })] }));
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;no&lt;/b&gt;');
  });
});
