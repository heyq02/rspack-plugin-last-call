import { Compilation, sources } from '@rspack/core';
import type { Compiler, RspackPluginInstance } from '@rspack/core';

/**
 * Same phase ids as `last-call-webpack-plugin`.
 *
 * On webpack 5 those deprecated hooks are shims over `processAssets`:
 * - `optimizeAssets` is the raw hook, so a tap without `stage` runs at 0
 * - `optimizeChunkAssets` is forced to `PROCESS_ASSETS_STAGE_OPTIMIZE` (100)
 *
 * Stage 0 therefore runs before stage 100. `last-call-webpack-plugin@3`
 * behaves that way on webpack 5, and this port keeps that order.
 * `emit` stays on `compiler.hooks.emit`, which is after every processAssets
 * stage. Deferred deletes are flushed at the end of that hook.
 */
export const PHASES = {
  OPTIMIZE_CHUNK_ASSETS: 'compilation.optimize-chunk-assets',
  OPTIMIZE_ASSETS: 'compilation.optimize-assets',
  EMIT: 'emit',
} as const;

export type LastCallPhase = (typeof PHASES)[keyof typeof PHASES];

const PHASE_LIST: readonly LastCallPhase[] = [
  PHASES.OPTIMIZE_CHUNK_ASSETS,
  PHASES.OPTIMIZE_ASSETS,
  PHASES.EMIT,
];

const PHASE_SET = new Set<string>(PHASE_LIST);

/**
 * Webpack taps `optimizeAssets` without a stage. tapable defaults that to 0,
 * which is before `PROCESS_ASSETS_STAGE_OPTIMIZE`.
 */
const OPTIMIZE_ASSETS_STAGE = 0;

export interface AssetsManipulation {
  /**
   * Create or replace an asset. `null` queues the asset for deletion at the
   * end of `emit`. Pass `immediate: true` to delete it now.
   * `undefined` is a no-op.
   */
  setAsset: (
    assetName: string,
    assetValue: string | Buffer | null | undefined,
    immediate?: boolean,
  ) => void;
  /**
   * Asset contents, or `undefined` when the asset is missing.
   * An empty string is also reported as `undefined`, matching upstream.
   */
  getAsset: (assetName: string) => string | Buffer | undefined;
}

export type AssetProcessorFn = (
  assetName: string,
  asset: sources.Source | undefined,
  assets: AssetsManipulation,
) => Promise<string | Buffer | null | undefined>;

export interface AssetProcessor {
  /** Matched against the asset filename. Global regexes are reset after each test. */
  regExp: RegExp;
  /**
   * Return a Promise. A resolved string or Buffer replaces the asset.
   * `null` deletes it (deferred until `emit` unless the processor calls
   * `setAsset` itself). `undefined` leaves the asset unchanged.
   */
  processor: AssetProcessorFn;
  /**
   * When this processor runs.
   * @default 'compilation.optimize-assets'
   */
  phase?: LastCallPhase;
}

export interface LastCallPluginOptions {
  /** Processors applied to matching assets. @default [] */
  assetProcessors?: AssetProcessor[];
  /**
   * Gates {@link LastCallRspackPlugin.print}. The base plugin does not log
   * on its own.
   * @default true
   */
  canPrint?: boolean;
}

interface NormalizedOptions {
  assetProcessors: AssetProcessor[];
  canPrint: boolean;
}

interface NormalizedProcessor extends AssetProcessor {
  phase: LastCallPhase;
}

export interface MatchedAssetProcessor {
  assetName: string;
  regExp: RegExp;
  processor: AssetProcessorFn;
  regExpResult: RegExpExecArray;
}

function invalidProcessor(index: number, detail: string): Error {
  return new Error(
    `LastCallRspackPlugin Error: invalid options.assetProcessors[${String(index)}]${detail}`,
  );
}

function isRegExp(value: unknown): value is RegExp {
  return Object.prototype.toString.call(value) === '[object RegExp]';
}

function normalizeProcessor(
  processor: unknown,
  index: number,
): NormalizedProcessor {
  if (!processor || typeof processor !== 'object') {
    throw invalidProcessor(index, ' (must be an object).');
  }

  const candidate = processor as AssetProcessor;
  if (!isRegExp(candidate.regExp)) {
    throw invalidProcessor(index, '.regExp (must be a regular expression).');
  }
  if (typeof candidate.processor !== 'function') {
    throw invalidProcessor(index, '.processor (must be a function).');
  }
  if (candidate.phase === undefined) {
    candidate.phase = PHASES.OPTIMIZE_ASSETS;
  }
  if (!PHASE_SET.has(candidate.phase)) {
    throw invalidProcessor(
      index,
      `.phase (must be one of: ${PHASE_LIST.join(', ')}).`,
    );
  }
  return candidate as NormalizedProcessor;
}

/**
 * Rspack port of `last-call-webpack-plugin`.
 *
 * Transforms matching assets in one of three phases, and can add or delete
 * assets from the processor callback.
 */
export class LastCallRspackPlugin implements RspackPluginInstance {
  static PHASES = PHASES;

  pluginDescriptor: { name: string };
  options: NormalizedOptions;
  phaseAssetProcessors: Record<LastCallPhase, NormalizedProcessor[]>;
  deleteAssetsMap: Record<string, true> = {};

