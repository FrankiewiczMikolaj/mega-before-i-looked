import { Hono } from 'hono';
import type { ReadNight } from './types.js';

/** Mount with app.route('/', createDigestJsonRoutes(config.runsDir, readNight)). */
export function createDigestJsonRoutes(runsDir: string, readNight: ReadNight) {
  const app = new Hono();

  app.get('/api/digest/:night', (c) => {
    const digest = readNight(runsDir, c.req.param('night'));
    if (digest === null) return c.notFound();

    // ReadNight owns ordering and aggregation for both HTML and JSON consumers.
    return c.json(digest);
  });

  return app;
}
