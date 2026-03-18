/* enemies.js — Visually distinct enemy types with unique 3D geometry */

class Enemy {
  constructor(type, position, scene) {
    this.type    = type;
    this.scene   = scene;
    this.alive   = true;
    this.age     = 0;
    this.state   = 'CHASE';
    this.stunTimer     = 0;
    this.slowTimer     = 0;
    this.attackTimer   = 0;
    this.teleportTimer = 0;
    this.projectiles   = [];

    const cfg = Enemy.CONFIG[type];
    this.cfg         = cfg;
    this.health      = cfg.health;
    this.maxHealth   = cfg.health;
    this.speed       = cfg.speed;
    this.damage      = cfg.damage;
    this.attackRange = cfg.attackRange;
    this.attackCooldown = cfg.attackCooldown;
    this.score       = cfg.score;

    this._buildMesh(position);
  }

  static CONFIG = {
    CHARGER:    { health:50,  speed:4.5, damage:10, attackRange:2.8, attackCooldown:1.2, color:0xff3333, score:10, detectionRange:40, radius:0.9  },
    ORBITER:    { health:30,  speed:2.5, damage:8,  attackRange:20,  attackCooldown:2.5, color:0x3399ff, score:15, detectionRange:50, orbitRadius:15, radius:0.7 },
    TELEPORTER: { health:40,  speed:0,   damage:12, attackRange:22,  attackCooldown:1.8, color:0xff44ff, score:20, detectionRange:50, teleportCooldown:3.5, radius:0.75 },
    TANK:       { health:250, speed:1.4, damage:22, attackRange:4.5, attackCooldown:2.0, color:0x999999, score:80, detectionRange:60, radius:1.8  },
    SWARM:      { health:15,  speed:5.8, damage:5,  attackRange:2.2, attackCooldown:0.8, color:0x00cc55, score:5,  detectionRange:45, radius:0.5  }
  };

