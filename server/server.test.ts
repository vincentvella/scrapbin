import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Drives the real server process with a fake `claude` and a throwaway data folder.
const dir = mkdtempSync(join(tmpdir(), 'scrapbin-server-'));
const TOKEN = 'test-token';
let proc: ReturnType<typeof Bun.spawn>;
let base = '';

beforeAll(async () => {
  const fake = join(dir, 'fake-claude');
  const out = { structured_output: { parts: [{ name: 'NE555 timer', category: 'IC', value: null, package: 'DIP-8', quantity: 2, quantityIsEstimate: false, confidence: 'high', notes: null }] } };
  const ideas = { structured_output: { ideas: [{ title: 'Blinky', summary: 'Blinks.', difficulty: 'easy', hours: 1, uses: [{ partId: 1, quantity: 1, role: 'timer' }, { partId: 42, quantity: 1, role: 'made up' }], missing: [], steps: ['Wire it'] }] } };
  // Answers brainstorms (their schema mentions "ideas") and photo scans differently.
  writeFileSync(fake, `#!/bin/sh\ncase "$*" in *'"ideas"'*) echo '${JSON.stringify(ideas)}';; *) echo '${JSON.stringify(out)}';; esac\n`);
  chmodSync(fake, 0o755);
  // A real image for sips to convert.
  Bun.spawnSync(['sips', '-s', 'format', 'png', '/System/Library/Desktop Pictures/Mac Blue.heic', '--out', join(dir, 'in.png')]);

  // shortcut: fixed random port + polling, because reading the child's stdout under `bun test` (1.3.1) ends early.
  const port = 40000 + Math.floor(Math.random() * 20000);
  proc = Bun.spawn(['bun', join(import.meta.dir, 'server.ts')], {
    env: { ...process.env, SCRAPBIN_TOKEN: TOKEN, SCRAPBIN_DATA: join(dir, 'data'), SCRAPBIN_CLAUDE: fake, SCRAPBIN_PORT: String(port) },
    stdout: 'ignore',
  });
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    const ok = await fetch(`${base}/ping`, { headers: { 'x-scrapbin-token': TOKEN } }).then((r) => r.ok, () => false);
    if (ok) return;
    await Bun.sleep(100);
  }
  throw new Error('server did not start');
});
afterAll(() => proc.kill());

const call = (path: string, init: RequestInit = {}) =>
  fetch(base + path, { ...init, headers: { 'x-scrapbin-token': TOKEN, 'content-type': 'application/json', ...init.headers } });

const body = (r: Promise<Response>): Promise<any> => r.then((x) => x.json());

test('rejects requests without the token', async () => {
  expect((await fetch(`${base}/parts`)).status).toBe(401);
});

test('photo in, analyze, save, inventory out', async () => {
  const scan = await body(call('/scans', { method: 'POST', body: JSON.stringify({ path: join(dir, 'in.png') }) }));
  expect(scan.status).toBe('pending');
  expect((await fetch(`${base}/photos/${scan.photo_path}?token=${TOKEN}`)).headers.get('content-type')).toContain('image/jpeg');
  for (const escape of ['/photos/../scrapbin.db', '/photos/scans/..%2Fscrapbin.db', '/photos/scans/%2e%2e/scrapbin.db']) {
    expect((await fetch(`${base}${escape}?token=${TOKEN}`)).status).not.toBe(200);
  }

  const analyzed = await body(call(`/scans/${scan.id}/analyze`, { method: 'POST' }));
  expect(analyzed.status).toBe('analyzed');
  const items = JSON.parse(analyzed.raw_json).parts;
  await call(`/scans/${scan.id}/save`, { method: 'POST', body: JSON.stringify({ items }) });

  const parts = await body(call('/parts'));
  expect(parts).toMatchObject([{ name: 'NE555 timer', quantity: 2 }]);
  const edited = await body(call(`/parts/${parts[0].id}`, { method: 'PUT', body: JSON.stringify({ ...parts[0], quantity: 5 }) }));
  expect(edited.quantity).toBe(5);
  expect(await body(call('/scans'))).toHaveLength(0);
  const again = await call(`/scans/${scan.id}/analyze`, { method: 'POST' });
  expect(again.status).toBe(500); // a saved scan can't be re-analyzed (and so re-saved)
});

test('a bad path fails cleanly', async () => {
  const r = await call('/scans', { method: 'POST', body: JSON.stringify({ path: join(dir, 'missing.jpg') }) });
  expect(r.status).toBe(500);
  expect(((await r.json()) as any).error).toContain('No file');
});

test('brainstorm ideas from the inventory, keep and delete them', async () => {
  const list = await body(call('/ideas', { method: 'POST', body: JSON.stringify({ request: 'something blinky' }) }));
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ title: 'Blinky', request: 'something blinky' });
  expect(list[0].uses).toEqual([{ partId: 1, quantity: 1, role: 'timer' }]); // the invented part #42 is dropped
  await call(`/ideas/${list[0].id}`, { method: 'DELETE' });
  expect(await body(call('/ideas'))).toHaveLength(0);
});

test('a batch of photos is analyzed in the background, oldest first', async () => {
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) ids.push((await body(call('/scans', { method: 'POST', body: JSON.stringify({ path: join(dir, 'in.png') }) }))).id);
  let scans: { id: number; status: string }[] = [];
  for (let i = 0; i < 50; i++) {
    scans = (await body(call('/scans'))).filter((s: { id: number }) => ids.includes(s.id));
    if (scans.every((s) => s.status === 'analyzed')) break;
    await Bun.sleep(100);
  }
  expect(scans.map((s) => s.status)).toEqual(['analyzed', 'analyzed', 'analyzed']); // nobody called /analyze
});

