import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createScan, getPart, listParts, migrate, partScans, saveScan, unsavedScans, updatePart } from './db';

// Just enough of expo-sqlite's async API, backed by bun:sqlite, to run the real SQL.
function memoryDb() {
  const d = new Database(':memory:');
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

const resistor = { name: 'Resistor', category: 'resistor' as const, value: '10kΩ', package: 'axial', quantity: 20 };

test('saving scans merges matching parts and records history', async () => {
  const db = memoryDb();
  await migrate(db);
  await migrate(db); // idempotent

  const s1 = await createScan(db, 'scans/1.jpg', 'claude-opus-5-5');
  await saveScan(db, s1, [resistor, { name: 'NE555 timer', category: 'IC', value: null, package: 'DIP-8', quantity: 3 }]);
  const s2 = await createScan(db, 'scans/2.jpg', 'claude-opus-5-5');
  await saveScan(db, s2, [{ ...resistor, value: '10K ohm', quantity: 5 }, { ...resistor, name: ' ', quantity: 9 }]);

  const parts = await listParts(db, '');
  expect(parts).toHaveLength(2);
  const r = parts.find((p) => p.category === 'resistor')!;
  expect(r.quantity).toBe(25);
  expect((await partScans(db, r.id)).map((s) => s.quantity).sort()).toEqual([20, 5]);
  expect(await unsavedScans(db)).toHaveLength(0);
  expect(await listParts(db, 'dip')).toHaveLength(1);

  const ic = parts.find((p) => p.category === 'IC')!;
  await expect(updatePart(db, { ...ic, name: 'Resistor', category: 'resistor', value: '10k', package: 'Axial' })).rejects.toThrow(
    'Another part',
  );
  await updatePart(db, { ...ic, quantity: 2 });
  expect((await getPart(db, ic.id))!.quantity).toBe(2);
});
