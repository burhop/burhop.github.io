/* particles.js — THREE.js Particle System */
const Particles = {
  systems: [],
  scene: null,

  init(scene) {
    this.scene = scene;
  },

  // Create a burst of particles at a position
  burst(position, color, count, speed) {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions.push(position.x, position.y + 0.5, position.z);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const s = speed * (0.5 + Math.random() * 0.5);
      velocities.push(
        Math.sin(phi) * Math.cos(theta) * s,
        Math.cos(phi) * s * 0.5 + Math.random() * speed * 0.5,
        Math.sin(phi) * Math.sin(theta) * s
      );
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: color,
      size: 0.25,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.systems.push({
      points, velocities,
      age: 0, lifetime: 0.8,
      posArray: positions.slice()
    });
  },

  // Lightning arc between two points
  lightning(from, to, color) {
    const points = [];
    const segments = 8;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = from.x + (to.x - from.x) * t + (i > 0 && i < segments ? (Math.random() - 0.5) * 2 : 0);
      const y = from.y + (to.y - from.y) * t + (i > 0 && i < segments ? (Math.random() - 0.5) * 1 : 0);
      const z = from.z + (to.z - from.z) * t + (i > 0 && i < segments ? (Math.random() - 0.5) * 2 : 0);
      points.push(new THREE.Vector3(x, y, z));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    this.systems.push({
      isLine: true,
      points: line,
      age: 0,
      lifetime: 0.3
    });

    // Also burst at impact
    this.burst(to, color, 40, 5);
  },

  // Ambient floating motes
  createAmbient(count) {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions.push(
        (Math.random() - 0.5) * 50,
        Math.random() * 10,
        (Math.random() - 0.5) * 50
      );
      velocities.push(
        (Math.random() - 0.5) * 0.5,
        Math.random() * 0.3 + 0.1,
        (Math.random() - 0.5) * 0.5
      );
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x8800ff, size: 0.1,
      transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const mesh = new THREE.Points(geo, mat);
    this.scene.add(mesh);

    this.systems.push({
      points: mesh, velocities,
      age: 0, lifetime: Infinity,
      isAmbient: true,
      posArray: positions.slice()
    });
  },

  update(delta) {
    this.systems = this.systems.filter(sys => {
      sys.age += delta;

      if (sys.isLine) {
        sys.points.material.opacity = 1 - sys.age / sys.lifetime;
        if (sys.age >= sys.lifetime) {
          this.scene.remove(sys.points);
          return false;
        }
        return true;
      }

      if (sys.age >= sys.lifetime && !sys.isAmbient) {
        this.scene.remove(sys.points);
        sys.points.geometry.dispose();
        sys.points.material.dispose();
        return false;
      }

      const posAttr = sys.points.geometry.attributes.position;
      const count = posAttr.count;
      const t = sys.isAmbient ? 0 : sys.age / sys.lifetime;

      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3]     += sys.velocities[i * 3]     * delta;
        posAttr.array[i * 3 + 1] += sys.velocities[i * 3 + 1] * delta;
        posAttr.array[i * 3 + 2] += sys.velocities[i * 3 + 2] * delta;

        if (sys.isAmbient) {
          // Wrap particles
          if (posAttr.array[i * 3 + 1] > 12) posAttr.array[i * 3 + 1] = 0;
        } else {
          // Gravity
          sys.velocities[i * 3 + 1] -= 4 * delta;
          if (posAttr.array[i * 3 + 1] < 0) posAttr.array[i * 3 + 1] = 0;
        }
      }

      if (!sys.isAmbient) {
        sys.points.material.opacity = Math.max(0, 1 - t * 1.2);
        sys.points.material.size = 0.25 * (1 - t * 0.5);
      }

      posAttr.needsUpdate = true;
      return true;
    });
  },

  clear() {
    this.systems.forEach(sys => {
      this.scene.remove(sys.points);
    });
    this.systems = [];
  }
};
