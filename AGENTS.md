# Repository Guidelines

## Project Structure

This is a browser-based React and TypeScript app built with Vite. Application entry points and shared state are in `src/main.tsx`, `src/App.tsx`, and `src/store.ts`. React views and controls live in `src/components/`; framework-independent image, geometry, layout, rendering, and PDF logic lives in `src/lib/`. Tests sit alongside the code they cover (for example, `src/lib/layout.test.ts`). Static illustrations are in `src/assets/`, and README screenshots are in `docs/screenshots/`. Vite outputs production files to `dist/`.

## Build, Test, and Development

Use Node.js 22.12 or newer and npm.

- `npm install` installs dependencies.
- `npm run dev` starts the local Vite server, normally at `http://localhost:5173`.
- `npm test` runs the Vitest suite once.
- `npm run typecheck` checks TypeScript without emitting files.
- `npm run build` type-checks and creates the production build in `dist/`.
- `npm run preview` serves the production build locally.

## Coding Style

Follow the existing TypeScript style: two-space indentation, single-quoted imports, semicolons, and trailing commas in multiline expressions. Keep TypeScript strict and satisfy the configured unused-variable and unused-parameter checks. Use PascalCase for React component files and names (such as `PrintView.tsx`), camelCase for functions and variables, and descriptive `.test.ts` names for tests. There is no separate formatter or linter configured; keep changes consistent with nearby code. Keep reusable calculations and rendering rules in `src/lib/` rather than coupling them to UI components.

## Testing

Vitest is the test runner. Add or update focused tests next to the affected library module, using `describe`, `it`, and `expect`; run them with `npm test`. No coverage threshold is configured. CI runs the test suite and production build on pushes to `main` before deployment.

## Commits and Pull Requests

Use concise, imperative commit subjects, matching history examples such as “Draw an outline around a figure” and “Export a PDF”. Keep each commit focused. Pull requests should explain the user-visible change, note relevant testing, and include screenshots for UI changes. Link related issues when applicable and call out changes to print sizing, PDF output, or persisted project data.
