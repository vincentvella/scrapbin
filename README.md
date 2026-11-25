# Scrapbin

Photograph your electronics parts and Scrapbin counts and identifies them, then brainstorms projects you can build from what you already have.

Open source (MIT). Mobile (iOS/Android, Expo) and desktop (via [Basalt](https://basaltjs.dev)).

## How it works

1. Take a photo of a pile, tray or drawer of parts.
2. A vision model lists each part and its quantity. You fix anything it got wrong.
3. Parts go into your inventory, stored on your device in SQLite.
4. Ask for project ideas built from the inventory.

No account and no server: data stays on the device, and you bring your own model API key.

## Mac app

The Mac app (in `desktop/`, built on [Basalt](https://basaltjs.dev)) needs no API key: it identifies parts with your
Claude Code login. It starts a small local server (`server/`, bun) that keeps the inventory in
`~/Library/Application Support/Scrapbin` and runs `claude -p` with read-only access to the photo being scanned.
Add photos with **Add photos…** or by dropping them on the window. **Project ideas** brainstorms builds from your inventory (parts you own, at most three cheap extras, build steps) and keeps the ones you don't delete.

Needs bun and Claude Code (`claude`) on your PATH.

```sh
cd desktop
bun install
bun run macos   # first build compiles React Native and Hermes from source (several minutes)
```

The Mac and phone inventories are separate for now.

## Develop

Scrapbin needs a development build (it uses native modules), not Expo Go.

```sh
bun install
bun run ios        # or: bun run android — builds and launches the dev build
bun run test       # unit + database tests (bun test, runs the real SQL on bun:sqlite)
bun run typecheck
bun run lint
```

Paste an Anthropic API key in the app's Settings tab before scanning.

To check the vision prompt without an API key, run it through your Claude Code login:

```sh
bun scripts/vision-check.ts photo1.jpg photo2.jpg
```
