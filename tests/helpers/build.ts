import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  rspack,
  type Configuration as RspackConfiguration,
} from '@rspack/core';
import webpack from 'webpack';

export interface ProjectPaths {
  projectDir: string;
  buildDir: string;
}

export interface CompileOptions {
  projectDir: string;
  buildDir: string;
  plugins: NonNullable<RspackConfiguration['plugins']>;
  /** Turn on Rspack's built-in CSS pipeline and pin the CSS filename. */
  cssFilename?: string;
}

export function createProject(
  files: Record<string, string> = {},
): ProjectPaths {
  const projectDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'rspack-plugin-last-call-'),
  );
  const buildDir = path.join(projectDir, 'dist');
  const entries = {
    'index.js': 'console.log("app");\n',
    ...files,
  };

  for (const [name, content] of Object.entries(entries)) {
    const filePath = path.join(projectDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  return { projectDir, buildDir };
}

export function removeProject(projectDir: string): void {
  fs.rmSync(projectDir, { recursive: true, force: true });
}

function sharedConfig(options: CompileOptions) {
  return {
    mode: 'development' as const,
    context: options.projectDir,
    entry: './index.js',
    devtool: false as const,
    cache: false as const,
    target: 'web' as const,
    performance: false as const,
    optimization: { minimize: false },
    output: {
      path: options.buildDir,
      filename: 'bundle.js',
      clean: true,
      ...(options.cssFilename ? { cssFilename: options.cssFilename } : {}),
    },
  };
}

function finish(
  err: Error | null | undefined,
  stats:
    | { hasErrors: () => boolean; toString: (opts: object) => string }
    | undefined,
  resolve: () => void,
  reject: (error: Error) => void,
): void {
  if (err) {
    reject(err);
    return;
  }
  if (stats?.hasErrors()) {
    reject(new Error(stats.toString({ all: false, errors: true })));
    return;
  }
  resolve();
}

export function runRspack(options: CompileOptions): Promise<void> {
  const config: RspackConfiguration = {
    ...sharedConfig(options),
    experiments: options.cssFilename ? { css: true } : undefined,
    plugins: options.plugins,
  };

  return new Promise((resolve, reject) => {
    rspack(config, (err, stats) => {
      finish(err, stats ?? undefined, resolve, reject);
    });
  });
}

export function runWebpack(
  options: CompileOptions & { plugins: webpack.Configuration['plugins'] },
): Promise<void> {
  const config: webpack.Configuration = {
    ...sharedConfig(options),
    plugins: options.plugins,
  };

  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      finish(err, stats ?? undefined, resolve, reject);
    });
  });
}

export function readOutput(buildDir: string, name: string): string {
  const full = path.join(buildDir, name);
  if (!fs.existsSync(full)) {
    const found = fs.existsSync(buildDir)
      ? fs.readdirSync(buildDir).join(', ')
      : '(missing dist)';
    throw new Error(`Missing ${name} in ${buildDir}. Found: ${found}`);
  }
  return fs.readFileSync(full, 'utf8');
}

export function outputExists(buildDir: string, name: string): boolean {
  return fs.existsSync(path.join(buildDir, name));
}

export function findOutputs(buildDir: string, suffix: string): string[] {
  const matches: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(suffix)) {
        matches.push(full);
      }
    }
  };
  walk(buildDir);
  return matches;
}
