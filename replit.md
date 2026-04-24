# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

- **ace-up-poker** (`artifacts/ace-up-poker`) — Online multiplayer No-Limit Texas Hold'em. React/Vite client connects via Socket.IO to the shared `api-server` artifact (`src/poker/`). Players host or join lobbies via 5-character codes (up to 9 seats). Configurable buy-in ($0.50/$1/$5/$10), pay mode (small/big blinds OR flat ante per hand), and blind/ante levels. Real poker engine with proper hand evaluator, side pots, min-raise enforcement, and dealer rotation. Tracks per-player buy-ins/buy-backs, hands played and hands won. Players can call a majority vote to end the game, which produces a final settlement screen (P/L per player, who-owes-who, win rate). Server holds in-memory room state. **Learning Mode** (optional, host-set in lobby and locked once the first hand is dealt) shows each player a private coach panel during their own turn with hand name, Monte Carlo win/tie equity (≥1000 iterations), pot odds with profitable badge, outs list, and a one-line tip — all computed server-side and delivered only to the viewer (`computeViewerLearning` in `rooms.ts`, simulator in `learningEngine.ts`).

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