  _buildMesh(position) {
    this.mesh = new THREE.Group();
    this.scene.add(this.mesh);
    this.mesh.position.copy(position);
    this.mesh.position.y = this.cfg.radius;

    const c = this.cfg.color;
    let bodyGeo;

    switch (this.type) {
      case 'CHARGER':
        // Spiked icosahedron – aggressive, sharp
        bodyGeo = new THREE.IcosahedronGeometry(this.cfg.radius, 0);
        break;
      case 'ORBITER':
        // Octahedron + orbiting mini-ring – elegant floater
        bodyGeo = new THREE.OctahedronGeometry(this.cfg.radius);
        break;
      case 'TELEPORTER':
        // Dodecahedron – crystalline, otherworldly
        bodyGeo = new THREE.DodecahedronGeometry(this.cfg.radius, 0);
        break;
      case 'TANK':
        // Wide cylinder with flat top – imposing boss
        bodyGeo = new THREE.CylinderGeometry(this.cfg.radius, this.cfg.radius * 1.2, 2.4, 8);
        break;
      case 'SWARM':
        // Cone – tiny and fast
        bodyGeo = new THREE.ConeGeometry(this.cfg.radius, this.cfg.radius * 2.5, 6);
        break;
    }

    const bodyMat = new THREE.MeshPhongMaterial({
      color: c, emissive: c, emissiveIntensity: 0.5, shininess: 80,
      transparent: false
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.mesh.add(this.body);

    // Wireframe overlay (glowing edge look)
    const wireMat = new THREE.MeshBasicMaterial({
      color: c, wireframe: true, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const wireMesh = new THREE.Mesh(bodyGeo, wireMat);
    wireMesh.scale.setScalar(1.05);
    this.mesh.add(wireMesh);

    // Pulse glow shell
    const glowGeo = new THREE.SphereGeometry(this.cfg.radius * 1.6, 10, 10);
    const glowMat = new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: 0.08,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.glowShell = new THREE.Mesh(glowGeo, glowMat);
    this.mesh.add(this.glowShell);

    // Orbiter: mini ring decoration
    if (this.type === 'ORBITER') {
      const rGeo = new THREE.TorusGeometry(1.3, 0.08, 6, 40);
      const rMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
      this.orbitRing = new THREE.Mesh(rGeo, rMat);
      this.orbitRing.rotation.x = Math.PI / 2.5;
      this.mesh.add(this.orbitRing);
    }

    // Tank: crown of spikes
    if (this.type === 'TANK') {
      for (let i = 0; i < 6; i++) {
        const sGeo = new THREE.ConeGeometry(0.2, 1.0, 4);
        const sMat = new THREE.MeshPhongMaterial({ color: 0xbbbbbb, emissive: 0x555555, emissiveIntensity: 0.5 });
        const spike = new THREE.Mesh(sGeo, sMat);
        const a = (i / 6) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 1.5, 1.2, Math.sin(a) * 1.5);
        this.mesh.add(spike);
      }
    }

    // Dynamic point light
    this.light = new THREE.PointLight(c, 2.5, 8);
    this.light.position.y = this.cfg.radius;
    this.mesh.add(this.light);

    // ── Health bar (billboard plane) ─────────────────────
    const hbBg = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x1a1a2e, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
    );
    hbBg.position.set(0, this.cfg.radius * 2.2, 0);
    hbBg.rotation.x = -Math.PI / 2;
    this.mesh.add(hbBg);

    const hbFill = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 0.14),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide })
    );
    hbFill.position.set(0, this.cfg.radius * 2.2 + 0.01, 0);
    hbFill.rotation.x = -Math.PI / 2;
    this.mesh.add(hbFill);
    this.hpBar = hbFill;
  }

  update(delta, playerPos) {
    if (!this.alive) return;
    this.age         += delta;
    this.attackTimer -= delta;
    this.stunTimer   -= delta;
    this.slowTimer   -= delta;

    const stunned = this.stunTimer > 0;
    const slowed  = this.slowTimer > 0;
    const spd     = stunned ? 0 : slowed ? this.speed * 0.35 : this.speed;

    // Animate body
    this.body.rotation.y += delta * (this.type === 'TANK' ? 0.5 : 1.5);
    if (this.type === 'CHARGER') { this.body.rotation.x += delta * 0.5; }
    this.light.intensity = 2.2 + Math.sin(this.age * 4) * 0.8;
    this.glowShell.material.opacity = stunned ? 0.25 : 0.06 + Math.sin(this.age * 3) * 0.03;

    // Status tints
    if (stunned) {
      this.body.material.emissive.setHex(0xffff88);
    } else if (slowed) {
      this.body.material.emissive.setHex(0x0077ff);
      this.body.material.emissiveIntensity = 0.9;
    } else {
      this.body.material.emissive.setHex(this.cfg.color);
      this.body.material.emissiveIntensity = 0.5;
    }

    const toPlayer = playerPos.clone().sub(this.mesh.position);
    const dist     = toPlayer.length();

    switch (this.type) {
      case 'CHARGER':
        if (!stunned && dist < this.cfg.detectionRange) {
          this.mesh.position.add(toPlayer.clone().normalize().multiplyScalar(spd * delta));
        }
        break;

      case 'ORBITER': {
        if (stunned) break;
        const angle = this.age * 0.55 + this.mesh.id * 1.3;
        const or = this.cfg.orbitRadius;
        const tx = playerPos.x + Math.cos(angle) * or;
        const tz = playerPos.z + Math.sin(angle) * or;
        this.mesh.position.x += (tx - this.mesh.position.x) * spd * delta * 0.5;
        this.mesh.position.z += (tz - this.mesh.position.z) * spd * delta * 0.5;
        if (this.orbitRing) this.orbitRing.rotation.y += delta * 2.5;
        if (this.attackTimer <= 0 && dist < 35) {
          this.attackTimer = this.cfg.attackCooldown;
          this._shootAt(playerPos);
        }
        break;
      }

      case 'TELEPORTER':
        if (stunned) break;
        this.teleportTimer -= delta;
        if (this.teleportTimer <= 0) {
          let tx, tz;
          do {
            tx = (Math.random() - 0.5) * 48;
            tz = (Math.random() - 0.5) * 48;
          } while (Math.hypot(tx - playerPos.x, tz - playerPos.z) < 8);
          Particles.burst(this.mesh.position.clone(), this.cfg.color, 40, 6);
          this.mesh.position.set(tx, this.cfg.radius, tz);
          Particles.burst(this.mesh.position.clone(), this.cfg.color, 40, 6);
          this.teleportTimer = this.cfg.teleportCooldown;
        }
        if (this.attackTimer <= 0 && dist < 28) {
          this.attackTimer = this.cfg.attackCooldown;
          this._shootAt(playerPos);
        }
        break;

      case 'TANK':
        if (!stunned && dist < this.cfg.detectionRange) {
          this.mesh.position.add(toPlayer.clone().normalize().multiplyScalar(spd * delta));
        }
        // Shockwave if close
        if (this.attackTimer <= 0 && dist < 6) {
          this.attackTimer = this.cfg.attackCooldown;
          Particles.ring(this.mesh.position.clone(), 0xaaaaaa, 5);
        }
        break;

      case 'SWARM':
        if (!stunned && dist < this.cfg.detectionRange) {
          const dir = toPlayer.clone().normalize();
          dir.x += Math.sin(this.age * 5 + this.mesh.id) * 0.4;
          dir.z += Math.cos(this.age * 5 + this.mesh.id) * 0.4;
          dir.normalize();
          this.mesh.position.add(dir.multiplyScalar(spd * delta));
        }
        break;
    }

    // Clamp arena
    const HALF = 27;
    this.mesh.position.x = Math.max(-HALF, Math.min(HALF, this.mesh.position.x));
    this.mesh.position.z = Math.max(-HALF, Math.min(HALF, this.mesh.position.z));
    this.mesh.position.y = this.cfg.radius;

    // HP bar scale + color
    const hpRatio = Math.max(0, this.health / this.maxHealth);
    this.hpBar.scale.x = hpRatio;
    this.hpBar.material.color.setHex(hpRatio > 0.5 ? 0x22c55e : hpRatio > 0.25 ? 0xfacc15 : 0xef4444);

    // Billboard HP bar toward camera
    if (typeof Game !== 'undefined' && Game.camera) {
      const camPos = Game.camera.position.clone().sub(this.mesh.position);
      this.hpBar.parent.rotation.y = Math.atan2(camPos.x, camPos.z);
    }

    // Projectile updates
    this.projectiles = this.projectiles.filter(p => {
      p.lifetime -= delta;
      p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
      if (p.lifetime <= 0) { this.scene.remove(p.mesh); return false; }
      return true;
    });
  }

  _shootAt(targetPos) {
    const origin = this.mesh.position.clone().add(new THREE.Vector3(0, 1, 0));
    const dir    = targetPos.clone().sub(origin); dir.y = 0; dir.normalize();

    const geo  = new THREE.SphereGeometry(0.22, 6, 6);
    const mat  = new THREE.MeshBasicMaterial({ color: this.cfg.color, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.add(new THREE.PointLight(this.cfg.color, 2, 5));
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, velocity: dir.multiplyScalar(14), lifetime: 2.6, damage: this.cfg.damage });
    Particles.burst(origin, this.cfg.color, 10, 3, 0.3);
  }

  checkProjectileHits(player) {
    if (!player.isAlive || player.shielded) return;
    this.projectiles = this.projectiles.filter(p => {
      if (p.mesh.position.distanceTo(player.mesh.position) < 1.6) {
        player.takeDamage(p.damage);
        Particles.burst(p.mesh.position, 0xff4444, 20, 3);
        this.scene.remove(p.mesh);
        return false;
      }
      return true;
    });
  }

  takeDamage(amount, effect, duration) {
    if (!this.alive) return;
    this.health -= amount;
    if (effect === 'stun' && duration > 0) this.stunTimer = duration;
    if (effect === 'slow' && duration > 0) this.slowTimer = duration;

    // Brief white flash
    this.body.material.emissive.setHex(0xffffff);
    this.body.material.emissiveIntensity = 1.5;
    setTimeout(() => {
      if (this.alive && this.body) {
        this.body.material.emissive.setHex(this.cfg.color);
        this.body.material.emissiveIntensity = 0.5;
      }
    }, 90);

    if (this.health <= 0) this.die();
  }

  die() {
    this.alive = false;
    Particles.burst(this.mesh.position.clone(), this.cfg.color, 80, 7);
    Particles.ring(this.mesh.position.clone(), this.cfg.color, 4);
    this.scene.remove(this.mesh);
    this.projectiles.forEach(p => this.scene.remove(p.mesh));
    this.projectiles = [];
  }
}

