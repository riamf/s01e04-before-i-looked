export type RunStatus = 'ok' | 'retry' | 'fail';

/** One job's valid events, aggregated in their original file order. */
export type DigestRow = {
  /** Exact job identifier; rows are sorted by this string (code-unit order). */
  job: string;
  /** Owner on the job's last valid event; missing or null becomes null. */
  owner: string | null;
  /** Total valid events for this job, including ok, retry, and fail events. */
  runs: number;
  /** Number of this job's valid events whose status is retry. */
  retries: number;
  /** Status on the job's last valid event, not its worst historical status. */
  lastStatus: RunStatus;
  /**
   * Error on the job's last valid event; missing or null becomes null.
   * A later event without an error clears an earlier error.
   */
  lastError: string | null;
  /** Timestamp on the first valid event for this job, exactly as logged. */
  firstAt: string;
  /** Timestamp on the last valid event for this job, exactly as logged. */
  lastAt: string;
};

/** Event totals across the whole file, not counts of jobs or final statuses. */
export type DigestCounts = {
  ok: number;
  retry: number;
  fail: number;
};

export type Digest = {
  /** Requested filename stem, in YYYY-MM-DD form. */
  night: string;
  /** One row per distinct job, ascending by case-sensitive code-unit order. */
  rows: DigestRow[];
  /** Number of nonblank lines rejected for invalid JSON or an invalid event. */
  badLines: number;
  /** Each valid event increments exactly one status count. */
  counts: DigestCounts;
};

/**
 * Synchronously read runsDir/<night>.jsonl without changing any files.
 * The implementation will be exported as readNight from ./reader.js.
 *
 * Lookup:
 * - Accept only filename stems matching /^\d{4}-\d{2}-\d{2}$/; this is a
 *   filename-shape check, not calendar-date validation. Reject all other values
 *   with null before filesystem access, preventing path traversal.
 * - Return null for a missing file or directory (ENOENT or ENOTDIR), including a
 *   missing runsDir. Other filesystem errors propagate rather than looking like
 *   a missing night.
 * - An existing empty or whitespace-only file returns a Digest with empty rows,
 *   zero badLines, and all counts zero. A file containing only bad lines likewise
 *   returns a Digest, with those lines counted in badLines.
 *
 * Input validation:
 * - Process UTF-8 JSONL in file order; accept LF and CRLF. Ignore blank or
 *   whitespace-only lines, including a trailing newline, without counting them.
 * - Each nonblank line must be a JSON object with a nonempty string job, status
 *   equal to ok/retry/fail, and a valid ISO-8601 date-time string at with an
 *   explicit offset or Z. Keep the original timestamp strings; never normalize
 *   them to UTC or sort events by timestamp.
 * - owner and error may each be a string, null, or absent. Normalize absent
 *   values to null; other types invalidate the line. Ignore extra fields.
 * - Count each invalid line once in badLines, skip it entirely, and continue;
 *   malformed input must not throw or contribute to rows or status counts.
 *
 * Aggregation:
 * - Group by exact job string. runs counts every valid event; retries counts
 *   retry events only. Thus sum(row.runs) equals counts.ok + counts.retry +
 *   counts.fail, and sum(row.retries) equals counts.retry.
 * - firstAt comes from the first valid event encountered for a job; lastAt,
 *   owner, lastStatus, and lastError come from its last valid event. File order
 *   wins even if timestamps are out of chronological order or identical.
 * - Return rows sorted ascending by job using case-sensitive code-unit order,
 *   independent of the runtime locale. Preserve original timestamp offsets.
 */
export type ReadNight = (runsDir: string, night: string) => Digest | null;
