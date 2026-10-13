import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LastCallRspackPlugin, PHASES } from '@heyq02/rspack-plugin-last-call';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  mode: 'production',
  context: __dirname,
  entry: './src/index.js',
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'main.js',
    clean: true,
  },
  plugins: [
    new LastCallRspackPlugin({
      assetProcessors: [
        {
          regExp: /\.js$/,
          // Emit runs after minimizers, so the banner survives production.
          phase: PHASES.EMIT,
          processor: async (_assetName, asset) =>
            `/* last-call */\n${asset ? asset.source() : ''}`,
        },
      ],
    }),
  ],
};
