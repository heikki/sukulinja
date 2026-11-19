Status: ready-for-agent

# The Scan viewer changes Volume through the picker

The Scan viewer's _Change Volume…_ (`scan-viewer/volumes.ts`) is still its own list of the source's Book, and only for a Church-book reference; with no source or a Citation made in the app there's no way to another Volume but back through the Volumes tab. Open the Volume picker instead, on the source's parish and series with its Book's years filled in, _Fits the reference_ on top where there is one, and from a scan with no source too. Opening a Volume there shows it, leaving a source's Link as it is, as `changeVolume` does now.
