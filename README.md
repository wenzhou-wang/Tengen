# Tengen

A monorepo for Tengen, a weiqi/go application that starts with a React web client and leaves room for an AI-backed server.

## Run

Use the Node version pinned in `.nvmrc`, then install workspaces and run the web dev server:

```sh
nvm use
npm install
npm run dev
```

The app stores the current game in `localStorage`, so reloading the page restores the last board state.

## Build

```sh
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Use `npm run format` to apply Prettier formatting.

## Current features

- 9x9, 13x13, and 19x19 boards
- Legal move checking, captures, suicide prevention, and positional superko prevention
- Pass, resign, undo, score estimate, and SGF export
- Move record, capture counts, final result display, and keyboard board navigation
- Small controller API for future AI integration through `window.Tengen`

## Structure

- `apps/web`: React + TypeScript Vite frontend
- `apps/web/src/game/goEngine.ts`: pure rules, scoring, SGF, and serialization helpers
- `apps/web/src/hooks/useGoGame.ts`: React state, persistence, actions, and AI controller bridge
- `apps/web/src/components/`: board, layout, panels, and UI components
- `apps/server`: placeholder workspace for the future AI-backed game server

## AI integration hook

Future model work can plug into the UI without replacing the board. The browser exposes:

```js
window.Tengen.setController(window.Tengen.colors.WHITE, {
  type: "ai",
  async getMove(state) {
    return { x: 3, y: 3 };
  },
});
```

The controller receives a serializable state object with the board, side to move, captures, and legal moves. Return `{ x, y }` to play a stone or `{ pass: true }` to pass.
