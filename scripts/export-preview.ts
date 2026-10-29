import { once } from 'node:events';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { serve } from '@hono/node-server';
import { html as htmlTemplate } from 'hono/html';
import { loadConfig } from '../src/config.js';

const output = 'var/preview/index.html';

async function exportPreview() {
  // A failed export must not leave an older, possibly marked copy ready to upload.
  await rm(output, { force: true });
  const marker = process.env.LANE_MARKER?.trim() || null;
  if (process.env.MARKER_REQUIRED === 'true' && !marker) {
    throw new Error('MARKER_REQUIRED=true requires a non-empty LANE_MARKER.');
  }

  const { createApp } = await import('../src/app.js');
  // Do not start the heartbeat or bind the lane's usual port. Fetch the real HTTP page.
  const server = serve({
    fetch: createApp(loadConfig()).fetch,
    hostname: '127.0.0.1',
    port: 0,
  });
  try {
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Preview server has no TCP address.');
    }
    const response = await fetch(`http://127.0.0.1:${address.port}/digest/2026-10-28`, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 200) {
      throw new Error(`Digest export requires HTTP 200; received ${response.status}.`);
    }
    if (!response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('Digest export requires an HTML response.');
    }
    const html = await response.text();
    // Fail closed on assets, active content, and CSS dependencies. Navigation links
    // are allowed; they are not dependencies needed to read the saved page.
    if (
      !/^<!doctype html>/i.test(html.trimStart()) ||
      !/<html\b/i.test(html) ||
      !/<header\b/i.test(html) ||
      (html.match(/<style\b/gi)?.length ?? 0) !== 1 ||
      /<(?:script|link|iframe|object|embed|base|form)\b/i.test(html) ||
      /\s(?:src|srcset|poster|on[a-z]+)\s*=/i.test(html) ||
      /(?:url\s*\(|@import\b|javascript\s*:)/i.test(html)
    ) {
      throw new Error('Digest must be self-contained HTML with one inline stylesheet and no scripts.');
    }
    const expectedMarker = String(await htmlTemplate`${marker ?? 'no marker set'}`);
    if (!html.includes(`<span class="marker">${expectedMarker}</span>`)) {
      throw new Error('Digest must include the lane banner with the expected marker state.');
    }
    await mkdir('var/preview', { recursive: true });
    await writeFile(output, html, { encoding: 'utf8', mode: 0o600 });
    console.log(`Saved ${output} (${marker ? 'marker included' : 'no marker set'}).`);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        if ('closeAllConnections' in server) server.closeAllConnections();
      });
    }
  }
}

try {
  await exportPreview();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Preview export failed.');
  process.exitCode = 1;
}
