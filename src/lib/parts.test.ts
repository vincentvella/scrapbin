import { expect, test } from 'bun:test';

import { parseDetectedParts, partKey, saveSummary } from './parts';

test('partKey treats spelling variants as the same part', () => {
  const a = partKey({ category: 'resistor', name: 'Resistor', value: '10kΩ', package: 'Axial' });
  const b = partKey({ category: 'resistor', name: 'resistor ', value: '10K ohm', package: 'axial' });
  expect(a).toBe(b);
  expect(partKey({ category: 'capacitor', name: 'Cap', value: '100µF' })).toBe(
    partKey({ category: 'capacitor', name: 'cap', value: '100uF' }),
  );
  expect(partKey({ category: 'resistor', name: 'Resistor', value: '1k' })).not.toBe(a);
});

test('parseDetectedParts drops bad rows and coerces fields', () => {
  const parts = parseDetectedParts(
    JSON.stringify({
      parts: [
        { name: 'NE555', category: 'IC', value: null, package: 'DIP-8', quantity: 3, quantityIsEstimate: false, confidence: 'high', notes: null },
        { name: '', category: 'IC', quantity: 1 },
        { name: 'Mystery', category: 'gizmo', quantity: 0, confidence: 'sure' },
      ],
    }),
  );
  expect(parts).toHaveLength(2);
  expect(parts[0]).toMatchObject({ name: 'NE555', quantity: 3, confidence: 'high' });
  expect(parts[1]).toMatchObject({ category: 'other', quantity: 1, confidence: 'low' });
  expect(() => parseDetectedParts('{}')).toThrow();
});

test('saveSummary counts units, and only the rows a save keeps', () => {
  const rows = [
    { name: 'Resistor', quantity: 1200 },
    { name: 'LED', quantity: 150 },
    { name: ' ', quantity: 9 },
    { name: 'Diode', quantity: 0 },
  ];
  expect(saveSummary(rows)).toMatchObject({ label: 'Save 2 kinds · 1,350 parts' });
  expect(saveSummary(rows).items).toHaveLength(2);
  expect(saveSummary([{ name: 'NE555', quantity: 1 }]).label).toBe('Save 1 kind · 1 part');
  expect(saveSummary([]).label).toBe('Nothing to save');
});

test('hardware matches on type + size, not wording or material', () => {
  const k = (name: string, value: string | null, pkg: string | null = null) => partKey({ category: 'hardware', name, value, package: pkg });
  expect(k('Socket cap screw', 'M2×8mm')).toBe(k('Socket head cap screw', 'M2 x 8', 'black 12.9 alloy steel'));
  expect(k('Heat shrink tubing', '8.0mm')).toBe(k('Heat-shrink tube', '8mm'));
  expect(k('Hex nut', 'M2')).not.toBe(k('Flat washer', 'M2')); // same size, different part
  expect(k('Socket cap screw', 'M2×8mm')).not.toBe(k('Socket cap screw', 'M2×10mm'));
  expect(k('Hex bolt', null)).not.toBe(k('Carriage bolt', null)); // no size: fall back to the name
});
