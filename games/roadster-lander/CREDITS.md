# Assets and credits

## Roadster

- **Title:** 2026 Roadster exterior study.
- **Creator:** User-authored model developed in steveCAD.
- **Document:** <https://stevecad.studio/?document=cb784919-1fe5-4a3a-a39d-a91fe59d781c>.
- **Snapshot:** Saved Main R28 export, native build `dd5438d9-ae89-4f3b-b14d-d7314e3beef4`.
- **File:** `assets/roadster.glb`, generated from the snapshot's per-part STL exports by `scripts/build-roadster.mjs`.
- **Provenance:** `assets/roadster.source.json` records source checksums, revision, all 39 named mesh parts, conversion settings and the final GLB checksum.
- **Game adaptations:** Mesh reduction, normals, axis conversion, PBR materials following the snapshot's silver paint and opaque bronze glazing, Draco compression, normalization and added rocket nozzles/plumes.
- **Startup photograph:** `assets/roadster-photo.png` is the front-quarter reference image supplied for the steveCAD project (original SHA-256 `c023af21d00b1d81f8a68dd3838655b5ea20b7dcf0d6e442b4b458a1ae604df1`). The source photograph is preserved unchanged, with edge fading applied by CSS. The source upload did not identify a photographer or license; no ownership or open license is asserted for this image.
- **Previews:** `assets/preview.png` and `assets/social-preview.png` are screenshots of the photographic title screen with original game scenery and interface.

The game uses a saved export of the supplied document. The live document may contain later changes. This evolving exterior study is based on reference imagery and is not verified production CAD. Tesla and Roadster identify the subject of an independent fan game.

## Renderer and decoder

- Three.js **0.170.0**, Copyright © 2010–2024 Three.js authors, MIT. Files vendored from the published npm package at <https://cdn.jsdelivr.net/npm/three@0.170.0/>. License: `vendor/three/LICENSE`. The GLTFLoader import path for BufferGeometryUtils was changed to match this local directory layout; other library files are unchanged.
- Draco decoder distributed with Three.js 0.170.0, Google Draco authors, Apache 2.0. License: `vendor/three/DRACO-LICENSE`. Project: <https://github.com/google/draco>.
- RoomEnvironment originates from Google's model-viewer environment scene, as credited in the vendored file.

## Development tools

These packages are used for conversion, screenshots or checks. They are not runtime dependencies of the game:

- glTF Transform **4.2.1**, MIT: <https://github.com/donmccurdy/glTF-Transform>.
- meshoptimizer **0.25.0**, MIT: <https://github.com/zeux/meshoptimizer>.
- draco3d **1.5.7**, Apache 2.0: <https://github.com/google/draco>.
- Playwright **1.56.1**, Apache 2.0: <https://github.com/microsoft/playwright>.

## Game and reference

Original game code, line art and synthesized sound are covered by the repository's GPL-3.0 license; the separately credited assets retain their own licenses.

Gameplay inspiration: Atari Lunar Lander (1979). Reference: [operator manual](https://www.crazykong.com/manuals/LunarLander.man.pdf). No Atari ROM, game code, audio or artwork is included. Not affiliated with Tesla, SpaceX, Blue Origin or Atari.
