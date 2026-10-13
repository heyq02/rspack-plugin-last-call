import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@rstest/core';
import { createRsbuild } from '@rsbuild/core';
import { PHASES, pluginLastCall } from '../src/index.ts';
import { createProject, findOutputs, removeProject } from './helpers/build.ts';

describe('pluginLastCall', () => {
  it('transforms js during an Rsbuild build', async () => {
    const project = createProject({
      'index.js': 'console.log("rsbuild");\n',
    });

    try {
      const rsbuild = await createRsbuild({
        cwd: project.projectDir,
        rsbuildConfig: {
          source: {
            entry: {
              index: './index.js',
            },
          },
          output: {
            distPath: {
              root: project.buildDir,
            },
            cleanDistPath: true,
          },
          tools: {
            htmlPlugin: false,
          },
          plugins: [
            pluginLastCall({
              assetProcessors: [
                {
                  regExp: /\.js$/,
                  phase: PHASES.EMIT,
                  processor: async (_assetName, asset) =>
                    `/* rsbuild-last-call */\n${asset ? asset.source() : ''}`,
                },
              ],
            }),
          ],
        },
      });

      await rsbuild.build();

      const jsFiles = findOutputs(project.buildDir, '.js');
      expect(jsFiles.length).toBeGreaterThan(0);
      const bundled = jsFiles.find((file) =>
        fs.readFileSync(file, 'utf8').includes('/* rsbuild-last-call */'),
      );
      expect(bundled).toBeTruthy();
      expect(path.extname(bundled!)).toBe('.js');
    } finally {
      removeProject(project.projectDir);
    }
  }, 90_000);
});
