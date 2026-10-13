# AGENTS.md

## Commands

- `pnpm run build` - Build the library with `rs lib` (Rslib)
- `pnpm run dev` - Watch mode rebuild (`rs lib --watch`)
- `pnpm run test` - Unit / integration / parity tests via `rs test` (Rstest)
- `pnpm run test:parity` - Webpack parity suite only
- `pnpm run test:coverage` - Tests with V8 coverage (Codecov upload in CI)
- `pnpm run lint` - Lint with `rs lint` (Rslint)
- `pnpm run format` - Update README with automd, then format with `rs fmt`
- `pnpm run format:check` - Check formatting with `rs fmt --check`
- `pnpm run check` - `rs check` (lint + format:check) + typecheck
- `pnpm run check:package` - `pnpm run build` (publint + attw)
- `pnpm run automd` - Refresh automd sections in README.md
- `pnpm run typecheck` - Type-check with `tsc6 --noEmit` (`@typescript/typescript6`)
- `pnpm run commitlint` - Lint commit message(s) with Conventional Commits
- `pnpm release` / `bumpp` - Version bump via global `bumpp` (commit + tag + push); CI then publishes npm and creates the GitHub Release (`changelogithub`)
- `pnpm play:rspack` / `pnpm play:rsbuild` - Smoke builds in `playground/`

## Docs

- Rstack CLI: https://rstack.rs/llms.txt
- Rslib: https://rslib.rs/llms.txt
- Rsbuild: https://rsbuild.rs/llms.txt
- Rspack: https://rspack.rs/llms.txt
- Rstest: https://rstest.rs/llms.txt
- Rslint: https://rslint.rs/llms.txt
- Upstream: https://github.com/NMFR/last-call-webpack-plugin

## Package layout

- `src/plugin.ts` — `LastCallRspackPlugin` (webpack-plugin API parity)
- `src/rsbuild-plugin.ts` — `pluginLastCall()` Rsbuild wrapper
- `tests/` — unit, Rspack integration, webpack parity, Rsbuild build
- `playground/` — Rspack / Rsbuild smoke apps
- Self-host: `rstack.config.ts` uses `define.extends([rstack(...)])` from `@heyq02/rstack-config`; `commitlint.config.js` re-exports `@heyq02/rstack-config/commitlint`; `tsconfig.json` extends `@heyq02/rstack-config/tsconfig` (`rootDir` / `include` stay local)

### Phase mapping (agents)

Rspack does not implement `compilation.hooks.optimizeAssets` or `optimizeChunkAssets`. Do not add those taps.

Keep the webpack 5 shim order used by `last-call-webpack-plugin@3`:

- `compilation.optimize-assets` → `processAssets` stage `0` (tapable default when `optimizeAssets` is tapped without a stage)
- `compilation.optimize-chunk-assets` → `processAssets` stage `Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE` (`100`)
- `emit` → `compiler.hooks.emit`, then `deleteAssets()`

Stage `0` runs before stage `100`. That is the webpack 5 order, not the webpack 4 hook order. Do not swap them to "fix" the names.

Asset writes go through the `compilation.assets` proxy (`get` / `set` / `delete`), which Rspack keeps in sync with the native assets. A string or Buffer is wrapped in `sources.RawSource`.

Regression coverage: `tests/webpack-parity.test.ts`.

## Tools

### Split of responsibilities

- **Rstack CLI** (`rs`): build (`rs lib`), lint (`rs lint`), format (`rs fmt`), tests (`rs test`), hooks (`rs hooks`)
- **Rslib**: package build via `@heyq02/rstack-config` `nodeLib` (publint + attw)
- **Package checks**: build-time [`rsbuild-plugin-publint`](https://github.com/rstackjs/rsbuild-plugin-publint) + [`rsbuild-plugin-arethetypeswrong`](https://github.com/rstackjs/rsbuild-plugin-arethetypeswrong)
- **TypeScript**: `typescript` resolves to `@typescript/typescript6` so attw can use the JS API; compiler options come from `@heyq02/rstack-config/tsconfig`
- **Commitlint**: `@heyq02/rstack-config/commitlint` (Conventional Commits, header max 100)
- **Rstest**: unit / parity tests, with V8 coverage from `@rstest/coverage-v8`
- **Rslint**: lint through `rs lint` via `@heyq02/rstack-config`

### Git hooks

- `prepare` runs `rs hooks`
- pre-commit (`.rstack/hooks/pre-commit`) runs `rs staged`
- commit-msg (`.rstack/hooks/commit-msg`) runs `commitlint` (Conventional Commits)
- staged tasks: `rs fmt` on all files, `rs lint --fix` on JS/TS

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope)?: subject`

Allowed types: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`

This keeps GitHub Releases (via `changelogithub` on tag push) useful — non-conventional subjects are dropped.

## Cursor Cloud specific instructions

- Cloud Agent environment is dashboard-managed (not repo-local `.cursor/`). Install should link Node `22.22.2` ahead of the image Node `22.14` at `/exec-daemon/node`, activate `pnpm@12.10.1`, then `pnpm install --frozen-lockfile`.
- Rstack loads `rstack.config.ts` through Node's built-in TypeScript stripping, which is on by default in Node `>=22.18`. `rstack` itself requires Node `^22.18.0 || >=24.3.0`.
- This repo is a library plugin, with no long-running app server. Verify with `pnpm run lint`, `pnpm run test`, `pnpm run typecheck`, `pnpm run build`, and `pnpm run format:check`. Optional smoke: `pnpm play:rspack` / `pnpm play:rsbuild`.
