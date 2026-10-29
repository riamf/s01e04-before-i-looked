# Digest JSON API

`GET /api/digest/:night` returns the morning digest for one night as JSON. It is the
machine-readable twin of the digest page `GET /digest/:night`: both come from the same reader
(`readNight` in `src/digest/reader.ts`), so they list the same jobs in the same order with the
same numbers.

## Request

- `:night` is a filename stem in `YYYY-MM-DD` form, matching `runs/<night>.jsonl`.
- The shape is checked, not the calendar: `2026-13-45` passes the shape check and then simply
  finds no file.
- Any other value (for example `../x` or `2026-10-28.jsonl`) is rejected as not found.

## Responses

### 200 OK

The full `Digest` object:

```json
{
  "night": "2026-10-28",
  "rows": [
    {
      "job": "backup-db",
      "owner": "ana",
      "runs": 3,
      "retries": 1,
      "failures": 1,
      "lastStatus": "ok",
      "lastError": "timeout after 30s",
      "firstAt": "2026-10-28T01:00:04+01:00",
      "lastAt": "2026-10-28T03:10:52+01:00"
    },
    {
      "job": "reindex-search",
      "owner": null,
      "runs": 1,
      "retries": 0,
      "failures": 0,
      "lastStatus": "ok",
      "lastError": null,
      "firstAt": "2026-10-28T02:15:00Z",
      "lastAt": "2026-10-28T02:15:00Z"
    }
  ],
  "badLines": 1,
  "counts": {
    "ok": 3,
    "retry": 1,
    "fail": 1
  }
}
```

An existing night with an empty or whitespace-only file returns 200 with `rows: []`,
`badLines: 0`, and all counts `0`. A file containing only bad lines returns 200 with those lines
in `badLines`.

### 404 Not Found

When there is no file for the night, including when `runs/` itself is missing:

```json
{ "error": "night not found" }
```

Other filesystem errors (for example permission denied) are not reported as 404; they fail the
request.

## Fields

Row fields (`rows[]`):

| Field | Type | Meaning |
| --- | --- | --- |
| `job` | string | Exact job identifier. One row per distinct job. |
| `owner` | string or `null` | Owner on the job's last valid event. Missing or null becomes `null` in JSON. The HTML page shows it as `—`. |
| `runs` | integer | Every valid event for this job, of any status. |
| `retries` | integer | Valid events for this job with status `retry`. |
| `failures` | integer | Valid events for this job with status `fail`, including failures the job later recovered from. |
| `lastStatus` | `ok`, `retry`, or `fail` | Status on the job's last valid event, not its worst earlier status. |
| `lastError` | string or `null` | Latest nonempty error for this job in file order. See below. |
| `firstAt` | string | Timestamp of the job's first valid event, exactly as logged. |
| `lastAt` | string | Timestamp of the job's last valid event, exactly as logged. |

Top-level fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `night` | string | The requested night, `YYYY-MM-DD`. |
| `rows` | array | Row objects as above. |
| `badLines` | integer | Nonblank lines rejected for invalid JSON or an invalid event. |
| `counts` | object | `ok`, `retry`, `fail`: event totals across the whole file. |

## Semantics

**Sorting.** `rows` are sorted by `job` in case-sensitive code-unit order (so `B` sorts before
`a`), independent of locale.

**Timestamps.** `firstAt` and `lastAt` are the first and last valid events in file order, not
the earliest and latest by time. A log whose timestamps run backwards gives `firstAt` later than
`lastAt`. Ties go to file order too. Timestamps are kept as logged, including their offset or
`Z`; they are never converted to UTC.

**Owner.** `owner` comes from the job's last valid event. An absent or null owner on that event
gives `null`; the row is kept.

**Last error.** `lastError` is the latest nonempty string `error` in file order. Events with an
absent, null, or empty `error` do not erase an earlier error, even after the job recovers. It
is `null` only if no valid event for the job supplied a nonempty error.

**Counts.** Each valid event increments exactly one status count in `counts`. So:

- `sum(rows[].runs)` = `counts.ok + counts.retry + counts.fail`
- `sum(rows[].retries)` = `counts.retry`
- `sum(rows[].failures)` = `counts.fail`

Counts are events, not jobs or final statuses.

**Bad lines.** A nonblank line is bad if it is not a JSON object, if `job` is not a nonempty
string, if `status` is not `ok`/`retry`/`fail`, if `at` is not an ISO-8601 date-time with an
explicit offset or `Z`, or if `owner` or `error` is neither a string, null, nor absent. A bad
line is counted once in `badLines` and otherwise ignored: it adds no row, no event, and no
count. Blank and whitespace-only lines are skipped without being counted. Lines may end in LF
or CRLF.

## Stability

Field names and meanings above are the contract. Adding fields is compatible; renaming or
removing them is not. The endpoint never returns the HTML page and never changes the files it
reads.
