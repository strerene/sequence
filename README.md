# SolidStart

Everything you need to build a Solid project, powered by [`solid-start`](https://start.solidjs.com);

## Styling

Styling is done with **Tailwind CSS v4** (via `@tailwindcss/vite`) and
**daisyUI 5** component classes:

- `src/app.css` imports Tailwind and loads daisyUI with `@plugin "daisyui";`
  (Tailwind v4 is configured entirely in CSS — there is no `tailwind.config.js`).
- The Vite plugin is registered in `vite.config.ts` (`tailwindcss()`).

Prefer Tailwind utilities + daisyUI classes (`btn`, `card`, `modal`, …) for new
UI; keep the legacy per-component CSS files (`Room.css`, `SequenceGame.css`) as
they are until a component is rewritten.

## Creating a project

```bash
# create a new project in the current directory
npm init solid@latest

# create a new project in my-app
npm init solid@latest my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Developing

Once you've cloned this project, install dependencies and start a development server:

```bash
bun install
bun run dev
```

## Building

Solid apps are built with Nitro _presets_, which optimise your project for deployment to different environments.

By default, `npm run build` will generate a Node app under `.output` that you can run with `npm start`. To use a different preset, set it on the `nitro()` plugin in your `vite.config.ts`.

## This project was created with the [Solid CLI](https://github.com/solidjs-community/solid-cli)
