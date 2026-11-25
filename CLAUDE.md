@AGENTS.md

## Scrapbin decisions

- Stack: Expo SDK 58 (RN 0.88) + expo-router, bun. Desktop later via Basalt (RN 0.88 supported, gets Fast Refresh).
- Local-first: inventory in expo-sqlite on device. No backend, no account. The user supplies their own vision-model API key.
- Basalt has no third-party native modules ported yet, so expo-sqlite (and camera) won't run on desktop as-is. Keep storage behind one small module so desktop can swap it.
- Bundle id: com.vellapps.scrapbin
