// Run the app's exact vision prompt + schema over local photos via `claude -p`,
// using your Claude Code login instead of an API key. Prompt-quality check only:
// it does not exercise the app's Messages API request.
//   bun scripts/vision-check.ts photo1.jpg photo2.jpg ...
import { resolve } from 'node:path';

import { parseDetectedParts } from '../src/lib/parts';
import { SCHEMA, SYSTEM } from '../src/lib/vision';

const photos = process.argv.slice(2).map((p) => resolve(p));
if (!photos.length) {
  console.error('usage: bun scripts/vision-check.ts <photo>...');
  process.exit(1);
}

for (const photo of photos) {
  const proc = Bun.spawnSync([
    'claude', '-p',
    `Read the image at ${photo}, then list the electronic parts in it.`,
    '--system-prompt', SYSTEM,
    '--json-schema', JSON.stringify(SCHEMA),
    '--output-format', 'json',
    '--allowedTools', 'Read',
  ]);
  const out = proc.stdout.toString();
  let parts;
  try {
    const res = JSON.parse(out);
    const structured = res.structured_output ?? res.result;
    parts = parseDetectedParts(typeof structured === 'string' ? structured : JSON.stringify(structured));
  } catch (e) {
    console.log(`\n${photo}\n  FAILED: ${e}\n  ${out.slice(0, 400)} ${proc.stderr.toString().slice(0, 400)}`);
    continue;
  }
  console.log(`\n${photo}`);
  for (const p of parts) {
    const detail = [p.value, p.package].filter(Boolean).join(', ');
    console.log(`  ${p.quantityIsEstimate ? '~' : ' '}${String(p.quantity).padStart(3)}  ${p.name}${detail ? ` (${detail})` : ''}  [${p.category}, ${p.confidence}]${p.notes ? ` — ${p.notes}` : ''}`);
  }
}
