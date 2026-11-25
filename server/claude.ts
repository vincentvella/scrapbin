// Structured `claude -p` calls on the user's Claude Code login (no API key).
import { dirname } from 'node:path';

import { IDEAS_SCHEMA, IDEAS_SYSTEM } from '../src/lib/ideas';
import { SCHEMA, SYSTEM } from '../src/lib/vision';

const CLAUDE = process.env.SCRAPBIN_CLAUDE ?? 'claude'; // overridable so tests can use a fake
const TIMEOUT_MS = 300_000;

type Run = { prompt: string; system: string; schema: object; readDir?: string };

/** Runs one prompt and returns the JSON text of its structured output; throws with a readable message. */
async function runClaude({ prompt, system, schema, readDir }: Run): Promise<string> {
  const tools = readDir
    ? ['--tools', 'Read', '--allowedTools', `Read(${readDir}/**)`] // only the Read tool, only inside this folder
    : ['--tools', ''];
  const proc = Bun.spawn(
    [
      CLAUDE, '-p', prompt,
      '--system-prompt', system,
      '--json-schema', JSON.stringify(schema),
      '--output-format', 'json',
      ...tools,
      '--strict-mcp-config', // no MCP servers
      '--no-session-persistence',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const timer = setTimeout(() => proc.kill(), TIMEOUT_MS);
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  if (proc.signalCode) throw new Error('Claude took too long. Try again.');
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

/** The JSON text of `{parts: [...]}` for a photo. */
export const identifyParts = (photoPath: string) =>
  runClaude({
    prompt: `Read the image at ${photoPath}, then list the electronic parts in it.`,
    system: SYSTEM,
    schema: SCHEMA,
    readDir: dirname(photoPath),
  });

/** The JSON text of `{ideas: [...]}` for an inventory listing and an optional request. */
export const brainstormIdeas = (inventory: string, request: string) =>
  runClaude({
    prompt: `My parts inventory, one part per line (#id | name | category | value | package | quantity):\n${inventory}\n\n${
      request.trim() ? `What I'd like to build: ${request.trim()}` : 'Suggest a varied set of projects.'
    }`,
    system: IDEAS_SYSTEM,
    schema: IDEAS_SCHEMA,
  });
