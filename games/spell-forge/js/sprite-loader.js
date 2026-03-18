/**
 * sprite-loader.js
 * Loads sprite images and automatically strips the background colour
 * by sampling the image corners, regardless of whether the background
 * is white, black, or any shade of grey.
 *
 * Returns a THREE.CanvasTexture that is updated once the image loads.
 * Use with THREE.NormalBlending (not AdditiveBlending) for correct rendering.
 */
const SpriteLoader = {
  /**
   * @param {string} src         - Path to the image file
   * @param {object} opts
   *   tolerance {number}        - Colour-distance threshold for background removal (default 55)
   *   feather   {number}        - Multiplier beyond tolerance over which to feather edges (default 1.8)
   */
  load(src, { tolerance = 55, feather = 1.8 } = {}) {
    const canvas  = document.createElement('canvas');
    // willReadFrequently avoids GPU readback penalty in Chrome
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

      // ── Detect background colour from border pixels ────────────
      // Sample the perimeter (all 4 edges) in steps, average the result.
      // This is far more robust than just 4 corners.
      const sampleStep = Math.max(1, Math.floor(Math.min(w, h) / 20));
      let bgR = 0, bgG = 0, bgB = 0, sampleCount = 0;

      const sample = (x, y) => {
        const i = (y * w + x) * 4;
        bgR += d[i]; bgG += d[i + 1]; bgB += d[i + 2];
        sampleCount++;
      };

      // Top and bottom rows
      for (let x = 0; x < w; x += sampleStep) { sample(x, 0); sample(x, h - 1); }
      // Left and right columns (skip corners already sampled)
      for (let y = sampleStep; y < h - sampleStep; y += sampleStep) { sample(0, y); sample(w - 1, y); }

      bgR /= sampleCount; bgG /= sampleCount; bgB /= sampleCount;

      // ── Remove pixels close to the detected background colour ──
      const featherRange = tolerance * (feather - 1);

      for (let i = 0; i < d.length; i += 4) {
        const dr   = d[i]     - bgR;
        const dg   = d[i + 1] - bgG;
        const db   = d[i + 2] - bgB;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);

        if (dist < tolerance) {
          d[i + 3] = 0;                                              // fully transparent
        } else if (dist < tolerance + featherRange) {
          const t = (dist - tolerance) / featherRange;
          d[i + 3] = Math.round(255 * t * t);                       // smooth quadratic feather
        }
        // else: keep original alpha intact
      }

      ctx.putImageData(imageData, 0, 0);
      texture.image = canvas;
      texture.needsUpdate = true;
    };
    img.src = src;
    return texture;
  }
};
