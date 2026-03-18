/* particles.js — Enhanced particle system with spell trails */
const Particles = {
  systems: [],
  trails: [],   // continuous per-projectile trails
  scene: null,

  init(scene) {
    this.scene = scene;
  },

  // ── BURST ──────────────────────────────────────────────────
  burst(position, color, count, speed, lifetime = 0.9) {
    const geo = new THREE.BufferGeometry();
    const positions  = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i*3]   = position.x;
      positions[i*3+1] = position.y + 0.5;
      positions[i*3+2] = position.z;

      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.4 + Math.random() * 0.6);
      velocities[i*3]   = Math.sin(phi) * Math.cos(theta) * s;
      velocities[i*3+1] = Math.abs(Math.cos(phi)) * s * 0.9 + 1;
      velocities[i*3+2] = Math.sin(phi) * Math.sin(theta) * s;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size: 0.28, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.systems.push({ pts, velocities, age: 0, lifetime, isAmbient: false, isLine: false });
  },

  // ── SHOCKWAVE RING ──────────────────────────────────────────
  ring(position, color, radius = 4) {
    const pts = 64;
    const positions = [];
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      positions.push(new THREE.Vector3(Math.cos(a) * 0.01, 0.05, Math.sin(a) * 0.01));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(positions);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const line = new THREE.LineLoop(geo, mat);
    line.position.copy(position);
    line.position.y = 0.1;
    this.scene.add(line);
    this.systems.push({ isLine: true, isRing: true, points: line, age: 0, lifetime: 0.5, maxRadius: radius });
  },

  // ── LIGHTNING ARC ──────────────────────────────────────────
  lightning(from, to, color) {
    const segs = 10;
    const pts  = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const jitter = i > 0 && i < segs ? 1.5 : 0;
      pts.push(new THREE.Vector3(
        from.x + (to.x - from.x) * t + (Math.random() - 0.5) * jitter,
        from.y + (to.y - from.y) * t + (Math.random() - 0.5) * jitter * 0.5,
        from.z + (to.z - from.z) * t + (Math.random() - 0.5) * jitter
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.systems.push({ isLine: true, isRing: false, points: line, age: 0, lifetime: 0.35 });

    // Secondary thinner arc
    const pts2 = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts2.push(new THREE.Vector3(
        from.x + (to.x - from.x) * t + (Math.random() - 0.5) * 2.5,
        from.y + (to.y - from.y) * t + (Math.random() - 0.5) * 1,
        from.z + (to.z - from.z) * t + (Math.random() - 0.5) * 2.5
      ));
    }
    const geo2 = new THREE.BufferGeometry().setFromPoints(pts2);
    const mat2 = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
    const line2 = new THREE.Line(geo2, mat2);
    this.scene.add(line2);
    this.systems.push({ isLine: true, isRing: false, points: line2, age: 0, lifetime: 0.25 });

    this.burst(to, color, 50, 5);
    this.ring(to, color, 3);
  },

  // ── SPELL MUZZLE FLASH ─────────────────────────────────────
  muzzle(position, color) {
    this.burst(position, color, 40, 6, 0.4);
    this.ring(position, color, 2.5);
  },

  // ── AMBIENT FLOATING MOTES ─────────────────────────────────
  createAmbient(count) {
    const geo = new THREE.BufferGeometry();
    const positions  = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 22;
      positions[i*3]   = Math.cos(angle) * r;
      positions[i*3+1] = Math.random() * 12;
      positions[i*3+2] = Math.sin(angle) * r;
      velocities[i*3]   = (Math.random() - 0.5) * 0.4;
      velocities[i*3+1] = 0.15 + Math.random() * 0.25;
      velocities[i*3+2] = (Math.random() - 0.5) * 0.4;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x7c3aed, size: 0.12, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.systems.push({ pts, velocities, age: 0, lifetime: Infinity, isAmbient: true, isLine: false });
  },

  // ── CONTINUOUS TRAIL on a Projectile ──────────────────────
  startTrail(projectile, color) {
    this.trails.push({ projectile, color, timer: 0 });
  },

  stopTrail(projectile) {
    this.trails = this.trails.filter(t => t.projectile !== projectile);
  },

  // ── UPDATE ─────────────────────────────────────────────────
  update(delta) {
    // Emit trail particles
    for (const trail of this.trails) {
      if (!trail.projectile.active) { this.stopTrail(trail.projectile); continue; }
      trail.timer -= delta;
      if (trail.timer <= 0) {
        trail.timer = 0.04;
        this.burst(trail.projectile.mesh.position, trail.color, 6, 1.5, 0.35);
      }
    }

    // Process systems
    this.systems = this.systems.filter(sys => {
      sys.age += delta;

      if (sys.isLine) {
        const t = sys.age / sys.lifetime;
        sys.points.material.opacity = Math.max(0, 1 - t);
        if (sys.isRing) {
          const r = sys.maxRadius * t;
          const posArr = sys.points.geometry.attributes.position.array;
          const ptCount = posArr.length / 3;
          for (let i = 0; i < ptCount; i++) {
            const a = (i / (ptCount-1)) * Math.PI * 2;
            posArr[i*3]   = Math.cos(a) * r;
            posArr[i*3+2] = Math.sin(a) * r;
          }
          sys.points.geometry.attributes.position.needsUpdate = true;
        }
        if (sys.age >= sys.lifetime) {
          this.scene.remove(sys.points);
          sys.points.geometry.dispose();
          sys.points.material.dispose();
          return false;
        }
        return true;
      }

      // Points system
      if (!sys.isAmbient && sys.age >= sys.lifetime) {
        this.scene.remove(sys.pts);
        sys.pts.geometry.dispose();
        sys.pts.material.dispose();
        return false;
      }

      const posAttr = sys.pts.geometry.attributes.position;
      const count   = posAttr.count;
      const arr     = posAttr.array;

      for (let i = 0; i < count; i++) {
        arr[i*3]   += sys.velocities[i*3]   * delta;
        arr[i*3+1] += sys.velocities[i*3+1] * delta;
        arr[i*3+2] += sys.velocities[i*3+2] * delta;

        if (sys.isAmbient) {
          if (arr[i*3+1] > 14) arr[i*3+1] = Math.random() * 0.5;
        } else {
          sys.velocities[i*3+1] -= 6 * delta; // gravity
          if (arr[i*3+1] < 0.05) arr[i*3+1] = 0.05;
        }
      }
      posAttr.needsUpdate = true;

      if (!sys.isAmbient) {
        const t = sys.age / sys.lifetime;
        sys.pts.material.opacity = Math.max(0, 1 - t * 1.1);
        sys.pts.material.size    = 0.28 * (1 - t * 0.4);
      }
      return true;
    });
  },

  clear() {
    this.systems.forEach(sys => {
      const obj = sys.pts || sys.points;
      if (obj) this.scene.remove(obj);
    });
    this.systems = [];
    this.trails = [];
  }
};
