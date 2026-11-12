import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';
import type { ReadNight } from './digest/types.js';
import { readNight as readNightFromFile } from './digest/read.js';
import { DigestPage } from './views/digest.js';
import { createDigestJsonRoutes } from './digest/json.js';

export function createApp(config: RigConfig = loadConfig(), readNight: ReadNight = readNightFromFile) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);
    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        {digest === null ? <><h1>digest · {night}</h1><p>night not found</p></> : <DigestPage night={night} digest={digest} />}
      </Layout>,
      digest === null ? 404 : 200,
    );
  });

  app.route('/', createDigestJsonRoutes(config.runsDir, readNight));

  return app;
}
