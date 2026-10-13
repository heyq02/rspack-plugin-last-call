import type { RsbuildPlugin } from '@rsbuild/core';
import { LastCallRspackPlugin, type LastCallPluginOptions } from './plugin.ts';

/**
 * Rsbuild plugin wrapper around {@link LastCallRspackPlugin}.
 */
export function pluginLastCall(
  options: LastCallPluginOptions = {},
): RsbuildPlugin {
  const rspackPlugin = new LastCallRspackPlugin(options);

  return {
    name: 'plugin-last-call',
    setup(api) {
      api.modifyRspackConfig((config) => {
        config.plugins ??= [];
        config.plugins.push(rspackPlugin);
        return config;
      });
    },
  };
}

export type { LastCallPluginOptions };
