import type { Digest, DigestRow } from '../digest/types.js';

// Marks are words, not only color: a grey screenshot or a fetched copy must show them too.
function marks(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.retries >= 3) out.push(`retries ${row.retries}`);
  if (row.failures > 0) out.push(`failed ${row.failures}×`);
  return out;
}

export function DigestView({ digest }: { digest: Digest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p class="mute">
        events: ok {digest.counts.ok} · retry {digest.counts.retry} · fail {digest.counts.fail} ·{' '}
        <span class={digest.badLines > 0 ? 'warn' : undefined}>bad lines {digest.badLines}</span>
      </p>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const flags = marks(row);
              return (
                <tr>
                  <td>
                    {row.job}
                    {flags.length > 0 ? <span class="warn"> · {flags.join(' · ')}</span> : null}
                  </td>
                  <td>{row.owner || '—'}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError || '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