// ── WaveManager ───────────────────────────────────────────────
class WaveManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies      = [];
    this.currentWave  = 0;
    this.spawnQueue   = [];
    this.spawnTimer   = 0;
    this.waveActive   = false;
    this.waveDone     = false;
  }

  static WAVES = [
    { enemies: [{ type:'CHARGER', count:3 }, { type:'ORBITER', count:1 }],             delay:1.5 },
    { enemies: [{ type:'CHARGER', count:5 }, { type:'TELEPORTER', count:1 }],           delay:1.2 },
    { enemies: [{ type:'CHARGER', count:4 }, { type:'ORBITER', count:2 }],              delay:1.0 },
    { enemies: [{ type:'SWARM', count:10 }, { type:'TELEPORTER', count:2 }],            delay:0.7 },
    { enemies: [{ type:'CHARGER', count:6 }, { type:'ORBITER', count:3 }],              delay:0.8 },
    { enemies: [{ type:'TANK', count:1 }, { type:'SWARM', count:6 }],                  delay:1.0 },
    { enemies: [{ type:'CHARGER', count:8 }, { type:'TELEPORTER', count:3 }],           delay:0.6 },
    { enemies: [{ type:'ORBITER', count:5 }, { type:'SWARM', count:8 }],                delay:0.6 },
    { enemies: [{ type:'TANK', count:2 }, { type:'CHARGER', count:5 }],                 delay:0.5 },
    { enemies: [{ type:'TANK', count:1 }, { type:'ORBITER', count:4 }, { type:'SWARM', count:10 }], delay:0.4 }
  ];

  startWave() {
    this.currentWave++;
    const def = WaveManager.WAVES[Math.min(this.currentWave - 1, WaveManager.WAVES.length - 1)];
    this.spawnQueue = [];
    def.enemies.forEach(g => {
      for (let i = 0; i < g.count; i++) this.spawnQueue.push(g.type);
    });
    // Shuffle
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
    this.spawnTimer = def.delay;
    this.waveActive = true;
    this.waveDone   = false;
    this.enemies    = this.enemies.filter(e => e.alive);
  }

  update(delta, playerPos) {
    if (this.spawnQueue.length > 0 && this.waveActive) {
      this.spawnTimer -= delta;
      if (this.spawnTimer <= 0) {
        const def = WaveManager.WAVES[Math.min(this.currentWave - 1, WaveManager.WAVES.length - 1)];
        this._spawnEnemy(this.spawnQueue.shift());
        this.spawnTimer = def.delay;
      }
    }

    this.enemies.forEach(e => {
      if (!e.alive) return;
      e.update(delta, playerPos);
      e.checkProjectileHits(Game.player);

      // Melee contact
      if (e.type !== 'ORBITER' && e.type !== 'TELEPORTER' && Game.player.isAlive && !Game.player.shielded) {
        const dist = e.mesh.position.distanceTo(playerPos);
        if (dist < e.cfg.attackRange && e.attackTimer <= 0) {
          Game.player.takeDamage(e.cfg.damage);
          e.attackTimer = e.cfg.attackCooldown;
        }
      }
    });

    if (this.spawnQueue.length === 0 && this.enemies.every(e => !e.alive) && this.waveActive) {
      this.waveActive = false;
      this.waveDone   = true;
    }
  }

  _spawnEnemy(type) {
    const angle = Math.random() * Math.PI * 2;
    const r     = 27 + Math.random() * 3;
    const pos   = new THREE.Vector3(Math.cos(angle) * r, 1, Math.sin(angle) * r);
    this.enemies.push(new Enemy(type, pos, this.scene));
  }

  clearAll() {
    this.enemies.forEach(e => { if (e.alive) e.die(); });
    this.enemies    = [];
    this.spawnQueue = [];
    this.waveActive = false;
    this.waveDone   = false;
  }

  get aliveCount() { return this.enemies.filter(e => e.alive).length + this.spawnQueue.length; }
}
