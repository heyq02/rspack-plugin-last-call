import fs from 'node:fs';
import { describe, expect, it } from '@rstest/core';
import { LastCallRspackPlugin, PHASES } from '../src/index.ts';
import {
  createProject,
  findOutputs,
  outputExists,
  readOutput,
  removeProject,
  runRspack,
} from './helpers/build.ts';

const EMITTED = 'console.log("last-call");\n';

describe('LastCallRspackPlugin integration', () => {
  it('replaces, adds, and deletes assets at emit', async () => {
    const project = createProject();
    try {
      await runRspack({
        ...project,
        plugins: [
          new LastCallRspackPlugin({
            assetProcessors: [
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
                    throw new Error(
                      'empty asset should read back as undefined',
                    );
                  }
                  if (assets.getAsset('missing.txt') !== undefined) {
                    throw new Error('missing asset should be undefined');
                  }

                  return EMITTED;
                },
              },
            ],
          }),
        ],
      });

      expect(readOutput(project.buildDir, 'bundle.js')).toBe(EMITTED);
      expect(readOutput(project.buildDir, 'extra.txt')).toBe('from-last-call');
      expect(outputExists(project.buildDir, 'remove-me.txt')).toBe(false);
      expect(outputExists(project.buildDir, 'immediate.txt')).toBe(false);
    } finally {
      removeProject(project.projectDir);
    }
  }, 60_000);

  it('deletes the matched asset when the processor resolves null', async () => {
    const project = createProject();
    try {
      await runRspack({
        ...project,
        plugins: [
          new LastCallRspackPlugin({
            assetProcessors: [
              {
                regExp: /^bundle\.js$/,
                phase: PHASES.EMIT,
                processor: async () => null,
              },
            ],
          }),
        ],
      });

      expect(outputExists(project.buildDir, 'bundle.js')).toBe(false);
    } finally {
      removeProject(project.projectDir);
    }
  }, 60_000);

  it('replaces extracted css', async () => {
    const project = createProject({
      'index.js': 'import "./app.css";\nconsole.log("app");\n',
      'app.css': 'body { color: red; }\n',
    });
    try {
      await runRspack({
        ...project,
        cssFilename: 'styles.css',
        plugins: [
          new LastCallRspackPlugin({
            assetProcessors: [
              {
                regExp: /\.css$/,
                phase: PHASES.EMIT,
                processor: async () => 'body{color:blue}\n',
              },
            ],
          }),
        ],
      });

      const cssFiles = findOutputs(project.buildDir, '.css');
      expect(cssFiles).toHaveLength(1);
      expect(fs.readFileSync(cssFiles[0]!, 'utf8')).toBe('body{color:blue}\n');
    } finally {
      removeProject(project.projectDir);
    }
  }, 60_000);

  it('builds when no processors are configured', async () => {
    const project = createProject();
    try {
      await runRspack({
        ...project,
        plugins: [new LastCallRspackPlugin()],
      });
      expect(readOutput(project.buildDir, 'bundle.js')).toContain('app');
    } finally {
      removeProject(project.projectDir);
    }
  }, 60_000);

  it('fails the build when a processor rejects', async () => {
    const project = createProject();
    try {
      await expect(
        runRspack({
          ...project,
          plugins: [
            new LastCallRspackPlugin({
              assetProcessors: [
                {
                  regExp: /\.js$/,
                  phase: PHASES.EMIT,
                  processor: async () => {
                    throw new Error('boom');
                  },
                },
              ],
            }),
          ],
        }),
      ).rejects.toThrow(/boom/);
    } finally {
      removeProject(project.projectDir);
    }
  }, 60_000);
});
