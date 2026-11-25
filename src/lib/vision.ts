import Anthropic from '@anthropic-ai/sdk';

import { CATEGORIES, CONFIDENCES, parseDetectedParts } from './parts';

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

export const SCHEMA = {
  type: 'object',
  properties: {
    parts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          value: nullableString,
          package: nullableString,
          quantity: { type: 'integer' },
          quantityIsEstimate: { type: 'boolean' },
          confidence: { type: 'string', enum: CONFIDENCES },
          notes: nullableString,
        },
        required: ['name', 'category', 'value', 'package', 'quantity', 'quantityIsEstimate', 'confidence', 'notes'],
        additionalProperties: false,
      },
    },
  },
  required: ['parts'],
  additionalProperties: false,
};

export const SYSTEM = `You catalog a hobbyist's electronics parts from a photo.
List each distinct part type once, with how many units there are.
- name: what it is, using the marking when readable ("NE555 timer", "ATmega328P", "Resistor", "Electrolytic capacitor").
- value: electrical value if known ("10kΩ", "100nF", "16MHz"), else null. Read resistor color bands and capacitor codes when you can.
- package: physical package if clear ("DIP-8", "TO-92", "0805", "5mm"), else null.
- quantity: count every visible unit. For a pile you cannot count exactly, give your best estimate and set quantityIsEstimate true.
- Never guess a chip you cannot read: call it "Unknown IC" with confidence low.
- confidence: high only when both identity and count are clear.
- Ignore tools, bags, boxes and non-electronic objects.
- Kits and assortments (a compartment box, a sorted bag, a "37 in 1" sensor kit, a book of SMD strips) are containers, never parts: do not list the kit itself. List each distinct part inside as its own entry, one per value or type: "Electrolytic capacitor" 100µF 25V, "Electrolytic capacitor" 470µF 16V, and so on.
  - Use every source in the photo: compartment labels, the lid or inventory chart, and the parts you can see.
  - Counts per value: use the chart's per-value number if it gives one. If the label only gives a total and an equal split ("240pcs, 24 values × 10"), give each value its share. Set quantityIsEstimate true for counts read from a label rather than counted.
  - If the value list is not visible, list only the parts you can identify, and say in notes that the kit's contents chart was not visible.
  - Keep the kit's brand and name out of name; put it in notes ("from the Allecin capacitor kit").
- If there are no parts, return an empty list.`;

export async function analyzePhoto(apiKey: string, model: string, jpegBase64: string, signal?: AbortSignal) {
  const client = new Anthropic({ apiKey });
  const res = await client.beta.messages.create(
    {
    model,
    max_tokens: 16000,
    // Haiku has no server-side refusal fallback; on Opus a policy decline reruns on another model.
    ...(model.includes('haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
          { type: 'text', text: 'List the electronic parts in this photo.' },
        ],
      },
    ],
    },
    { signal },
  );
  if (res.stop_reason === 'refusal') throw new Error('The model declined to analyze this photo.');
  if (res.stop_reason === 'max_tokens') throw new Error('The reply was cut off. Try a photo with fewer parts.');
  const raw = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  return { raw, parts: parseDetectedParts(raw) };
}

/** Readable message for the scan screen. */
export function describeError(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check it in Settings.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a moment and retry.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the API. Check your connection.';
  if (e instanceof Anthropic.APIError) return `API error ${e.status ?? ''}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
