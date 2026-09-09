# TrackRecord

MusicStats explorer hosted at https://ariallen.com/trackrecord/ through this repository's existing GitHub Pages deployment (main, repository root).

The browser loads `out/ranked.csv` and `out/albums.csv` directly. No Python server is needed to view it. The published listening statistics are public, like the rest of the website. Raw source exports, credentials, and Python environment files are not included.

This is the existing local MusicStats export generated June 11, 2026; it does not automatically ingest new listening activity. Refresh reloads the published snapshot.

## Updating the data

Regenerate the exports using the MusicStats pipeline, then copy `out/ranked.csv` and `out/albums.csv` into this directory's `out/` folder and commit/push those files to main. The source project on this Mac is `/Users/ariallen/arisbrain/arisbrain/music-stats`.

## Spotify playlists

In the Spotify developer app settings, add this exact redirect URI:

https://ariallen.com/trackrecord/

Then open the hosted explorer, click the Spotify status pill, and enter the app's client ID. Browser-based PKCE handles login without a client secret. The hosted origin has separate browser storage from localhost, so local login state does not carry over.
