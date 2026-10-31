// Copies the ML artifacts (../artifacts/*.json) into public/data/ so a static build works without the API.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const src = join(here, '..', '..', 'artifacts');
const dst = join(here, '..', 'public', 'data');
const required = ['fleet.json', 'replay.json'];

const files = readdirSync(src).filter((f) => f.endsWith('.json')).sort();
const missing = required.filter((f) => !files.includes(f));
if (missing.length) {
  console.error(`sync-data: missing ${missing.join(', ')} in ${src}`);
  process.exit(1);
}
// Validate and copy everything into a staging folder first, so a bad artifact leaves public/data as it was.
const stage = join(here, '..', 'public', '.data-staging');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
let cur = '';
try {
  for (cur of files) {
    JSON.parse(readFileSync(join(src, cur), 'utf8'));
    copyFileSync(join(src, cur), join(stage, cur));
  }
} catch (err) {
  rmSync(stage, { recursive: true, force: true });
  console.error(`sync-data: ${cur}: ${err.message}; public/data left unchanged`);
  process.exit(1);
}
// Swap the folders. The staging folder holds exactly the artifact set, so stale copies go with the old folder.
const old = join(here, '..', 'public', '.data-old');
rmSync(old, { recursive: true, force: true });
if (existsSync(dst)) renameSync(dst, old);
renameSync(stage, dst);
rmSync(old, { recursive: true, force: true });
for (const f of files) console.log(`sync-data: ${f} (${(statSync(join(dst, f)).size / 1024).toFixed(1)} KB)`);
