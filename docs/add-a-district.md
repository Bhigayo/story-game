# Adding the City Centre (or any district)

1. Open https://overpass-turbo.eu and paste this query, then press Run:

```
[out:json][timeout:90];
(
  way["highway"](52.4750,-1.9050,52.4850,-1.8880);
  way["building"](52.4750,-1.9050,52.4850,-1.8880);
);
out geom;
```

2. Export > GeoJSON > download. Same steps you used for Digbeth.
3. Save it as `public/data/centre.geojson`.
4. Restart the server and the game. The server switches the district on when the file exists,
   so Bullring, Selfridges, New Street and the rest become places you can ride to.

The box covers Bullring, Selfridges, New Street, Grand Central, Moor Street and Bull Street.
If it is too heavy to run smoothly, shrink the box. Every district file must use the same centre
as Digbeth (set in `src/world/geo.ts` and `server/transport.mjs`), which the files do automatically.
New districts are listed in `src/world/districts.ts` (client) and `DISTRICTS` in `server/transport.mjs` (server).


## Digbeth (bigger file)
The Digbeth file was widened to cover Digbeth High Street out to Warwick Bar and Camp Hill. Query used:

```
[out:json][timeout:120];
(
  way["highway"](52.4700,-1.8900,52.4790,-1.8680);
  way["building"](52.4700,-1.8900,52.4790,-1.8680);
  way["waterway"](52.4700,-1.8900,52.4790,-1.8680);
  way["railway"](52.4700,-1.8900,52.4790,-1.8680);
  way["landuse"](52.4700,-1.8900,52.4790,-1.8680);
  way["leisure"](52.4700,-1.8900,52.4790,-1.8680);
  way["natural"](52.4700,-1.8900,52.4790,-1.8680);
);
out geom;
```
The server works out Digbeth's playable area from the buildings in the file, so a bigger or smaller file just works.
