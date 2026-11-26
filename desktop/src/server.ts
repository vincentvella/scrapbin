import { addExitListener, addOutputListener, kill, spawn } from 'basalt-subprocess';
import { useEffect, useState } from 'react';

import { SERVER } from './paths.gen';

export type Api = <T = unknown>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
export type ServerState =
  | { status: 'starting' }
  | { status: 'ready'; api: Api; photoUrl: (rel: string) => string }
  | { status: 'failed'; error: string };

// shortcut: Math.random token; it only keeps other local processes and web pages out of a 127.0.0.1 server.
const newToken = () => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');

/** Starts the local Scrapbin server (bun + `claude -p`) and gives back a typed fetch for it. */
export function useServer(): ServerState {
  const [state, setState] = useState<ServerState>({ status: 'starting' });

  useEffect(() => {
    let stopped = false;
    let pid: number | null = null;
    let stdout = '';
    let stderr = '';
    let ping: ReturnType<typeof setInterval> | undefined;
    let quickExits = 0;
    let startedAt = 0;
    const token = newToken();

    function start() {
      stdout = '';
      stderr = '';
      pid = null;
      startedAt = Date.now();
      spawn({ command: `"bun" "${SERVER}"`, env: { SCRAPBIN_TOKEN: token } })
        .then((p) => (stopped ? kill(p) : (pid = p)))
        .catch((e) => setState({ status: 'failed', error: `Could not start bun: ${e?.message ?? e}` }));
    }

    const output = addOutputListener((e) => {
      if (pid !== null && e.pid !== pid) return;
      if (e.stream === 'stderr') stderr = (stderr + e.data).slice(-2000);
      else stdout += e.data;
      const port = stdout.match(/SCRAPBIN_PORT (\d+)/)?.[1];
      if (!port) return;
      stdout = ''; // read each start's port once
      const base = `http://127.0.0.1:${port}`;
      const api: Api = async (path, init) => {
        const res = await fetch(base + path, {
          method: init?.method ?? 'GET',
          headers: { 'x-scrapbin-token': token, 'content-type': 'application/json' },
          body: init?.body === undefined ? undefined : JSON.stringify(init.body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
        return data;
      };
      clearInterval(ping);
      ping = setInterval(() => api('/ping').catch(() => {}), 15_000); // the server exits a minute after the app stops pinging
      setState({ status: 'ready', api, photoUrl: (rel) => `${base}/photos/${rel}?token=${token}` });
    });

    // If the server goes away (it shouldn't, but sleep, a kill or a crash can do it), start another one;
    // give up only when it keeps dying right after starting.
    const exit = addExitListener((e) => {
      if (e.pid !== pid || stopped) return;
      clearInterval(ping);
      quickExits = Date.now() - startedAt < 10_000 ? quickExits + 1 : 0;
      if (quickExits >= 3) {
        setState({ status: 'failed', error: stderr.trim() || `The server exited with code ${e.code}.` });
        return;
      }
      setState({ status: 'starting' });
      setTimeout(start, 500);
    });

    start();
    return () => {
      stopped = true;
      output.remove();
      exit.remove();
      clearInterval(ping);
      if (pid !== null) kill(pid);
    };
  }, []);

  return state;
}
