// Scrapbin's local server for the Mac app: owns the SQLite inventory (the phone app's exact SQL)
// and identifies parts through `claude -p`. The desktop app starts it, passes SCRAPBIN_TOKEN,
// and reads the port from the `SCRAPBIN_PORT <n>` line on stdout. Binds 127.0.0.1 only.
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, normalize } from 'node:path';

import * as db from '../src/lib/db';
import { CATEGORIES, parseDetectedParts, type Category } from '../src/lib/parts';
import { identifyParts } from './claude';
import { openDb } from './sqlite';

const TOKEN = process.env.SCRAPBIN_TOKEN;
if (!TOKEN) {
  console.error('SCRAPBIN_TOKEN is required');
  process.exit(1);
}
const DATA = process.env.SCRAPBIN_DATA ?? join(homedir(), 'Library/Application Support/Scrapbin');
const IDLE_EXIT_MS = Number(process.env.SCRAPBIN_IDLE_MS ?? 60_000); // the app pings; exit once it's gone
const MODEL = 'claude-code';

mkdirSync(join(DATA, 'scans'), { recursive: true });
const sql = openDb(join(DATA, 'scrapbin.db'));
await db.migrate(sql);

const abs = (rel: string) => join(DATA, rel);
const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (error: string, status = 400) => json({ error }, status);

/** Copy any image macOS can read (jpg, png, heic…) into the data folder as a ≤1568px JPEG. */
function storePhoto(src: string) {
  if (!existsSync(src)) throw new Error(`No file at ${src}`);
  const rel = `scans/${Date.now()}.jpg`;
  const r = Bun.spawnSync(['sips', '-s', 'format', 'jpeg', '-Z', '1568', src, '--out', abs(rel)]);
  if (r.exitCode !== 0 || !existsSync(abs(rel))) throw new Error('That file is not an image macOS can read.');
  return rel;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const category = (v: unknown): Category => (CATEGORIES.includes(v as Category) ? (v as Category) : 'other');
const qty = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

function reviewItems(body: unknown): db.ReviewItem[] {
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new Error('items must be a list');
  return items.map((it) => ({
    name: str(it?.name) ?? '',
    category: category(it?.category),
    value: str(it?.value),
    package: str(it?.package),
    quantity: qty(it?.quantity),
    confidence: ['high', 'medium', 'low'].includes(it?.confidence) ? it.confidence : undefined,
    quantityIsEstimate: it?.quantityIsEstimate === true,
  }));
}

async function analyze(id: number) {
  const scan = await db.getScan(sql, id);
  if (!scan) return null;
  try {
    const raw = await identifyParts(abs(scan.photo_path));
    parseDetectedParts(raw); // reject malformed output before storing it
    await db.setScanAnalyzed(sql, id, MODEL, raw);
  } catch (e) {
    await db.setScanFailed(sql, id, e instanceof Error ? e.message : String(e));
  }
  return db.getScan(sql, id);
}

let lastSeen = Date.now();
setInterval(() => Date.now() - lastSeen > IDLE_EXIT_MS && process.exit(0), 5_000);

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.SCRAPBIN_PORT ?? 0),
  idleTimeout: 255, // seconds; an analyze request waits on Claude
  async fetch(req) {
    const url = new URL(req.url);
    // Photos are loaded by <Image>, which can't send headers, so they take the token as a query param.
    const token = req.headers.get('x-scrapbin-token') ?? (url.pathname.startsWith('/photos/') ? url.searchParams.get('token') : null);
    if (token !== TOKEN) return fail('unauthorized', 401);
    lastSeen = Date.now();

    const parts = url.pathname.split('/').filter(Boolean);
    const id = Number(parts[1]);
    const route = `${req.method} /${parts[0] ?? ''}${parts.length > 1 ? '/:id' : ''}${parts[2] ? `/${parts[2]}` : ''}`;
    try {
      switch (route) {
        case 'GET /ping':
          return json({ ok: true });
        case 'GET /parts':
          return json(await db.listParts(sql, url.searchParams.get('search') ?? ''));
        case 'GET /parts/:id':
          return json(await db.getPart(sql, id));
        case 'GET /parts/:id/scans':
          return json(await db.partScans(sql, id));
        case 'PUT /parts/:id': {
          const b = (await req.json()) as Record<string, unknown>;
          const name = str(b.name);
          if (!name) return fail('A part needs a name.');
          try {
            await db.updatePart(sql, { id, name, category: category(b.category), value: str(b.value), package: str(b.package), quantity: qty(b.quantity), notes: str(b.notes) });
          } catch (e) {
            return fail(e instanceof Error ? e.message : String(e), 409);
          }
          return json(await db.getPart(sql, id));
        }
        case 'DELETE /parts/:id':
          await db.deletePart(sql, id);
          return json({ ok: true });
        case 'GET /scans':
          return json(await db.unsavedScans(sql));
        case 'POST /scans': {
          const path = str(((await req.json()) as { path?: unknown }).path);
          if (!path) return fail('path is required');
          const scanId = await db.createScan(sql, storePhoto(path), MODEL);
          return json(await db.getScan(sql, scanId));
        }
        case 'GET /scans/:id':
          return json(await db.getScan(sql, id));
        case 'POST /scans/:id/analyze':
          return json(await analyze(id));
        case 'POST /scans/:id/save':
          await db.saveScan(sql, id, reviewItems(await req.json()));
          return json(await db.getScan(sql, id));
        case 'DELETE /scans/:id': {
          const scan = await db.getScan(sql, id);
          await db.deleteScan(sql, id);
          if (scan && existsSync(abs(scan.photo_path))) unlinkSync(abs(scan.photo_path));
          return json({ ok: true });
        }
      }
      if (req.method === 'GET' && parts[0] === 'photos') {
        const rel = normalize(parts.slice(1).join('/'));
        if (!rel.startsWith('scans/')) return fail('not found', 404); // also blocks ../ escapes
        return new Response(Bun.file(abs(rel)));
      }
      return fail('not found', 404);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), 500);
    }
  },
});

console.log(`SCRAPBIN_PORT ${server.port}`);
