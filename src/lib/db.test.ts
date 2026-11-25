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

test('migration 2 moves hardware out of "other"', async () => {
  const db = memoryDb();
  await db.execAsync('PRAGMA user_version = 0');
  await migrate(db);
  await db.execAsync('PRAGMA user_version = 1'); // pretend we're on the old schema with old data
  const s = await analyzedScan(db, 'scans/h.jpg');
  await saveScan(db, s, [
    { name: 'Socket head cap screw', category: 'other', value: 'M2×8mm', package: null, quantity: 30 },
    { name: 'Hex nut', category: 'other', value: 'M2', package: null, quantity: 10 },
    { name: 'Socket cap screw', category: 'other', value: 'M2 x 8mm', package: null, quantity: 5 },
    { name: 'Mystery blob', category: 'other', value: null, package: null, quantity: 1 },
  ]);
  await migrate(db);
  const parts = await listParts(db, '');
  const cats = Object.fromEntries(parts.map((p) => [p.name, p.category]));
  expect(cats).toEqual({ 'Socket head cap screw': 'hardware', 'Hex nut': 'hardware', 'Mystery blob': 'other' });
  const screw = parts.find((p) => p.name === 'Socket head cap screw')!;
  expect(screw.quantity).toBe(35); // the two spellings merged
  expect((await partScans(db, screw.id)).map((x) => x.quantity).sort()).toEqual([30, 5]); // history kept
});

test('a review row can add to, or recount, a chosen existing part', async () => {
  const db = memoryDb();
  await migrate(db);
  await saveScan(db, await analyzedScan(db, 'scans/a.jpg'), [{ name: '4x4 membrane matrix keypad', category: 'switch', value: null, package: null, quantity: 1 }]);
  const [keypad] = await listParts(db, '');
  const worded = { name: 'Membrane keypad 4x4', category: 'switch' as const, value: null, package: null };

  await saveScan(db, await analyzedScan(db, 'scans/b.jpg'), [{ ...worded, quantity: 2, target: { partId: keypad.id, mode: 'add' } }]);
  expect((await getPart(db, keypad.id))!.quantity).toBe(3);
  await saveScan(db, await analyzedScan(db, 'scans/c.jpg'), [{ ...worded, quantity: 5, target: { partId: keypad.id, mode: 'set' } }]);
  expect((await getPart(db, keypad.id))!.quantity).toBe(5);
  expect(await listParts(db, '')).toHaveLength(1); // never a second keypad
  expect(await partScans(db, keypad.id)).toHaveLength(3);
  await expect(
    saveScan(db, await analyzedScan(db, 'scans/d.jpg'), [{ ...worded, quantity: 1, target: { partId: 999, mode: 'add' } }]),
  ).rejects.toThrow('was deleted');
});

