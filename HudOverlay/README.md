# Mars EVA visor HUD

Start the repository's local server from the repository root:

```sh
node server.js
```

Open `http://127.0.0.1:8080/HudOverlay/`. The page uses a JPG as a static camera-view background, with a Leaflet Mars map and HUD panels overlaid. Use the toolbar to switch the background image or move the map between sides. Open **HUD操作** to show or hide each panel and adjust the HUD panel transparency.

The map reads A/B coordinates from the root `data.json` API and listens for waypoint, sector, oxygen, and communications updates from the existing apps. HUD visibility, transparency, map side, and background choice are saved in the browser. The safe route and terrain are simulated and are not suitable for real navigation.
