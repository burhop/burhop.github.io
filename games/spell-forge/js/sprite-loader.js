/**
 * sprite-loader.js  v4
 *
 * Key fixes:
 * 1. Uses THREE.Texture() (not CanvasTexture) so Three.js doesn't try to
 *    upload an empty 0x0 canvas immediately on construction.
 * 2. Caches the texture per src path — all sprites of the same type share
 *    one texture object, so they ALL update at the same time when the image
 *    loads, eliminating "some show, some don't" behaviour.
 * 3. BFS background removal with conservative tolerance=35.
 */
const SpriteLoader = {
  _cache: {},

  load(src, { tolerance = 35, feather = 20 } = {}) {
    // ── Return cached texture immediately if we've seen this image ──
    if (this._cache[src]) return this._cache[src];

    // ── Create an empty placeholder texture ──────────────────────
    // THREE.Texture (not CanvasTexture) avoids the bad 0×0 initial upload.
    const texture = new THREE.Texture();
    texture.colorSpace = THREE.SRGBColorSpace;
    this._cache[src] = texture;   // cache BEFORE async load starts

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx    = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width  = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const w = canvas.width, h = canvas.height;
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;

      // ── Perimeter sampling to detect background colour ───────
      let bgR = 0, bgG = 0, bgB = 0, n = 0;
      const step = Math.max(1, Math.floor(Math.min(w, h) / 16));
      for (let x = 0; x < w; x += step) {
        let i = x * 4;            bgR+=d[i]; bgG+=d[i+1]; bgB+=d[i+2]; n++;
        i = ((h-1)*w+x)*4;       bgR+=d[i]; bgG+=d[i+1]; bgB+=d[i+2]; n++;
      }
      for (let y = step; y < h-step; y += step) {
        let i = y*w*4;            bgR+=d[i]; bgG+=d[i+1]; bgB+=d[i+2]; n++;
        i = (y*w+(w-1))*4;       bgR+=d[i]; bgG+=d[i+1]; bgB+=d[i+2]; n++;
      }
      bgR /= n; bgG /= n; bgB /= n;

      const dist = (i) => {
        const dr=d[i]-bgR, dg=d[i+1]-bgG, db=d[i+2]-bgB;
        return Math.sqrt(dr*dr + dg*dg + db*db);
      };

      // ── BFS flood-fill from 4 corners ───────────────────────
      const marked = new Uint8Array(w * h);
      const queue  = new Int32Array(w * h);
      let qH = 0, qT = 0;
      const enq = (idx) => { if (!marked[idx]) { marked[idx]=1; queue[qT++]=idx; } };
      enq(0); enq(w-1); enq((h-1)*w); enq((h-1)*w + w-1);

      while (qH < qT) {
        const idx = queue[qH++];
        if (dist(idx * 4) >= tolerance + feather) continue;
        const x = idx % w, y = (idx - x) / w;
        if (x > 0)     enq(idx - 1);
        if (x < w-1)   enq(idx + 1);
        if (y > 0)     enq(idx - w);
        if (y < h-1)   enq(idx + w);
      }

      // ── Apply transparency to marked pixels ──────────────────
      for (let idx = 0; idx < w * h; idx++) {
        if (!marked[idx]) continue;
        const i  = idx * 4;
        const dt = dist(i);
        if (dt < tolerance) {
          d[i+3] = 0;
        } else if (dt < tolerance + feather) {
          const t = (dt - tolerance) / feather;
          d[i+3] = Math.round(d[i+3] * t * t);
        }
      }

      ctx.putImageData(imageData, 0, 0);

      // ── Update the shared cached texture ─────────────────────
      texture.image       = canvas;
      texture.needsUpdate = true;
    };

    img.src = src;
    return texture;
  },

  /** Return a horizontally-flipped copy of a texture loaded via load(). */
  loadFlipped(src, opts) {
    const cacheKey = src + '__flip';
    if (this._cache[cacheKey]) return this._cache[cacheKey];

    const texture = new THREE.Texture();
    texture.colorSpace = THREE.SRGBColorSpace;
    this._cache[cacheKey] = texture;

    // Load the original first, then flip its canvas
    const origTex = this.load(src, opts);
    const waitForOrig = () => {
      if (!origTex.image || !origTex.image.width) {
        requestAnimationFrame(waitForOrig);
        return;
      }
      const srcCanvas = origTex.image;
      const w = srcCanvas.width, h = srcCanvas.height;
      const flipCanvas = document.createElement('canvas');
      flipCanvas.width = w; flipCanvas.height = h;
      const ctx = flipCanvas.getContext('2d');
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(srcCanvas, 0, 0);
      texture.image = flipCanvas;
      texture.needsUpdate = true;
    };
    requestAnimationFrame(waitForOrig);
    return texture;
  }
};
