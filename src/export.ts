import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const samplePath = 'runs/2026-10-28.jsonl';

/** Export only the original template sample, through the production HTML route. */
export async function exportPreview(outputDir = join(repoRoot, 'dist/preview')) {
  // 1dece04 is this repository's original course-template commit.
  const original = execFileSync('git', ['show', `1dece04:${samplePath}`], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!readFileSync(join(repoRoot, samplePath)).equals(original)) {
    throw new Error('Sample differs from the original template; export refused.');
  }

  // Ignore any configured alternative run directory: only template data may be public.
  const config = { ...loadConfig(join(repoRoot, 'rig.json')), runsDir: join(repoRoot, 'runs') };
  const response = await createApp(config).request('/digest/2026-10-28');
  if (response.status !== 200) throw new Error('Digest export did not return HTTP 200.');
  const html = await response.text();
  const banner = /<span class="marker">([^<]*)<\/span>/.exec(html);
  if (!banner) throw new Error('Lane banner is missing; export refused.');
  if (/<script\b|<link\b|\s(?:src|href)\s*=/i.test(html)) {
    throw new Error('Page is not self-contained; export refused.');
  }

  mkdirSync(outputDir, { recursive: true });
  const path = join(outputDir, 'index.html');
  writeFileSync(path, html, 'utf8');
  return {
    path,
    bytes: Buffer.byteLength(html, 'utf8'),
    bannerPresent: true,
    bannerLength: banner[1].length,
    markerSet: banner[1] !== 'no marker set',
    templateSampleVerified: true,
  };
}
