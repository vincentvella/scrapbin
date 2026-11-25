import { expect, test } from 'bun:test';

import { openDb } from '../../server/sqlite';
import { createScan, getPart, listParts, migrate, partScans, saveScan, setScanAnalyzed, unsavedScans, updatePart } from './db';

const memoryDb = () => openDb(':memory:');
const analyzedScan = async (db: ReturnType<typeof memoryDb>, photo: string) => {
  const id = await createScan(db, photo, 'claude-opus-5-5');
  await setScanAnalyzed(db, id, 'claude-opus-5-5', '{"parts":[]}');
  return id;
};

const resistor = { name: 'Resistor', category: 'resistor' as const, value: '10kΩ', package: 'axial', quantity: 20 };

test('saving scans merges matching parts and records history', async () => {
  const db = memoryDb();
  await migrate(db);
  await migrate(db); // idempotent

  const s1 = await analyzedScan(db, 'scans/1.jpg');
  await saveScan(db, s1, [{ ...resistor, notes: 'From the BOJACK kit' }, { name: 'NE555 timer', category: 'IC', value: null, package: 'DIP-8', quantity: 3 }]);
  const s2 = await analyzedScan(db, 'scans/2.jpg');
  await saveScan(db, s2, [{ ...resistor, value: '10K ohm', quantity: 5 }, { ...resistor, name: ' ', quantity: 9 }]);

  const parts = await listParts(db, '');
  expect(parts).toHaveLength(2);
  const r = parts.find((p) => p.category === 'resistor')!;
  expect(r.quantity).toBe(25);
  expect(r.notes).toBe('From the BOJACK kit'); // kept from the first scan, not overwritten
  expect((await partScans(db, r.id)).map((s) => s.quantity).sort()).toEqual([20, 5]);
  expect(await unsavedScans(db)).toHaveLength(0);
  await expect(saveScan(db, s1, [resistor])).rejects.toThrow('already in your inventory');
  expect((await getPart(db, r.id))!.quantity).toBe(25); // the rejected second save added nothing
  expect(await listParts(db, 'dip')).toHaveLength(1);

  const ic = parts.find((p) => p.category === 'IC')!;
  await expect(updatePart(db, { ...ic, name: 'Resistor', category: 'resistor', value: '10k', package: 'Axial' })).rejects.toThrow(
    'Another part',
  );
  await updatePart(db, { ...ic, quantity: 2 });
  expect((await getPart(db, ic.id))!.quantity).toBe(2);
});
