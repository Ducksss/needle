// Copies the ML artifacts (../artifacts/*.json) into public/data/ so a static build works without the API.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const src = join(here, '..', '..', 'artifacts');
const dst = join(here, '..', 'public', 'data');
const required = ['fleet.json', 'replay.json'];

mkdirSync(dst, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith('.json')).sort();
const missing = required.filter((f) => !files.includes(f));
if (missing.length) {
  console.error(`sync-data: missing ${missing.join(', ')} in ${src}`);
  process.exit(1);
}
for (const f of files) {
  JSON.parse(readFileSync(join(src, f), 'utf8'));
  copyFileSync(join(src, f), join(dst, f));
  console.log(`sync-data: ${f} (${(statSync(join(dst, f)).size / 1024).toFixed(1)} KB)`);
}
// Mirror the artifact set: a copy whose artifact is gone would otherwise be served next to newer data.
for (const f of readdirSync(dst).filter((f) => f.endsWith('.json') && !files.includes(f))) {
  rmSync(join(dst, f));
  console.log(`sync-data: removed stale ${f}`);
}
