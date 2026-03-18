/* gestures.js — Mouse gesture capture & recognition */
const Gestures = {
  points: [],
  recording: false,
  canvas: null,
  ctx: null,
  onGesture: null,

  init(canvas, callback) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onGesture = callback;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (typeof Game !== 'undefined' && Game.state !== 'PLAYING') return;
      e.preventDefault();
      this.startRecording(e.clientX, e.clientY);
    }, { passive: false });

    window.addEventListener('mousemove', (e) => {
      if (!this.recording) return;
      this.addPoint(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.recording) return;
      this.stopRecording();
    });

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
      if (typeof Game !== 'undefined' && Game.state !== 'PLAYING') return;
      e.preventDefault();
      const t = e.touches[0];
      this.startRecording(t.clientX, t.clientY);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (!this.recording) return;
      e.preventDefault();
      const t = e.touches[0];
      this.addPoint(t.clientX, t.clientY);
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      if (!this.recording) return;
      this.stopRecording();
    });
  },

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  startRecording(x, y) {
    this.recording = true;
    this.points = [{ x, y }];
    this.clearCanvas();
  },

  addPoint(x, y) {
    const last = this.points[this.points.length - 1];
    const dx = x - last.x, dy = y - last.y;
    if (dx * dx + dy * dy < 9) return; // Minimum movement
    this.points.push({ x, y });
    this.drawTrail();
  },

  stopRecording() {
    this.recording = false;
    const gesture = this.recognize();
    this.clearCanvas();
    if (gesture && this.onGesture) {
      this.onGesture(gesture);
    }
    this.points = [];
  },

  recognize() {
    const pts = this.points;
    if (pts.length < 6) return null;

    const first = pts[0];
    const last = pts[pts.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const netDist = Math.sqrt(dx * dx + dy * dy);

    // Total path length
    let pathLen = 0;
    for (let i = 1; i < pts.length; i++) {
      pathLen += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    }
    if (pathLen < 30) return null;

    const bounds = this.getBounds(pts);
    const boundsDiag = Math.hypot(bounds.w, bounds.h);

    // CIRCLE: path curves back on itself  
    const closeness = netDist / pathLen;
    if (closeness < 0.35 && pathLen > 80 && boundsDiag > 40) {
      // Check it's not a zigzag
      const xChanges = this.countDirectionChanges(pts, 'x');
      if (xChanges <= 3 && bounds.w > 30 && bounds.h > 30) {
        return 'CIRCLE';
      }
    }

    // ZIGZAG: multiple X direction reversals
    const xChanges = this.countDirectionChanges(pts, 'x');
    const yChanges = this.countDirectionChanges(pts, 'y');
    if (xChanges >= 3 && bounds.w > 40 && bounds.h > 20) {
      return 'ZIGZAG';
    }

    // LINE_UP: net upward movement (negative dy in screen space)
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (dy < -50 && ady > adx * 1.2 && ady / pathLen > 0.45) {
      return 'LINE_UP';
    }

    // LINE_DOWN: net downward movement
    if (dy > 50 && ady > adx * 1.2 && ady / pathLen > 0.45) {
      return 'LINE_DOWN';
    }

    // LINE_LEFT: horizontal left
    if (dx < -50 && adx > ady * 1.2 && adx / pathLen > 0.45) {
      return 'LINE_LEFT';
    }

    // LINE_RIGHT: horizontal right
    if (dx > 50 && adx > ady * 1.2 && adx / pathLen > 0.45) {
      return 'LINE_RIGHT';
    }

    // SPIRAL: long path in a contained area (more path than a circle expects)
    if (pathLen > 150 && boundsDiag > 40 && closeness < 0.5) {
      return 'SPIRAL';
    }

    return null;
  },

  countDirectionChanges(pts, axis) {
    let changes = 0, lastDir = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i][axis] - pts[i-1][axis];
      if (Math.abs(d) > 4) {
        const dir = Math.sign(d);
        if (lastDir !== 0 && dir !== lastDir) changes++;
        lastDir = dir;
      }
    }
    return changes;
  },

  getBounds(pts) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { w: maxX - minX, h: maxY - minY };
  },

  drawTrail() {
    const ctx = this.ctx;
    const pts = this.points;
    if (pts.length < 2) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Gradient trail
    for (let i = 1; i < pts.length; i++) {
      const t = i / pts.length;
      const alpha = t * 0.9;
      const hue = 270 + t * 60; // Purple to pink
      ctx.beginPath();
      ctx.moveTo(pts[i-1].x, pts[i-1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${alpha})`;
      ctx.lineWidth = 4 - t * 2;
      ctx.lineCap = 'round';
      ctx.shadowColor = `hsl(${hue}, 90%, 65%)`;
      ctx.shadowBlur = 12;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Dot at current point
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(250,204,21,0.9)';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;
  },

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
};