  constructor(options: LastCallPluginOptions = {}) {
    this.pluginDescriptor = this.buildPluginDescriptor();
    this.options = {
      assetProcessors: [],
      canPrint: true,
      ...options,
    };

    this.phaseAssetProcessors = {
      [PHASES.OPTIMIZE_CHUNK_ASSETS]: [],
      [PHASES.OPTIMIZE_ASSETS]: [],
      [PHASES.EMIT]: [],
    };

    if (!Array.isArray(this.options.assetProcessors)) {
      throw new Error(
        'LastCallRspackPlugin Error: invalid options.assetProcessors (must be an array).',
      );
    }

    for (let index = 0; index < this.options.assetProcessors.length; index++) {
      const normalized = normalizeProcessor(
        this.options.assetProcessors[index],
        index,
      );
      this.phaseAssetProcessors[normalized.phase].push(normalized);
    }

    this.resetInternalState();
  }

  /** Hook name. Override to distinguish a subclass in Rspack traces. */
  buildPluginDescriptor(): { name: string } {
    return { name: 'LastCallRspackPlugin' };
  }

  resetInternalState(): void {
    this.deleteAssetsMap = {};
  }

  setAsset(
    assetName: string,
    assetValue: string | Buffer | null | undefined,
    immediate: boolean | undefined,
    compilation: Compilation,
  ): void {
    if (!assetName) return;

    if (assetValue === null) {
      this.deleteAssetsMap[assetName] = true;
      if (immediate) {
        delete compilation.assets[assetName];
      }
      return;
    }

    if (assetValue !== undefined) {
      compilation.assets[assetName] = this.createAsset(
        assetValue,
        compilation.assets[assetName],
      );
    }
  }

  deleteAssets(compilation: Compilation): void {
    for (const key of Object.keys(this.deleteAssetsMap)) {
      if (compilation.assets[key]) {
        delete compilation.assets[key];
      }
    }
  }

  /** Logs when `canPrint` is true. The base plugin never calls this itself. */
  print(...args: unknown[]): void {
    if (this.options.canPrint) {
      console.log(...args);
    }
  }

  createAsset(
    content: string | Buffer,
    _originalAsset?: sources.Source,
  ): sources.Source {
    return new sources.RawSource(content);
  }

  getAssetsAndProcessors(
    assets: object,
    phase: LastCallPhase,
  ): MatchedAssetProcessor[] {
    const assetProcessors = this.phaseAssetProcessors[phase];
    const matched: MatchedAssetProcessor[] = [];

    for (const assetName of Object.keys(assets)) {
      for (const assetProcessor of assetProcessors) {
        const regExpResult = assetProcessor.regExp.exec(assetName);
        assetProcessor.regExp.lastIndex = 0;
        if (regExpResult) {
          matched.push({
            assetName,
            regExp: assetProcessor.regExp,
            processor: assetProcessor.processor,
            regExpResult,
          });
        }
      }
    }

    return matched;
  }

  process(compilation: Compilation, phase: LastCallPhase): Promise<void> {
    const assetsAndProcessors = this.getAssetsAndProcessors(
      compilation.assets,
      phase,
    );
    if (assetsAndProcessors.length <= 0) {
      return Promise.resolve();
    }

    const assetsManipulation: AssetsManipulation = {
      setAsset: (assetName, assetValue, immediate) => {
        this.setAsset(assetName, assetValue, immediate, compilation);
      },
      getAsset: (assetName) => {
        if (!assetName) return undefined;
        const asset = compilation.assets[assetName];
        if (!asset) return undefined;
        const content = asset.source();
        return content || undefined;
      },
    };

    const promises: Promise<void>[] = [];
    for (const assetAndProcessor of assetsAndProcessors) {
      const asset = compilation.assets[assetAndProcessor.assetName];
      const promise = assetAndProcessor
        .processor(assetAndProcessor.assetName, asset, assetsManipulation)
        .then((result) => {
          if (result !== undefined) {
            this.setAsset(
              assetAndProcessor.assetName,
              result,
              false,
              compilation,
            );
          }
        });
      promises.push(promise);
    }

    return Promise.all(promises).then(() => undefined);
  }

  apply(compiler: Compiler): void {
    const hasChunkProcessors =
      this.phaseAssetProcessors[PHASES.OPTIMIZE_CHUNK_ASSETS].length > 0;
    const hasAssetProcessors =
      this.phaseAssetProcessors[PHASES.OPTIMIZE_ASSETS].length > 0;
    const hasEmitProcessors = this.phaseAssetProcessors[PHASES.EMIT].length > 0;

    compiler.hooks.compilation.tap(this.pluginDescriptor, (compilation) => {
      this.resetInternalState();

      if (hasChunkProcessors) {
        compilation.hooks.processAssets.tapPromise(
          {
            name: this.pluginDescriptor.name,
            stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE,
          },
          () => this.process(compilation, PHASES.OPTIMIZE_CHUNK_ASSETS),
        );
      }

      if (hasAssetProcessors) {
        compilation.hooks.processAssets.tapPromise(
          {
            name: this.pluginDescriptor.name,
            stage: OPTIMIZE_ASSETS_STAGE,
          },
          () => this.process(compilation, PHASES.OPTIMIZE_ASSETS),
        );
      }
    });

    compiler.hooks.emit.tapPromise(this.pluginDescriptor, (compilation) => {
      const pending = hasEmitProcessors
        ? this.process(compilation, PHASES.EMIT)
        : Promise.resolve();
      return pending.then((result) => {
        this.deleteAssets(compilation);
        return result;
      });
    });
  }
}

/** Alias matching the original webpack plugin export name. */
export { LastCallRspackPlugin as LastCallWebpackPlugin };
