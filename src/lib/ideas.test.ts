import { expect, test } from 'bun:test';

import { inventoryText, parseIdeas } from './ideas';

test('parseIdeas keeps only real parts and coerces fields', () => {
  const raw = JSON.stringify({
    ideas: [
      {
        title: 'Blinky',
        summary: 'Two LEDs alternate.',
        difficulty: 'easy',
        hours: 1,
        uses: [{ partId: 1, quantity: 2, role: 'LEDs' }, { partId: 999, quantity: 1, role: 'invented part' }, { partId: 2, quantity: 0, role: 'timer' }],
        missing: [{ name: '9V battery', quantity: 1, why: 'power' }, { name: '', quantity: 1, why: '' }],
        steps: ['Place the 555', ' ', 'Wire pin 3'],
      },
      { title: '', summary: 'no title', difficulty: 'easy', hours: 1, uses: [], missing: [], steps: [] },
      { title: 'Odd', summary: '', difficulty: 'impossible', hours: -3, uses: 'nope', missing: null, steps: null },
    ],
  });
  const ideas = parseIdeas(raw, new Set([1, 2]));
  expect(ideas).toHaveLength(2);
  expect(ideas[0].uses).toEqual([{ partId: 1, quantity: 2, role: 'LEDs' }, { partId: 2, quantity: 1, role: 'timer' }]);
  expect(ideas[0].missing).toHaveLength(1);
  expect(ideas[0].steps).toEqual(['Place the 555', 'Wire pin 3']);
  expect(ideas[1]).toMatchObject({ difficulty: 'medium', hours: 0.5, uses: [], missing: [], steps: [] });
  expect(() => parseIdeas('{}', new Set())).toThrow();
});

test('inventoryText is one line per part', () => {
  expect(inventoryText([{ id: 7, name: 'NE555 timer', category: 'IC', value: null, package: 'DIP-8', quantity: 3 }])).toBe(
    '#7 | NE555 timer | IC | - | DIP-8 | 3',
  );
});
