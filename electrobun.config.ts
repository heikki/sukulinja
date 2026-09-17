import type { ElectrobunConfig } from 'electrobun';

export default {
  app: {
    name: 'Sukulinja',
    identifier: 'com.sukulinja.app',
    version: '0.1.0'
  },

  runtime: {
    exitOnLastWindowClosed: true
  },

  build: {
    // Not the 2.x default of 'cottontail': the server process serves the client
    // from Bun.serve with a raised idleTimeout (src/server/index.ts) and talks
    // to bun:sqlite, so it is not portable JavaScript. Electrobun packages its
    // own pinned Bun for this — see docs/adr/0007.
    mainProcess: 'bun',

    bun: {
      entrypoint: 'src/server/index.ts'
    },

    views: {
      app: {
        entrypoint: 'src/client/index.ts'
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
