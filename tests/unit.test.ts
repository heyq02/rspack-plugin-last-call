import { describe, expect, it } from '@rstest/core';
import {
  LastCallRspackPlugin,
  LastCallWebpackPlugin,
  PHASES,
  type AssetProcessor,
} from '../src/index.ts';

describe('LastCallRspackPlugin options', () => {
  it('exports the webpack class name and phase ids', () => {
    expect(LastCallWebpackPlugin).toBe(LastCallRspackPlugin);
    expect(LastCallRspackPlugin.PHASES).toEqual(PHASES);
    expect(PHASES).toEqual({
      OPTIMIZE_CHUNK_ASSETS: 'compilation.optimize-chunk-assets',
      OPTIMIZE_ASSETS: 'compilation.optimize-assets',
      EMIT: 'emit',
    });
  });

  it('defaults a missing phase to optimize-assets and keeps the object', () => {
    const processor: AssetProcessor = {
      regExp: /\.js$/,
      processor: async () => undefined,
    };
    const plugin = new LastCallRspackPlugin({
      assetProcessors: [processor],
    });

    expect(processor.phase).toBe(PHASES.OPTIMIZE_ASSETS);
    expect(
      plugin
        .getAssetsAndProcessors({ 'app.js': {} }, PHASES.OPTIMIZE_ASSETS)
        .map((match) => match.assetName),
    ).toEqual(['app.js']);
  });

  it('resets global regex lastIndex between asset names', () => {
    const regExp = /js/g;
    const plugin = new LastCallRspackPlugin({
      assetProcessors: [
        {
          regExp,
          processor: async () => undefined,
        },
      ],
    });
    const assets = { 'a.js': {}, 'b.js': {} };

    expect(
      plugin
        .getAssetsAndProcessors(assets, PHASES.OPTIMIZE_ASSETS)
        .map((match) => match.assetName),
    ).toEqual(['a.js', 'b.js']);
    expect(
      plugin.getAssetsAndProcessors(assets, PHASES.OPTIMIZE_ASSETS),
    ).toHaveLength(2);
    expect(regExp.lastIndex).toBe(0);
  });

  it('only returns processors registered for the requested phase', () => {
    const plugin = new LastCallRspackPlugin({
      assetProcessors: [
        {
          regExp: /\.js$/,
          phase: PHASES.EMIT,
          processor: async () => undefined,
        },
        {
          regExp: /\.css$/,
          phase: PHASES.OPTIMIZE_CHUNK_ASSETS,
          processor: async () => undefined,
        },
      ],
    });

    expect(
      plugin.getAssetsAndProcessors(
        { 'a.js': {}, 'a.css': {} },
        PHASES.OPTIMIZE_ASSETS,
      ),
    ).toHaveLength(0);
    expect(
      plugin
        .getAssetsAndProcessors(
          { 'a.js': {}, 'a.css': {} },
          PHASES.OPTIMIZE_CHUNK_ASSETS,
        )
        .map((match) => match.assetName),
    ).toEqual(['a.css']);
    expect(
      plugin
        .getAssetsAndProcessors({ 'a.js': {}, 'a.css': {} }, PHASES.EMIT)
        .map((match) => match.assetName),
    ).toEqual(['a.js']);
  });

  it('rejects invalid processor options', () => {
    expect(() => new LastCallRspackPlugin()).not.toThrow();
    expect(() => new LastCallRspackPlugin({})).not.toThrow();

    expect(
      () =>
        new LastCallRspackPlugin({
          assetProcessors: {} as unknown as [],
        }),
    ).toThrow(/must be an array/);

    expect(
      () =>
        new LastCallRspackPlugin({
          assetProcessors: [undefined as unknown as { regExp: RegExp }],
        }),
    ).toThrow(/must be an object/);

    expect(
      () =>
        new LastCallRspackPlugin({
          assetProcessors: [
            {
              regExp: 'js' as unknown as RegExp,
              processor: async () => undefined,
            },
          ],
        }),
    ).toThrow(/regular expression/);

    expect(
      () =>
        new LastCallRspackPlugin({
          assetProcessors: [{ regExp: /\.js$/, processor: undefined as never }],
        }),
    ).toThrow(/must be a function/);

    expect(
      () =>
        new LastCallRspackPlugin({
          assetProcessors: [
            {
              regExp: /\.js$/,
              processor: async () => undefined,
              phase: 'nope' as unknown as 'emit',
            },
          ],
        }),
    ).toThrow(
      /must be one of: compilation.optimize-chunk-assets, compilation.optimize-assets, emit/,
    );
  });

  it('gates print() with canPrint', () => {
    const calls: unknown[][] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      calls.push(args);
    };

    try {
      new LastCallRspackPlugin({ canPrint: false }).print('hidden');
      expect(calls).toEqual([]);
      new LastCallRspackPlugin().print('shown', 1);
      expect(calls).toEqual([['shown', 1]]);
    } finally {
      console.log = original;
    }
  });
});
