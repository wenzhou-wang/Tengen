# Project Tengen

A dependency-free web interface for playing weiqi/go locally in the browser.

## Run

Use the Node version pinned in `.nvmrc`, then install and run the Vite dev server:

```sh
nvm use
npm install
npm run dev
```

The app stores the current game in `localStorage`, so reloading the page restores the last board state.

## Build

```sh
npm run typecheck
npm run build
```

## Current features

- 9x9, 13x13, and 19x19 boards
- Legal move checking, captures, suicide prevention, and positional superko prevention
- Pass, resign, undo, score estimate, and SGF export
- Move record, capture counts, final result display, and keyboard board navigation
- Small controller API for future AI integration through `window.ProjectTengen`

## AI integration hook

Future model work can plug into the UI without replacing the board. The browser exposes:

```js
window.ProjectTengen.setController(window.ProjectTengen.colors.WHITE, {
  type: "ai",
  async getMove(state) {
    return { x: 3, y: 3 };
  },
});
```

The controller receives a serializable state object with the board, side to move, captures, and legal moves. Return `{ x, y }` to play a stone or `{ pass: true }` to pass.
