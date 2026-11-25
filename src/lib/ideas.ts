// Project ideas from the inventory: prompt, schema and validation (pure, so `bun test` runs it).

export type Idea = {
  title: string;
  summary: string;
  difficulty: 'easy' | 'medium' | 'hard';
  hours: number;
  /** Inventory parts the build uses, by part id. */
  uses: { partId: number; quantity: number; role: string }[];
  /** What to buy: at most a few cheap, common parts. */
  missing: { name: string; quantity: number; why: string }[];
  steps: string[];
};

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export const IDEAS_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          difficulty: { type: 'string', enum: DIFFICULTIES },
          hours: { type: 'number' },
          uses: {
            type: 'array',
            items: {
              type: 'object',
              properties: { partId: { type: 'integer' }, quantity: { type: 'integer' }, role: { type: 'string' } },
              required: ['partId', 'quantity', 'role'],
              additionalProperties: false,
            },
          },
          missing: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, quantity: { type: 'integer' }, why: { type: 'string' } },
              required: ['name', 'quantity', 'why'],
              additionalProperties: false,
            },
          },
          steps: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'summary', 'difficulty', 'hours', 'uses', 'missing', 'steps'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
};

export const IDEAS_SYSTEM = `You help a hobbyist decide what to build from electronics parts they already own.
Suggest 5 distinct, genuinely buildable projects unless asked for something specific.
- Build from the inventory. Reference every part you use by its #id in uses, with a quantity no larger than they own, and a short role ("timing capacitor", "mounts the board").
- Prefer projects that need nothing else. A project may list up to 3 missing parts, only cheap and common ones (a microcontroller board, a sensor, a battery), each with why it's needed.
- If the inventory has no microcontroller, favor circuits that work without one (555 timers, transistor switches, LED chasers, analog sensors) and list a microcontroller as missing only when the project truly needs code.
- Include the build hardware and connectors the inventory has when the project needs mounting or wiring (standoffs, screws, headers, heat-shrink).
- Pick component values that are correct for the circuit (resistor values for LED current, 555 timing parts) and use the values they actually have.
- Check the electrical details a beginner gets wrong: a MOSFET driven from a 3.3V or 5V pin must be logic-level (an IRF520 or IRFZ44N is not; use a BJT with a base resistor or list a logic-level part to buy), inductive loads (motors, fans, relays, solenoids) need a flyback diode, and LEDs need current-limiting resistors.
- summary: what it does and why it's fun, 1–2 sentences. hours: a realistic estimate for one person.
- steps: 5–10 concrete build steps, including wiring specifics (which pins connect where) and how to test it.
- Use plain language. No markdown.`;

/** One line per part, the format the prompt describes. */
export const inventoryText = (parts: { id: number; name: string; category: string; value: string | null; package: string | null; quantity: number }[]) =>
  parts.map((p) => `#${p.id} | ${p.name} | ${p.category} | ${p.value ?? '-'} | ${p.package ?? '-'} | ${p.quantity}`).join('\n');

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const int = (v: unknown, min: number) => Math.max(min, Math.round(Number(v) || 0));

/** Validate model output (a trust boundary): keep only parts that exist, coerce fields, drop empty ideas. */
export function parseIdeas(raw: string, inventoryIds: ReadonlySet<number>): Idea[] {
  const list = (JSON.parse(raw) as { ideas?: unknown })?.ideas;
  if (!Array.isArray(list)) throw new Error('Model reply had no ideas list');
  return list.flatMap((i): Idea[] => {
    const title = str(i?.title);
    if (!title) return [];
    const uses = (Array.isArray(i.uses) ? i.uses : [])
      .filter((u: { partId?: unknown }) => inventoryIds.has(Number(u?.partId)))
      .map((u: { partId: unknown; quantity: unknown; role: unknown }) => ({ partId: Number(u.partId), quantity: int(u.quantity, 1), role: str(u.role) }));
    const missing = (Array.isArray(i.missing) ? i.missing : [])
      .filter((m: { name?: unknown }) => str(m?.name))
      .map((m: { name: unknown; quantity: unknown; why: unknown }) => ({ name: str(m.name), quantity: int(m.quantity, 1), why: str(m.why) }));
    return [
      {
        title,
        summary: str(i.summary),
        difficulty: DIFFICULTIES.includes(i.difficulty) ? i.difficulty : 'medium',
        hours: Math.max(0.5, Number(i.hours) || 1),
        uses,
        missing,
        steps: (Array.isArray(i.steps) ? i.steps : []).map(str).filter(Boolean),
      },
    ];
  });
}
