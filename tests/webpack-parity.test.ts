/**
 * Side-by-side parity with last-call-webpack-plugin@3 on webpack 5.
 * Phase order is whatever that package does with webpack's deprecated hooks;
 * the Rspack port must record the same phases and write the same files.
 */
import { describe, expect, it } from '@rstest/core';
import LastCallWebpackPlugin from 'last-call-webpack-plugin';
import {
  LastCallRspackPlugin,
  PHASES,
  type AssetProcessor,
} from '../src/index.ts';
import {
  createProject,
  outputExists,
  readOutput,
  removeProject,
  runRspack,
  runWebpack,
} from './helpers/build.ts';

function phaseProcessors(log: string[]): AssetProcessor[] {
  return [
    {
      regExp: /^bundle\.js$/,
      phase: PHASES.OPTIMIZE_ASSETS,
      processor: async (_assetName, asset) => {
        log.push('assets');
        return `/* default-phase */\n${asset ? asset.source() : ''}`;
      },
    },
    {
      regExp: /^bundle\.js$/,
      phase: PHASES.OPTIMIZE_CHUNK_ASSETS,
      processor: async (_assetName, asset) => {
        const text = String(asset ? asset.source() : '');
        log.push(`chunk:${text.includes('/* default-phase */')}`);
        return undefined;
      },
    },
    {
      regExp: /^bundle\.js$/,
      phase: PHASES.EMIT,
      processor: async (_assetName, asset) => {
        const text = String(asset ? asset.source() : '');
        log.push(`emit:${text.includes('/* default-phase */')}`);
        return undefined;
      },
    },
  ];
}

function emitProcessors(): AssetProcessor[] {
  return [
    {
      regExp: /^bundle\.js$/,
      phase: PHASES.EMIT,
      processor: async (_assetName, _asset, assets) => {
        assets.setAsset('extra.txt', 'from-last-call');
        assets.setAsset('remove-me.txt', 'x');
        assets.setAsset('remove-me.txt', null);
        assets.setAsset('immediate.txt', 'x');
        assets.setAsset('immediate.txt', null, true);
        assets.setAsset('empty.txt', '');

        if (assets.getAsset('immediate.txt') !== undefined) {
          throw new Error('immediate delete failed');
        }
        if (assets.getAsset('extra.txt') !== 'from-last-call') {
          throw new Error('getAsset failed');
        }
        if (assets.getAsset('empty.txt') !== undefined) {
          throw new Error('empty asset should read back as undefined');
        }

        return 'console.log("last-call");\n';
      },
    },
  ];
}

describe('webpack parity', () => {
  it('runs phases in the same order and keeps the default-phase edit', async () => {
    const webpackLog: string[] = [];
    const rspackLog: string[] = [];
    const webpackProject = createProject();
    const rspackProject = createProject();

    try {
      await Promise.all([
        runWebpack({
          ...webpackProject,
          plugins: [
            new LastCallWebpackPlugin({
              assetProcessors: phaseProcessors(webpackLog),
            }),
          ],
        }),
        runRspack({
          ...rspackProject,
          plugins: [
            new LastCallRspackPlugin({
              assetProcessors: phaseProcessors(rspackLog),
            }),
          ],
        }),
      ]);

      expect(rspackLog).toEqual(webpackLog);
      expect(rspackLog[0]).toBe('assets');
      expect(readOutput(rspackProject.buildDir, 'bundle.js')).toContain(
        '/* default-phase */',
      );
      expect(readOutput(webpackProject.buildDir, 'bundle.js')).toContain(
        '/* default-phase */',
      );
    } finally {
      removeProject(webpackProject.projectDir);
      removeProject(rspackProject.projectDir);
    }
  }, 60_000);

  it('writes the same emit-phase additions, replacements, and deletions', async () => {
    const webpackProject = createProject();
    const rspackProject = createProject();

    try {
      await Promise.all([
        runWebpack({
          ...webpackProject,
          plugins: [
            new LastCallWebpackPlugin({
              assetProcessors: emitProcessors(),
            }),
          ],
        }),
        runRspack({
          ...rspackProject,
          plugins: [
            new LastCallRspackPlugin({
              assetProcessors: emitProcessors(),
            }),
          ],
        }),
      ]);

      expect(readOutput(rspackProject.buildDir, 'bundle.js')).toBe(
        readOutput(webpackProject.buildDir, 'bundle.js'),
      );
      expect(readOutput(rspackProject.buildDir, 'extra.txt')).toBe(
        readOutput(webpackProject.buildDir, 'extra.txt'),
      );
      expect(outputExists(rspackProject.buildDir, 'remove-me.txt')).toBe(
        outputExists(webpackProject.buildDir, 'remove-me.txt'),
      );
      expect(outputExists(rspackProject.buildDir, 'immediate.txt')).toBe(false);
      expect(outputExists(webpackProject.buildDir, 'immediate.txt')).toBe(
        false,
      );
    } finally {
      removeProject(webpackProject.projectDir);
      removeProject(rspackProject.projectDir);
    }
  }, 60_000);
});
