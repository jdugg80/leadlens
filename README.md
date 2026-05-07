# LeadLens Restore Quick Search Patch

This patch restores Quick Search to the older, more effective search flow.

## Why

A later patch wired the Quick Search button to:

```js
runNearbyBusinessSearch
```

That helper is safer/fallback-oriented, but not as aggressive as your original:

```js
searchNearby -> runNearbySearch
```

This patch changes Quick Search back to:

```js
onPress={searchNearby}
```

It also fixes:

```js
{false && showNearby && safeNearbyPlaces.map(...)}
```

so nearby pins can actually render.

## Install

Extract into your project root:

```txt
C:\Projects\03-BusinessApps\leadlens
```

Then run:

```bash
cd C:\Projects\03-BusinessApps\leadlens
node scripts\patch-restore-quick-search.js
npx expo start -c
```

## Test

Tap:

```txt
Search nearby -> Quick Search
```

Watch for:

```txt
[TerritoryMapScreen] Original Quick Search path starting
```

If you see that, Quick Search is using the original better pipeline again.

## Google Cloud reminder

For the original Google Nearby Search flow to work, your API key/project needs:

```txt
Maps SDK for Android
Places API
Places API (New)
```

If Places is blocked, the old flow will return poor results or `REQUEST_DENIED`.
