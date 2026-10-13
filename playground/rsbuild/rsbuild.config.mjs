import { defineConfig } from '@rsbuild/core';
import { PHASES, pluginLastCall } from '@heyq02/rspack-plugin-last-call';

export default defineConfig({
  plugins: [
    pluginLastCall({
      assetProcessors: [
        {
          regExp: /\.js$/,
          phase: PHASES.EMIT,
          processor: async (_assetName, asset) =>
            `/* last-call */\n${asset ? asset.source() : ''}`,
        },
      ],
    }),
  ],
});
