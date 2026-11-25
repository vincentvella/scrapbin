import { expect, test } from 'bun:test';

import { parseDetectedParts, partKey } from './parts';

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
