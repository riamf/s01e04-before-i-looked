# Preview for review

Issue #6 prepares a static copy of `GET /digest/2026-10-28`, not a public rig server.
The exporter starts `createApp(loadConfig())` on an ephemeral `127.0.0.1` HTTP port,
fetches the digest, requires HTTP 200 and self-contained HTML without scripts, writes
`var/preview/index.html`, and closes the server. It does not start the heartbeat.
The ignored `var/` directory must never be committed, even on a preview branch.

The digest reader and page must be integrated first. A missing route is an export
failure, not a successful preview. Only the checked-in sample run fixtures may be
published; do not substitute a real lane's run directory.

## Local export

From the repository root, with the existing dependencies available and Node 22+:

```sh
pnpm preview:export
```

The package command is exactly:

```sh
tsx --env-file-if-exists=.env scripts/export-preview.ts
```

It uses the local `tsx` dependency, loads `.env` if present, and never prints marker
values or HTML. For a marked local export, use the marker already in your private
environment or `.env`, require it, and do not paste it into a command or shell history:

```sh
MARKER_REQUIRED=true pnpm preview:export
```

For a markerless export, override `.env` explicitly with an empty environment value
(merely unsetting the shell variable would allow `.env` to restore it):

```sh
LANE_MARKER= MARKER_REQUIRED=false pnpm preview:export
```

The page and command report `no marker set`. A required missing/blank marker fails.
Each attempt removes the previous output first, so a failed export cannot leave an
older marked file ready to upload. Never attach the HTML to chat, issues, or reviews.

## Approval before publication

Preparation is not permission to publish. Before any remote changes, ask the human
to approve the named repository, branch/commit, and actions: pushing the workflow,
enabling Pages with **GitHub Actions** as its source, configuring the `github-pages`
environment/branch rules, storing a repository secret named `LANE_MARKER` if needed,
and manually dispatching this workflow. State who can see the public page and
artifact, what lane metadata the banner exposes, why it is needed, and how the
markerless replacement below removes the marker from the same public URL. Separate
approval is needed before sending the reviewer the URL and plan issue links.

Do not disclose a marker or token in docs, source, commands, logs, or approvals.
The public preview is deliberately temporary; caches or other people's saved copies
cannot be recalled. Artifact deletion is not a guarantee of erasing all copies.

## Approved manual deployment

After integration, verification, and the approvals above:

1. Make the reviewed workflow available on the default branch. `workflow_dispatch`
   workflows must exist there before GitHub offers manual runs. Select only a
   reviewed ref containing the integrated digest and sample fixtures.
2. In **Actions → Preview for review → Run workflow**, leave `include_marker` false
   for a markerless preview. Set it true only for the explicitly approved marked
   review. A missing secret then fails rather than silently publishing unmarked HTML.
3. If the `github-pages` environment requires review, approve the deployment only
   after checking the ref and intended marker setting.
4. Wait for build, deployment, and artifact cleanup to succeed. Use the deployment
   environment's URL (the action's `page_url` output), not a guessed URL. Check the
   public HTTPS page and its banner without copying its marker into evidence.
5. Only after approval to send, submit that URL and the plan's issue links to the
   reviewer. Issue #6 stays open until this has actually happened. Only then add
   the worker closing comment required by `AGENTS.md` and close it.

The workflow has **only** a manual trigger, never a push or pull-request trigger.
On GitHub's runner it sets up Node 22, installs pnpm 12.16.1 and locked dependencies,
runs tests and typecheck, and exports from the checked-in `runs` fixtures. The
marker secret is provided only to the export step, only when requested. No `.env`
is created. The upload directory contains only `index.html`, never source or secrets.
Nothing is committed as a deployment mechanism, so marked HTML is absent from Git
history. `configure-pages` has enablement disabled; it will not enable Pages for you.

Build has only `contents: read`; deploy has only `pages: write` and `id-token: write`.
Only the separate artifact-cleanup job gets `actions: write`. Runs are serialized
without canceling an in-progress deployment.

## Markerless replacement and artifact cleanup

After the review, obtain approval for cleanup and run the **same workflow** on the
same reviewed integrated ref with **`include_marker: false`**. This overrides any
stored secret with an empty marker, renders `no marker set`, and replaces the same
Pages URL. Check that URL publicly; do not use a new host or path. Do not remove
the secret and assume that changes an already deployed static page.

The Pages upload has `retention-days: 1`. After a successful deployment, cleanup
deletes that run's uploaded artifact via the official `artifact_id` output and the
runner's `GH_TOKEN`; the live Pages site remains available. If deployment fails or
cleanup fails/is canceled, an uploaded artifact may remain until expiry. After
approval, delete it through that run's Actions artifact controls (or the REST
artifact-delete endpoint), and check older marked runs too. Expiry is a fallback,
not confirmation that cleanup succeeded. Deleting an artifact does **not** remove
the marker from the live site; the markerless deployment is still required.

Keep evidence to commit IDs, command results, run/deployment URLs, and confirmation
of marker absence. Never preserve marked HTML as evidence.

## Official contracts checked

Versions and inputs/outputs were read from official releases and their `action.yml`
files, rather than inferred from older workflow examples:

- [checkout v7.0.1](https://github.com/actions/checkout/blob/v7.0.1/action.yml)
- [setup-node v7.1.0](https://github.com/actions/setup-node/blob/v7.1.0/action.yml)
- [configure-pages v6.0.0](https://github.com/actions/configure-pages/blob/v6.0.0/action.yml)
- [upload-pages-artifact v5.0.0](https://github.com/actions/upload-pages-artifact/blob/v5.0.0/action.yml): `artifact_id`, `path`, `retention-days`
- [deploy-pages v5.0.1](https://github.com/actions/deploy-pages/blob/v5.0.1/action.yml): `page_url`
- [Custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Delete an Actions artifact](https://docs.github.com/en/rest/actions/artifacts#delete-an-artifact)

These actions use their own Node 24 runtime on the hosted runner; `setup-node`
selects Node 22 for rig's install, checks, and export commands.
