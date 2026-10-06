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
      'src/client/styles.css': 'views/app/styles.css',
      // The demo dataset an installed app starts with — see seedDemo in
      // src/server/index.ts.
      'data/bourbon': 'demo/bourbon',
      'data/NOTICE.md': 'demo/NOTICE.md'
    },

    mac: {
      defaultRenderer: 'native',
      icons: 'resources/icon.iconset',
      // install:app copies the .app bundle straight to /Applications, so the
      // disk image a stable build would otherwise wrap it in is never used.
      createDmg: false,

      // Signing runs for stable builds only; a dev build is never signed,
      // whatever this says, so the signed path is `bun run install:app`. The
      // identity comes from ELECTROBUN_DEVELOPER_ID, defaulted in that script
      // to the self-signed one `bun run cert --create` makes.
      //
      // notarize stays false because that needs a real Developer ID
      // certificate; ours is the self-signed local identity.
      codesign: true,
      notarize: false,
      entitlements: {
        // Bun's runtime JITs, so the hardened runtime needs both of these or
        // the signed `bun` process is killed on launch.
        'com.apple.security.cs.allow-jit': true,
        'com.apple.security.cs.allow-unsigned-executable-memory': true
      }
    }
  }
} satisfies ElectrobunConfig;
