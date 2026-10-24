# @vortex/phone — brief reader

A tiny phone web page that shows the briefs (title, key points, source link) your laptop sends you.
It connects directly to the local SpacetimeDB database `vortex-sync` and marks each new brief as received.

Run it: start SpacetimeDB on port 3100 and publish the module (`npm run db:publish -w @vortex/sync`), then `npm start -w @vortex/phone` and open http://localhost:8791 (or your laptop's LAN address / a tunnel to port 8791 on the phone). The server forwards SpacetimeDB through the same port.

Pairing: the page shows this phone's SpacetimeDB identity. Binding that identity to your account happens through the Vortex API/admin `bindDevice` call, which is not built yet.

FIXTURE disclaimer: during the demo, briefs may be sample (FIXTURE) data, not real captured content.
