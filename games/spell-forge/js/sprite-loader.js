/**
 * sprite-loader.js  v3
 * BFS flood-fill background removal with conservative tolerance (35).
 * Starts from image corners and only removes pixels CONNECTED to the
 * border that are close to the detected background color.
 * Low tolerance = stops at character edges without eating into the character.
 */
const SpriteLoader = {
  load(src, { tolerance = 35, feather = 20 } = {}) {
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

      // ── Sample perimeter pixels to detect background color ─────
      let bgR = 0, bgG = 0, bgB = 0, n = 0;
      const step = Math.max(1, Math.floor(Math.min(w, h) / 16));
      for (let x = 0; x < w; x += step) {
        let i = x * 4;                  bgR+=d[i];bgG+=d[i+1];bgB+=d[i+2];n++;
        i = ((h-1)*w+x)*4;              bgR+=d[i];bgG+=d[i+1];bgB+=d[i+2];n++;
      }
      for (let y = step; y < h-step; y += step) {
        let i = y*w*4;                  bgR+=d[i];bgG+=d[i+1];bgB+=d[i+2];n++;
        i = (y*w+(w-1))*4;              bgR+=d[i];bgG+=d[i+1];bgB+=d[i+2];n++;
      }
      bgR/=n; bgG/=n; bgB/=n;

      const dist = (i) => {
        const dr=d[i]-bgR, dg=d[i+1]-bgG, db=d[i+2]-bgB;
        return Math.sqrt(dr*dr+dg*dg+db*db);
      };

      // ── BFS from 4 corners ─────────────────────────────────────
      const marked = new Uint8Array(w * h);
      const queue  = new Int32Array(w * h);
      let qH = 0, qT = 0;
      const enq = (idx) => { if (!marked[idx]) { marked[idx]=1; queue[qT++]=idx; } };
      enq(0); enq(w-1); enq((h-1)*w); enq((h-1)*w+w-1);

      while (qH < qT) {
        const idx = queue[qH++];
        if (dist(idx*4) >= tolerance + feather) continue; // too different from bg, stop
        const x = idx % w, y = (idx-x)/w;
        if (x > 0)     enq(idx-1);
        if (x < w-1)   enq(idx+1);
        if (y > 0)     enq(idx-w);
        if (y < h-1)   enq(idx+w);
      }

      // ── Apply transparency ─────────────────────────────────────
      for (let idx = 0; idx < w*h; idx++) {
        if (!marked[idx]) continue;
        const i = idx*4, dt = dist(i);
        if (dt < tolerance) {
          d[i+3] = 0;                                   // fully transparent
        } else if (dt < tolerance + feather) {
          const t = (dt - tolerance) / feather;
          d[i+3] = Math.round(d[i+3] * t * t);          // quadratic feather
        }
      }

      ctx.putImageData(imageData, 0, 0);
      texture.image = canvas;
      texture.needsUpdate = true;
    };
    img.src = src;
    return texture;
  }
};
