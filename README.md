# Scrapbin

Photograph your electronics parts and Scrapbin counts and identifies them, then brainstorms projects you can build from what you already have.

Open source (MIT). Mobile (iOS/Android, Expo) and desktop (via [Basalt](https://basaltjs.dev)).

## How it works

1. Take a photo of a pile, tray or drawer of parts.
2. A vision model lists each part and its quantity. You fix anything it got wrong.
3. Parts go into your inventory, stored on your device in SQLite.
4. Ask for project ideas built from the inventory.

No account and no server: data stays on the device, and you bring your own model API key.

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
