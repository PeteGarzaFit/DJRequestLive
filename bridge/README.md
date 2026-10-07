# DJ Request Live Bridge

Local desktop bridge for SI DJ LIVE LINK. It runs on the DJ computer and exposes now-playing data only on 127.0.0.1:8765.

## VirtualDJ
Install/enable VirtualDJ's Network Control plugin, set its local port/password if desired, copy config.example.json to config.json, then run `npm run bridge`. The bridge polls the master deck every 2 seconds and exposes artist, title, BPM, key, genre and elapsed time.

## Rekordbox
The bridge includes a configurable history-file adapter. Set `source` to `rekordbox-history` and provide a history file path. This is a first-step history connector, not a claim of real-time deck access.

## Security
The bridge binds to 127.0.0.1 and does not send DJ credentials to DJ Request Live. The browser reads the local feed and uses it as SI DJ context.

## Roadmap
VirtualDJ live -> Rekordbox live -> Serato -> richer deck state -> recent-set intelligence.
