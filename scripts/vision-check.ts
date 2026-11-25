// Run the app's exact vision prompt + schema over local photos via `claude -p`,
// using your Claude Code login instead of an API key.
//   bun scripts/vision-check.ts photo1.jpg photo2.jpg ...
import { resolve } from 'node:path';

import { identifyParts } from '../server/claude';
import { parseDetectedParts } from '../src/lib/parts';

const photos = process.argv.slice(2).map((p) => resolve(p));
if (!photos.length) {
  console.error('usage: bun scripts/vision-check.ts <photo>...');
  process.exit(1);
}

for (const photo of photos) {
  console.log(`\n${photo}`);
  try {
    for (const p of parseDetectedParts(await identifyParts(photo))) {
      const detail = [p.value, p.package].filter(Boolean).join(', ');
      console.log(`  ${p.quantityIsEstimate ? '~' : ' '}${String(p.quantity).padStart(3)}  ${p.name}${detail ? ` (${detail})` : ''}  [${p.category}, ${p.confidence}]${p.notes ? ` — ${p.notes}` : ''}`);
    }
  } catch (e) {
    console.log(`  FAILED: ${e instanceof Error ? e.message : e}`);
  }
}
