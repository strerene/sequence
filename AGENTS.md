# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

Two-player online **Sequence** board game. SolidStart (SolidJS + Vite + Nitro
static preset) with peer-to-peer multiplayer via PeerJS WebRTC data channels.
No game server: the hosting browser tab is the authority.

## Commands

```bash
bun install          # install dependencies (bun.lock is the lockfile; Node ≥ 24)
bun run dev          # dev server (vite dev)
bun run build        # production build → .output/ (static preset)
bun run start        # serve the built output
bun run preview      # vite preview

bun run gh-pages:deploy   # build with BASE_PATH=/sequence/ and publish to GitHub Pages
```

There is no test suite or linter configured. Verify changes with `bun run
build` and by playing a two-tab game (`bun run dev` in one tab, open the room
link in a second tab/window).

## Critical invariants — do not violate

1. **`src/lib/sequence/reducer.ts` must stay pure.** No `Math.random()`, no
   `Date.now()`, no network, no hidden information. It may only read public
   facts from `SequenceState`.
2. **Hidden information never leaks.** Deck order and hand contents live only
   in `SequenceSecrets` (`src/lib/sequence/secrets.ts`), host-side only. Never
   add hands or deck contents to `SequenceState`, and never include them in a
   `HostMessage` broadcast. Each client receives only *its own* hand via the
   `state` message's `hand` field.
3. **`SequenceSecrets.prepareProposal` must mirror the reducer's public
   preconditions** (acting player, phase, turn step, card possession) before
   mutating secrets, so an accepted proposal is guaranteed to commit. If you
   change reducer preconditions, change the mirror in `prepareProposal` too.
4. **Seats are colors:** host seat is `"blue"`, client seat is `"green"`;
   `turnOrder[0]` is the host. Two-player only — don't generalize to N players
   without a deliberate redesign.

## Code map

- `src/lib/sequence/` — game engine, framework-agnostic (no DOM, no Solid).
  - `types.ts` — state shape, the five actions, constants.
  - `cards.ts` — deck, board layout, card predicates, `SEQUENCE_WINDOWS`.
  - `reducer.ts` — the rules machine (pure).
  - `secrets.ts` — host-only hidden state + proposal validation.
  - `index.ts` — exports + the P2P message protocol types.
- `src/lib/p2p.ts` — PeerJS lifecycle (`createRoom`/`joinRoom`), role
  persistence in `sessionStorage`, module-level peer singleton.
- `src/components/HostRoom.tsx` — authority loop: validate proposal → reducer →
  broadcast `state` + recipient's hand; `sessionStorage` persistence;
  `settleDraws` folds pending draws into one update.
- `src/components/ClientRoom.tsx` — sends `action` proposals, renders host state.
- `src/components/SequenceGame.tsx` — shared board/hand UI.
- `src/routes/` — SolidStart file-based routes (`index`, `about`, 404).

## Conventions

- TypeScript, ESM, SolidJS signals (no external state library).
- Comments in this codebase explain *why* around the hidden-information
  architecture — keep that style; these invariants are easy to break silently.
- Engine code (`src/lib/sequence/`) must remain independent of Solid/DOM so it
  stays testable and deterministic.
- Env vars for the PeerJS signaling server: `VITE_PEER_HOST`, `VITE_PEER_PORT`,
  `VITE_PEER_SECURE`, `VITE_PEER_PATH` (see `src/lib/p2p.ts`).

## Pitfalls

- Editing only the reducer when a rule changes — the host's secret validation
  and the deck-reshuffle mirroring in both `reducer.ts` and `secrets.ts` must
  stay in sync or replicas/secrets will drift.
- Putting anything beyond public facts into broadcast payloads (leaks hands).
- Storing game state anywhere other than `sessionStorage` per-tab (multiple
  tabs host/join different rooms independently by design).
