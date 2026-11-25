@AGENTS.md

## Scrapbin decisions

- Stack: Expo SDK 58 (RN 0.88) + expo-router, bun. Desktop later via Basalt (RN 0.88 supported, gets Fast Refresh).
- Local-first: inventory in expo-sqlite on device. No backend, no account. The user supplies their own vision-model API key.
- Basalt has no third-party native modules ported yet, so expo-sqlite (and camera) won't run on desktop as-is. Keep storage behind one small module so desktop can swap it.
- Bundle id: com.vellapps.scrapbin
- No web target: expo-secure-store has no web support. Template web files were removed.
- Layout: `src/lib/` holds logic (`db.ts` storage, `vision.ts` Claude call, `parts.ts` pure helpers, `photos.ts`, `settings.ts`); screens in `src/app/` (tabs: inventory, scan, settings; stack: `scan/[id]` review, `part/[id]` detail).
- Photos are stored as paths relative to the documents folder (iOS moves the container between updates).
- Gate: `bun run test && bun run typecheck && bun run lint`. `expo lint` is broken with eslint 9 here, so lint runs eslint directly.
- Mac app: `desktop/` (Basalt, plain RN) talks over 127.0.0.1 HTTP to `server/server.ts` (bun), which it spawns with a random token. The server reuses `src/lib/db.ts` via `server/sqlite.ts` (bun:sqlite with expo-sqlite's async API) and runs vision through `claude -p` (`server/claude.ts`). Data: ~/Library/Application Support/Scrapbin. The server exits a minute after the app stops pinging.
- `desktop/` imports the phone's plain-RN components and logic from `../src` via `@/`; `desktop/metro.config.js` maps `@/` and forces bare imports from ../src to resolve in desktop/node_modules (one react-native).
- Desktop Metro runs on port 8097 (8096 is another project's). Drive the Mac app by pid (Swift AX tool), never by process name: every Basalt app is named basalt_appkit.
