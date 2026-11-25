// expo-sqlite's async API (the parts src/lib/db.ts uses), backed by bun:sqlite,
// so the Mac server runs the exact SQL the phone app runs.
import { Database } from 'bun:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

export function openDb(path: string) {
  const d = new Database(path, { create: true });
  const db = {
    execAsync: async (s: string) => void d.exec(s),
    runAsync: async (s: string, ...p: any[]) => {
      const r = d.query(s).run(...p);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: r.changes };
    },
    getFirstAsync: async (s: string, ...p: any[]) => d.query(s).get(...p) ?? null,
    getAllAsync: async (s: string, ...p: any[]) => d.query(s).all(...p),
    withTransactionAsync: async (fn: () => Promise<void>) => {
      d.exec('BEGIN');
      try {
        await fn();
        d.exec('COMMIT');
      } catch (e) {
        d.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return db as unknown as SQLiteDatabase;
}
