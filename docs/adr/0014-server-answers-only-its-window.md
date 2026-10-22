# The app's server answers only its own window

The installed app serves its page and API from a local `Bun.serve`, as `bun dev` does. That server holds the family tree, and could delete or overwrite datasets, so nothing but the app's window gets in: not another machine on the network, and not a browser on this Mac, including one Electrobun hands the app's own URL to.

- **It listens on loopback only.** `hostname: '127.0.0.1'`; Bun's default is every interface. `bun dev` does the same, since it serves the same data.
- **A per-launch key, traded for a cookie.** Each launch makes a random key. The window opens on `/enter?key=…`, which sets it as an HttpOnly, `SameSite=Strict` cookie and redirects to the page the window was last left on, or `/`; every other request without that cookie gets a 403. The key never stays in a URL the page can push, copy or hand to the browser, and a cookie from an earlier launch no longer matches.

`bun dev` has no key: it's meant to be opened in a browser.

## Considered options

- **Loopback only.** Rejected on its own: any browser on the Mac, and any web page it has open, can still reach `127.0.0.1`.
- **Electrobun's `views://` scheme instead of a server.** Rejected: the dev and app entries would stop sharing one request path, and import progress streams over a long-lived HTTP response.
- **The key in every URL, or a header.** Rejected: an `<img>` or a navigation can't send a header, and a key in the URL leaks into history and anything that copies it.

## Consequences

- Opening the app's address in a browser gets a bare 403: a blank page, saying nothing about the app.
- Anything that needs the server from outside the window, such as a script, has to go through `bun dev`, pointed at the app's data with `SUKULINJA_DATA` if need be.
