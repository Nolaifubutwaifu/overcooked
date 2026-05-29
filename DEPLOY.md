# Deploying Overcooked

The game has two halves to deploy:

1. **Static client** — the Vite app (HTML/JS/CSS). Goes to Vercel.
2. **PartyKit server** — `party/server.ts`. Goes to PartyKit's edge (Cloudflare Workers).

You need both running for online multiplayer to work. Local single-player and
local 2-player do **not** need the server.

## One-time setup

```bash
npm install
```

You'll need accounts on:
- [Vercel](https://vercel.com/) — for the client. `npm i -g vercel` then `vercel login`.
- [PartyKit](https://www.partykit.io/) — for the realtime server. `npx partykit login`.

## Local development

Two terminals:

```bash
# Terminal A — PartyKit server (port 1999)
npm run dev:server

# Terminal B — Vite client (port 5173)
npm run dev
```

Then visit `http://localhost:5173`. Online mode uses `localhost:1999` by default.

If you have `concurrently` installed, `npm run dev:all` runs both.

## Production deployment

### 1. Deploy the PartyKit server

```bash
npm run deploy:server
```

This builds `party/server.ts` and deploys it. The output prints a URL like:

    https://overcooked-game.<your-username>.partykit.dev

Take the host portion: `overcooked-game.<your-username>.partykit.dev`.

### 2. Set the client env var

Create a `.env.production.local` (or set it in your Vercel project settings):

    VITE_PARTY_HOST=overcooked-game.<your-username>.partykit.dev

This tells the browser where to connect for online rooms.

### 3. Deploy the client to Vercel

```bash
npm run deploy:web
```

First time, Vercel will ask you to link the project. After that, the same command
ships updates. Vercel reads `vercel.json` and `package.json` to build and serve
the Vite output from `dist/`.

## How online multiplayer works

- The host clicks **Online — Create Room**, the client generates a 4-char code
  (e.g. `K8WJ`) and connects to the PartyKit room with that ID.
- The joiner picks **Online — Join Room**, types the code, and connects to the
  same room.
- The server is authoritative: both clients send their `InputFrame` (~30 Hz),
  the server runs `update()` and broadcasts the resulting `GameState` snapshot
  + emitted events back to both clients.
- Events (chop sound, smoke, score popup, etc.) are dispatched on each client
  from the server's event stream — so audio/particles stay in sync.
