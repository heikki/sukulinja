import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ElectrobunConfig } from 'electrobun';

const baseDir = resolve('.');

function resolveWithExtensions(basePath: string): string {
  for (const ext of ['.ts', '.tsx', '.js', '/index.ts', '/index.js']) {
    const candidate = basePath + ext;
    if (existsSync(candidate)) return candidate;
  }
  return basePath;
}

const ALIASES: Array<{ prefix: string; target: string }> = [
  { prefix: '@common/', target: 'src/common' },
  { prefix: '@components/', target: 'src/client/components' },
  { prefix: '@client/', target: 'src/client' },
  { prefix: '@server/', target: 'src/server' }
];

const pathAliasPlugin = {
  name: 'tsconfig-paths',
  setup(build: {
    onResolve: (
      opts: { filter: RegExp },
      cb: (args: { path: string }) => { path: string }
    ) => void;
  }) {
    for (const { prefix, target } of ALIASES) {
      const filter = new RegExp(`^${prefix.replace('/', '\\/')}`);
      build.onResolve(
        { filter },
        (args: { path: string }): { path: string } => ({
          path: resolveWithExtensions(
            resolve(baseDir, target, args.path.replace(prefix, ''))
          )
        })
      );
    }
  }
};

export default {
  app: {
    name: 'Sukulinjat',
    identifier: 'com.sukulinjat.app',
    version: '0.1.0'
  },

  runtime: {
    exitOnLastWindowClosed: true
  },

  build: {
    bun: {
      entrypoint: 'src/server/index.ts',
      plugins: [pathAliasPlugin]
    },

    views: {
      app: {
        entrypoint: 'src/client/index.ts',
        plugins: [pathAliasPlugin]
      }
    },

    copy: {
      'src/client/index.html': 'views/app/index.html',
      'src/client/styles.css': 'views/app/styles.css'
    },

    mac: {
      defaultRenderer: 'native',
      createDmg: false
    }
  }
} satisfies ElectrobunConfig;
