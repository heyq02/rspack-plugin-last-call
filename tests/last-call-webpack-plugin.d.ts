import type { AssetProcessor } from '../src/plugin.ts';

declare module 'last-call-webpack-plugin' {
  class LastCallWebpackPlugin {
    constructor(options?: {
      assetProcessors?: AssetProcessor[];
      canPrint?: boolean;
    });
  }

  export = LastCallWebpackPlugin;
}
