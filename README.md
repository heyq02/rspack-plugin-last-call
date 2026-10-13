# @heyq02/rspack-plugin-last-call

<p>
  <a href="https://npmjs.com/package/@heyq02/rspack-plugin-last-call?activeTab=readme"><img src="https://img.shields.io/npm/v/@heyq02/rspack-plugin-last-call?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" /></a>
  <a href="https://npmcharts.com/compare/@heyq02/rspack-plugin-last-call?minimal=true"><img src="https://img.shields.io/npm/dm/@heyq02/rspack-plugin-last-call.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" /></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@heyq02/rspack-plugin-last-call.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="node version"></a>
  <a href="https://github.com/heyq02/rspack-plugin-last-call/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="license" /></a>
</p>

Rspack / Rsbuild port of [`last-call-webpack-plugin`](https://github.com/NMFR/last-call-webpack-plugin).

Runs async processors against emitted assets, then writes the returned contents back. Processors can also add or delete assets.

## Features

- Match assets with a regular expression and replace them from a Promise
- Same phase ids as upstream: `compilation.optimize-chunk-assets`, `compilation.optimize-assets`, `emit`
- `assets.setAsset` / `assets.getAsset` for extra files, renames, and deletes
- Deferred deletes flush at the end of `emit`; `immediate: true` deletes now
- Rsbuild plugin: `pluginLastCall()`
- Tooling via [Rstack CLI](https://rstack.rs/) + [`@heyq02/rstack-config`](https://github.com/heyq02/rstack-config)

## Install

```bash
pnpm add -D @heyq02/rspack-plugin-last-call
```

Peer: `@rspack/core`. Optional peer: `@rsbuild/core` (only for the Rsbuild wrapper).

## Usage

### Rspack

```js
import { LastCallRspackPlugin, PHASES } from '@heyq02/rspack-plugin-last-call';

export default {
  plugins: [
    new LastCallRspackPlugin({
      assetProcessors: [
        {
          regExp: /\.js$/,
          // `emit` runs after minimizers, so a banner is still in the file.
          phase: PHASES.EMIT,
          processor: (assetName, asset) =>
            Promise.resolve(`/* Author: John Doe */\n${asset.source()}`),
        },
        {
          regExp: /\.css$/,
          processor: (assetName, asset) =>
            Promise.resolve(String(asset.source()).replace(/\s+/g, '')),
        },
      ],
    }),
  ],
};
```

`LastCallWebpackPlugin` is exported as an alias of `LastCallRspackPlugin`.

### Rsbuild

```js
import { defineConfig } from '@rsbuild/core';
import { PHASES, pluginLastCall } from '@heyq02/rspack-plugin-last-call';

export default defineConfig({
  plugins: [
    pluginLastCall({
      assetProcessors: [
        {
          regExp: /\.js$/,
          phase: PHASES.EMIT,
          processor: (assetName, asset) =>
            Promise.resolve(`/* Author: John Doe */\n${asset.source()}`),
        },
      ],
    }),
  ],
});
```

## Options

| Option            | Default                       | Description                                                        |
| ----------------- | ----------------------------- | ------------------------------------------------------------------ |
| `assetProcessors` | `[]`                          | Array of `{ regExp, processor, phase? }`                           |
| `regExp`          | —                             | Regular expression tested against the asset filename               |
| `processor`       | —                             | `(assetName, asset, assets) => Promise`. See below                 |
| `phase`           | `compilation.optimize-assets` | When the processor runs. See phases                                |
| `canPrint`        | `true`                        | Gates the `print()` method. The base plugin does not log by itself |

`processor` must return a Promise.

- Resolve a string or Buffer to replace that asset
- Resolve `null` to delete it (the delete is applied at the end of `emit`)
- Resolve `undefined` to leave it unchanged

## Phases

Rspack has no `optimizeAssets` / `optimizeChunkAssets` hooks. Webpack 5 implements those deprecated hooks as `processAssets` taps, and this plugin uses that mapping:

| `phase`                             | Rspack hook                                                             |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `compilation.optimize-assets`       | `compilation.hooks.processAssets` stage `0` (tapable's default stage)   |
| `compilation.optimize-chunk-assets` | `compilation.hooks.processAssets` stage `PROCESS_ASSETS_STAGE_OPTIMIZE` |
| `emit`                              | `compiler.hooks.emit`, then flush queued deletes                        |

Stage `0` runs before `PROCESS_ASSETS_STAGE_OPTIMIZE` (`100`). On webpack 5, `last-call-webpack-plugin@3` follows that same order because `optimizeAssets` is the raw `processAssets` hook and `optimizeChunkAssets` is pinned to stage `100`. Use `PHASES.EMIT` when the edit must survive later minimizers.

```js
import { PHASES } from '@heyq02/rspack-plugin-last-call';

PHASES.OPTIMIZE_CHUNK_ASSETS; // 'compilation.optimize-chunk-assets'
PHASES.OPTIMIZE_ASSETS; // 'compilation.optimize-assets'
PHASES.EMIT; // 'emit'
```

## Asset manipulation

`processor` receives an `assets` object:

- `setAsset(assetName, assetValue)` writes a string or Buffer. `null` queues a delete. The third argument `immediate` deletes before the processor returns.
- `getAsset(assetName)` returns the current contents, or `undefined` if the asset is missing. An empty string also comes back as `undefined`, matching upstream.

```js
{
  regExp: /\.css$/,
  phase: PHASES.EMIT,
  processor: (assetName, asset, assets) => {
    assets.setAsset(`${assetName}.map`, null);
    assets.setAsset(`${assetName}.log`, 'All OK');
    return Promise.resolve(String(asset.source()).trim());
  },
}
```

Deletes requested with `null` (including a `null` return value) are removed at the end of `emit`, after emit-phase processors finish. `setAsset(name, null, true)` removes the asset immediately.

## Feature parity

| Feature                                     | `last-call-webpack-plugin` | `@heyq02/rspack-plugin-last-call` |
| ------------------------------------------- | -------------------------- | --------------------------------- |
| `regExp` + async `processor`                | ✅                         | ✅                                |
| Default phase `compilation.optimize-assets` | ✅                         | ✅ (processAssets stage 0)        |
| `compilation.optimize-chunk-assets`         | ✅                         | ✅ (processAssets stage 100)      |
| `emit` phase                                | ✅                         | ✅                                |
| `setAsset` / `getAsset`                     | ✅                         | ✅                                |
| Deferred delete at the end of `emit`        | ✅                         | ✅                                |
| Immediate delete                            | ✅                         | ✅                                |
| `null` processor result deletes the asset   | ✅                         | ✅                                |
| Global `regExp` `lastIndex` reset           | ✅                         | ✅                                |
| `canPrint` / `print()`                      | ✅                         | ✅                                |
| Rsbuild plugin                              | ❌                         | ✅ `pluginLastCall()`             |

## Development

Tooling matches [`@heyq02/rstack-config`](https://github.com/heyq02/rstack-config):

```bash
pnpm install
pnpm run build
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:parity
pnpm run format   # automd + rs fmt
pnpm run check    # rs check + typecheck
pnpm release      # global bumpp: bump, commit, tag, push
pnpm play:rspack
pnpm play:rsbuild
```

### Test matrix

| Suite                          | What it covers                                                               |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `tests/unit.test.ts`           | Options, phase buckets, global regex `lastIndex`, `print()`                  |
| `tests/integration.test.ts`    | Emit replace / add / delete, CSS, rejected processor, empty plugin           |
| `tests/webpack-parity.test.ts` | Phase order and emit asset ops against `last-call-webpack-plugin` on webpack |
| `tests/rsbuild.test.ts`        | `pluginLastCall()` through a real Rsbuild build                              |

### Release

```bash
pnpm release
```

Uses your globally installed [`bumpp`](https://github.com/antfu-collective/bumpp) to bump, commit, tag, and push. The `v*` tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml) (GitHub Release via [changelogithub](https://github.com/antfu/changelogithub) + npm publish via [sxzz/workflows](https://github.com/sxzz/workflows)). Every push/PR also gets a preview package from [`.github/workflows/release-commit.yml`](.github/workflows/release-commit.yml) (`pkg-pr-new`).

Configure [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) for this GitHub repo so OIDC publish works without `NPM_TOKEN`.

## License

<!-- automd:contributors license=MIT author="heyq02" -->

Published under the [MIT](https://github.com/heyq02/rspack-plugin-last-call/blob/main/LICENSE) license.
Made by [@heyq02](https://github.com/heyq02) and [community](https://github.com/heyq02/rspack-plugin-last-call/graphs/contributors) 💛
<br><br>
<a href="https://github.com/heyq02/rspack-plugin-last-call/graphs/contributors">
<img src="https://contrib.rocks/image?repo=heyq02/rspack-plugin-last-call" />
</a>

<!-- /automd -->

<!-- automd:with-automd -->

---

_🤖 auto updated with [automd](https://automd.unjs.io)_

<!-- /automd -->
