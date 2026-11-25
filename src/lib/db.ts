// All storage goes through this module so the desktop (Basalt) build can swap expo-sqlite out later.
import type { SQLiteDatabase } from 'expo-sqlite';

import { partKey, type Category, type DetectedPart } from './parts';

export type Part = {
  id: number;
  name: string;
  category: Category;
  value: string | null;
  package: string | null;
  quantity: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ScanStatus = 'pending' | 'analyzed' | 'failed' | 'saved';
export type Scan = {
  id: number;
  photo_path: string;
  status: ScanStatus;
  model: string;
  raw_json: string | null;
  error: string | null;
  created_at: string;
};

export type ReviewItem = Pick<DetectedPart, 'name' | 'category' | 'value' | 'package' | 'quantity'> &
  Partial<Pick<DetectedPart, 'confidence' | 'quantityIsEstimate' | 'notes'>>;

const MIGRATIONS: ((db: SQLiteDatabase) => Promise<void>)[] = [
  (db) =>
    db.execAsync(`
      CREATE TABLE parts (
        id INTEGER PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        value TEXT,
        package TEXT,
        quantity INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE scans (
        id INTEGER PRIMARY KEY,
        photo_path TEXT NOT NULL,
        status TEXT NOT NULL,
        model TEXT NOT NULL,
        raw_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE scan_items (
        id INTEGER PRIMARY KEY,
        scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
        part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        confidence TEXT,
        quantity_is_estimate INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX scan_items_part ON scan_items(part_id);
    `),
];

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    await MIGRATIONS[v](db);
    await db.execAsync(`PRAGMA user_version = ${v + 1}`);
  }
}

const now = () => new Date().toISOString();

// Parts

export function listParts(db: SQLiteDatabase, search: string) {
  const q = `%${search.trim()}%`;
  return db.getAllAsync<Part>(
    `SELECT * FROM parts
     WHERE name LIKE ?1 OR IFNULL(value,'') LIKE ?1 OR IFNULL(package,'') LIKE ?1 OR category LIKE ?1
     ORDER BY category, name, value`,
    q,
  );
}

export const getPart = (db: SQLiteDatabase, id: number) =>
  db.getFirstAsync<Part>('SELECT * FROM parts WHERE id = ?', id);

/** Throws if the edit would make it a duplicate of another part. */
export async function updatePart(db: SQLiteDatabase, p: Omit<Part, 'created_at' | 'updated_at'>) {
  try {
    await db.runAsync(
      `UPDATE parts SET key=?, name=?, category=?, value=?, package=?, quantity=?, notes=?, updated_at=? WHERE id=?`,
      partKey(p), p.name, p.category, p.value, p.package, p.quantity, p.notes, now(), p.id,
    );
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new Error('Another part already has this name, value and package.');
    throw e;
  }
}

export const deletePart = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM parts WHERE id = ?', id);

export const partScans = (db: SQLiteDatabase, partId: number) =>
  db.getAllAsync<{ scan_id: number; quantity: number; created_at: string; photo_path: string }>(
    `SELECT si.scan_id, si.quantity, s.created_at, s.photo_path
     FROM scan_items si JOIN scans s ON s.id = si.scan_id
     WHERE si.part_id = ? ORDER BY s.created_at DESC`,
    partId,
  );

// Scans

export async function createScan(db: SQLiteDatabase, photoPath: string, model: string) {
  const r = await db.runAsync(
    `INSERT INTO scans (photo_path, status, model, created_at) VALUES (?, 'pending', ?, ?)`,
    photoPath, model, now(),
  );
  return r.lastInsertRowId;
}

export const getScan = (db: SQLiteDatabase, id: number) =>
  db.getFirstAsync<Scan>('SELECT * FROM scans WHERE id = ?', id);

export const setScanAnalyzed = (db: SQLiteDatabase, id: number, model: string, rawJson: string) =>
  db.runAsync(`UPDATE scans SET status='analyzed', model=?, raw_json=?, error=NULL WHERE id=?`, model, rawJson, id);

export const setScanFailed = (db: SQLiteDatabase, id: number, error: string) =>
  db.runAsync(`UPDATE scans SET status='failed', error=? WHERE id=?`, error, id);

export const deleteScan = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM scans WHERE id = ?', id);

export const unsavedScans = (db: SQLiteDatabase) =>
  db.getAllAsync<Scan>(`SELECT * FROM scans WHERE status != 'saved' ORDER BY created_at DESC`);

/** Add reviewed items to the inventory in one transaction: matching parts gain quantity, new ones are created. */
export async function saveScan(db: SQLiteDatabase, scanId: number, items: ReviewItem[]) {
  await db.withTransactionAsync(async () => {
    // Saving twice (double click, a stale window) would add every count again.
    const scan = await db.getFirstAsync<{ status: ScanStatus }>('SELECT status FROM scans WHERE id = ?', scanId);
    if (scan?.status !== 'analyzed') throw new Error(scan ? 'This scan is already in your inventory.' : 'Scan not found.');
    const ts = now();
    for (const it of items) {
      if (!it.name.trim() || it.quantity < 1) continue;
      const row = await db.getFirstAsync<{ id: number }>(
        `INSERT INTO parts (key, name, category, value, package, quantity, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET quantity = quantity + excluded.quantity, notes = IFNULL(parts.notes, excluded.notes),
           updated_at = excluded.updated_at
         RETURNING id`,
        partKey(it), it.name.trim(), it.category, it.value, it.package, it.quantity, it.notes?.trim() || null, ts, ts,
      );
      await db.runAsync(
        `INSERT INTO scan_items (scan_id, part_id, quantity, confidence, quantity_is_estimate) VALUES (?, ?, ?, ?, ?)`,
        scanId, row!.id, it.quantity, it.confidence ?? null, it.quantityIsEstimate ? 1 : 0,
      );
    }
    await db.runAsync(`UPDATE scans SET status='saved' WHERE id=?`, scanId);
  });
}
