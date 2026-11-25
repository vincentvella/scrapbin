// Identify parts in a photo with the app's prompt + schema through `claude -p`,
// on the user's Claude Code login (no API key).
import { dirname } from 'node:path';

import { SCHEMA, SYSTEM } from '../src/lib/vision';

const CLAUDE = process.env.SCRAPBIN_CLAUDE ?? 'claude'; // overridable so tests can use a fake
const TIMEOUT_MS = 180_000;

/** Returns the raw JSON text of `{parts: [...]}`; throws with a readable message on failure. */
export async function identifyParts(photoPath: string): Promise<string> {
  const proc = Bun.spawn(
    [
      CLAUDE, '-p',
      `Read the image at ${photoPath}, then list the electronic parts in it.`,
      '--system-prompt', SYSTEM,
      '--json-schema', JSON.stringify(SCHEMA),
      '--output-format', 'json',
      // Only the Read tool, only inside the photo's folder; no MCP servers, no saved session.
      '--tools', 'Read',
      '--allowedTools', `Read(${dirname(photoPath)}/**)`,
      '--strict-mcp-config',
      '--no-session-persistence',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const timer = setTimeout(() => proc.kill(), TIMEOUT_MS);
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  if (proc.signalCode) throw new Error('Claude took too long. Try again or use a photo with fewer parts.');
  let res: { is_error?: boolean; result?: unknown; structured_output?: unknown };
  try {
    res = JSON.parse(out);
  } catch {
    const why = (err || out).trim().split('\n').pop() || `exit code ${code}`;
    throw new Error(code === 127 ? 'Claude Code is not installed (no `claude` on PATH).' : `Claude Code failed: ${why}`);
  }
  if (res.is_error || res.structured_output == null) {
    throw new Error(`Claude Code failed: ${typeof res.result === 'string' ? res.result : 'no structured output'}`);
  }
  return JSON.stringify(res.structured_output);
}
