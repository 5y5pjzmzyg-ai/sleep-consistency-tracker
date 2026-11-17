# Nightline · Sleep Consistency

A mobile-first, offline-capable sleep consistency tracker. The static app uses native ES modules, CSS, IndexedDB and a service worker. No package installation or build step is required. Publish the root of main with GitHub Pages. Relative asset paths work under the GitHub project path.

## Run locally

Serve the repository root with any static HTTP server. For example, run `python3 -m http.server 8000` and open `http://localhost:8000`. Run the model tests with `node --test`. HTTPS or localhost is required for offline support.

## Data rules

- A record uses the evening date in the configured time zone. The morning form defaults to the previous local calendar date. The 04:00 boundary assigns after-midnight bedtimes to the previous evening. No actual bedtimes are collected.
- Existing check-ins retain their target snapshot after schedule changes. Historical additions use the saved target history for that date.
- Alarm-free days carry no weight in the alarm rate and bridge alarm streaks without incrementing them. Missing dates and missing answers break a streak. Current streaks run through the last due sleep date.
- Settings → Export JSON saves a versioned copy of records and settings. Import validates the file. Merge keeps local copies of matching dates. Replace all restores the entire backup after confirmation.
- Data is stored in the current browser profile and does not sync. Keep a separate backup.
- When changing a cached shell asset, increment the service worker cache name in `sw.js`. Closing all app windows allows the updated worker to take control.
