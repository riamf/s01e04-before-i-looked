import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from '../digest/reader.js';
import { lane } from '../lane.js';
import { DigestView } from '../views/digest.js';
import { Layout } from '../views/layout.js';

export function registerDigestPage(app: Hono, config: RigConfig): void {
  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);
    if (!digest) {
      return c.html(
        <Layout title="digest" lane={lane()}>
          <h1>digest</h1>
          <p class="mute">no run log for {night}</p>
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest · ${digest.night}`} lane={lane()}>
        <DigestView digest={digest} />
      </Layout>,
    );
  });
}
