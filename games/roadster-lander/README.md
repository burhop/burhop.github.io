# Roadster Lander

A standalone, buildless GitHub Pages game at `/games/roadster-lander/`, linked from the games index. White vector lunar scenery and instruments surround a full-color 3D Roadster. All runtime assets are local, including the model, Three.js and the Draco decoder. No runtime package installation or external CDN is required.

The startup screen uses a static front-quarter photograph from the user's steveCAD references. The interactive 3D vehicle appears when flight starts, with banking, altitude-based rotation and directional exhaust. Social and gallery previews use the photographic startup screen.

## Play locally

From the **repository root**:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Open <http://127.0.0.1:8080/games/roadster-lander/> in a WebGL2-capable desktop browser. Serve over HTTP; ES modules and model loading do not work from `file://`.

From this directory, `npm run serve` serves the game at <http://127.0.0.1:8080/> instead.

## Controls and rules

- Left/right arrows or A/D: thrust directly sideways. Release to coast; thrust in the opposite direction to brake.
- Up, W or Space: lift. Gravity continues to accelerate the car downward when lift is released.
- P or Esc: pause/resume. R: retry the current mission. M: synthesized sound on/off. F: fullscreen.
- Park the entire contact footprint inside the driveway at **≤4.5 m/s vertical** and **≤3 m/s horizontal** speed. Touching other terrain crashes the vehicle.
- Fuel is finite. Simultaneous lift and lateral thrust consume both engines' fuel. Empty tanks leave the vehicle coasting; a safe zero-fuel landing is still valid.
- Successful landings award a base score plus fuel and gentle-landing bonuses. Three driveway layouts cycle, becoming narrower up to a fixed minimum width. Best score is stored locally when storage is available.
- Landscape is required. Portrait windows show an overlay and pause flight. Returning to landscape requires an explicit resume. Losing window focus, hiding the tab, and opening credits also pause play and clear held keys.
- Touch controls are deferred. The input adapter returns only `{up, left, right}`, so pointer controls can later feed the same simulation without changing physics.

## Architecture and replacing the vehicle

- `js/physics.mjs`: independent, deterministic flight simulation in x/z coordinates; no DOM or rendering. Runs at 120 Hz. Lunar gravity is 1.62 m/s²; thrust and scale are tuned for an arcade game, not a Tesla engineering simulation.
- `js/game.mjs`: input, frame accumulator, canvas scenery, HUD, lifecycle, approach zoom, scoring and orientation handling.
- `js/vehicle.mjs`: Three.js asset adapter, studio reflections, presentation rotation, banking, and directional jet effects.
- `js/audio.mjs`: optional synthesized Web Audio effects, enabled only by user interaction.

For another car or a SpaceX/Blue Origin rocket:

1. Add an appropriately licensed GLB to `assets/` and record its author/license in `CREDITS.md` and the credits dialog.
2. Update `VEHICLE.url`, corrective Euler `rotation`, dimensions and nozzle placement in `js/vehicle.mjs`. Models are normalized by their longest horizontal dimension, centered in x/z and grounded at y=0. The corrected model must face +Z with +Y up. For a tall rocket, adjust the normalization to its vertical dimension and configure suitable nozzle anchors.
3. If the replacement needs a different physical footprint, update `PHYSICS.halfWidth` independently of its visual orientation. Adjust the driveway sizes accordingly.
4. Run the physics and browser checks and inspect the side/front views and exhaust attachments.

The car turns from side profile to front-facing as altitude falls from 145 m to 10 m above the driveway. The effect fades out when the vehicle is far from the driveway. The turn and acceleration bank are **visual only**; neither changes collision size, thrust direction, velocity or fuel. Approach contact-width guides show the fixed collision footprint while the visible car becomes narrower. Camera zoom also follows this approach progress.

The included model comes from the user's [2026 Roadster steveCAD document](https://stevecad.studio/?document=cb784919-1fe5-4a3a-a39d-a91fe59d781c), using its saved **Main R28** export. It preserves 39 named mesh parts and the snapshot's silver paint, bronze glazing, wheel and trim materials. Optimization reduced 1,465,428 triangles to 267,690, yielding a 1.08 MiB compressed GLB. This is an evolving exterior study; its source shapes determine the game's appearance. The live document may have advanced beyond this saved revision. See [CREDITS.md](CREDITS.md).

## Exporting an improved steveCAD model

The converter consumes a saved `render-assets.json` export with per-part STL meshes and SHA-256 checksums. An STL file alone does not contain these material assignments. Keep the manifest and its mesh files together; the script reads them without changing the CAD document or source files.

```powershell
npm ci
npm run build:model -- --manifest "path/to/export/render-assets.json"
# With the repository-root HTTP server running:
npm run capture:previews
npm test
npm run test:browser
```

The converter checks source hashes, uses split submeshes in place of their parent aggregates, preserves assembly placement, reduces the mesh with a bounded simplification error, rebuilds creased normals, and compresses the GLB with Draco. It rotates source front −X/up +Z to game front +Z/up +Y. `assets/roadster.source.json` records the document, revision, source hashes, named parts, conversion settings and output hash. The original CAD exports are not required to play the game or run its checks.

A future export must follow the same manifest schema and material/part naming conventions, or the adapter must be updated. After a major body-shape change, review the dimensions and nozzle anchors in `VEHICLE` and regenerate both previews.

## Social link previews

Share **https://burhop.github.io/games/roadster-lander/** after this directory is published through the repository's GitHub Pages workflow. The page declares Open Graph and X/Twitter large-image metadata directly in its HTML, including an absolute game URL and a public **1200 × 630 PNG** at `assets/social-preview.png`. Crawlers can read this information without executing the game. A supported platform's link card takes the reader to the game when clicked; the image itself is a static screenshot.

`npm run capture:previews` captures the actual title screen at social-card and games-gallery sizes. It uses the same `GAME_URL` and `CHROME_PATH` options as the browser checks. Regenerate these images when the vehicle or title screen changes. Platform presentation and caching vary; existing posts may retain an older preview until the platform fetches the URL again. Local changes must be published before a social service can fetch them. Metadata follows the [Open Graph protocol](https://ogp.me/).

## Verification

```powershell
# From games/roadster-lander:
npm ci
npm test
# Keep the repository-root HTTP server running in another terminal:
npm run test:browser
```

`npm test` checks ballistic motion, direct controls, fuel, timestep independence, driveway edges, terrain peaks, touchdown limits, score finalization and visual-only approach calculations. It also decodes the shipped model to validate provenance, parts, geometry, normals, orientation and materials, and checks the static social metadata and preview dimensions.

Browser checks use Playwright with installed Chrome on Windows; otherwise install Chromium with `npx playwright install chromium`. Set `CHROME_PATH` for another Chromium executable or `GAME_URL` for a different server address. They test the actual model and decoder, controls, pause/focus/orientation, successful and failed landings, retry, next mission, credits, narrow landscape layout and stored best score. Screenshots are written to ignored `test-results/` for inspection. Browser fixtures place the vehicle near touchdown so the full simulation/UI path can be checked deterministically.

The visual style and gameplay reference is [Atari's 1979 operator manual](https://www.crazykong.com/manuals/LunarLander.man.pdf). The flight code, scenery and interface are original; no original ROM, terrain, code, music or artwork was copied. This game intentionally changes the original rotation-based controls to direct lateral thrust.
