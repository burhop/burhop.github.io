/**
 * sprite-loader.js
 * Loads sprite images and removes the background using a BFS flood-fill
 * from the 4 corners. Only pixels CONNECTED to the image edge that match
 * the background colour are made transparent — internal bright areas of
 * the character are left untouched.
 */
const SpriteLoader = {
  load(src, { tolerance = 80, feather = 1.6 } = {}) {
    const canvas  = document.createElement('canvas');
    const ctx     = canvas.getContext('2d', { willReadFrequently: true });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const img = new Image();
    img.onload = () => {
      canvas.width  = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const w = canvas.width, h = canvas.height;
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;

      // ── Detect background colour from image corners ────────────
      const samplePts = [
        [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
        [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1],
        [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)]
      ];
      let bgR = 0, bgG = 0, bgB = 0;
      samplePts.forEach(([x, y]) => {
        const i = (y * w + x) * 4;
        bgR += d[i]; bgG += d[i + 1]; bgB += d[i + 2];
      });
      bgR /= samplePts.length;
      bgG /= samplePts.length;
      bgB /= samplePts.length;

      const featherRange = tolerance * (feather - 1);

      const colorDist = (i) => {
        const dr = d[i]     - bgR;
        const dg = d[i + 1] - bgG;
        const db = d[i + 2] - bgB;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };

      // ── BFS flood fill from all 4 corners ─────────────────────
      // Only pixels reachable from a corner AND matching bg colour
      // will be marked — character interior whites are safe.
      const marked = new Uint8Array(w * h); // 1 = visited background
      const queue  = new Int32Array(w * h); // flat pixel indices
      let qHead = 0, qTail = 0;

      const enqueue = (idx) => {
        if (marked[idx]) return;
        marked[idx] = 1;
        queue[qTail++] = idx;
      };

      // Seed the 4 corners
      enqueue(0);
      enqueue(w - 1);
      enqueue((h - 1) * w);
      enqueue((h - 1) * w + w - 1);

      while (qHead < qTail) {
        const idx = queue[qHead++];
        const dist = colorDist(idx * 4);

        // Only spread if this pixel is within reach of bg colour
        if (dist >= tolerance + featherRange) continue;

        const x = idx % w;
        const y = (idx - x) / w;

        if (x > 0)     enqueue(idx - 1);
        if (x < w - 1) enqueue(idx + 1);
        if (y > 0)     enqueue(idx - w);
        if (y < h - 1) enqueue(idx + w);
      }

      // ── Apply transparency to all marked pixels ────────────────
      for (let idx = 0; idx < w * h; idx++) {
        if (!marked[idx]) continue;
        const i    = idx * 4;
        const dist = colorDist(i);

        if (dist < tolerance) {
          d[i + 3] = 0;                                      // fully transparent
        } else if (dist < tolerance + featherRange) {
          const t = (dist - tolerance) / featherRange;
          d[i + 3] = Math.round(d[i + 3] * t * t);          // smooth feather
        }
      }

      ctx.putImageData(imageData, 0, 0);
      texture.image     = canvas;
      texture.needsUpdate = true;
    };

    img.src = src;
    return texture;
  }
};
