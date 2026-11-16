# <img src="resources/icon.iconset/icon_128x128.png" alt="" width="40" align="top">&ensp;Sukulinja

DIY genealogy editor, early prototype — currently an hourglass family tree chart for GEDCOM files, with portraits.

Portraits come packed with the GEDCOM in a GEDZIP (`.gdz`), or are downloaded from a MyHeritage export.

Includes a House of Bourbon demo dataset.

![Sukulinja](screenshot.png)

## Setup

Requires [Bun](https://bun.sh/). `bun dev` runs wherever Bun does; the desktop
app is so far built and tested on macOS only. Its code keeps macOS-only calls
behind a platform check, but there is no Windows or Linux build yet.

```bash
bun install
bun dev       # serve the app in a browser
```

To build and install to `/Applications` (macOS):

```bash
brew install openssl   # one-time
bun cert --create      # one-time: create a self-signed code-signing cert
bun install:app        # build, sign, and copy to /Applications
```

Signing asks Apple's server for a timestamp. If it can't be reached, the rest
of the build is signed without one, which a self-signed local build doesn't
need. When you already know you're offline, skip the wait with
`SIGN_TIMESTAMP=none bun install:app`.
