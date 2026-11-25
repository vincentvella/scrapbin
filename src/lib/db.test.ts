import { expect, test } from 'bun:test';

import { openDb } from '../../server/sqlite';
import { createScan, getPart, listParts, migrate, partScans, saveScan, unsavedScans, updatePart } from './db';

const memoryDb = () => openDb(':memory:');

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
