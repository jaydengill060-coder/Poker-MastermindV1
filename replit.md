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

- **ace-up-poker** (`artifacts/ace-up-poker`) — Online multiplayer No-Limit Texas Hold'em. React/Vite client connects via Socket.IO to the shared `api-server` artifact (`src/poker/`). Players host or join lobbies via 5-character codes (up to 9 seats). Configurable buy-in ($0.50/$1/$5/$10), pay mode (small/big blinds OR flat ante per hand), and blind/ante levels. Real poker engine with proper hand evaluator, side pots, min-raise enforcement, and dealer rotation. Server holds in-memory room state.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
