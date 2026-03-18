/* enemies.js — Enemy types and WaveManager */

class Enemy {
  constructor(type, position, scene) {
    this.type = type;
    this.scene = scene;
    this.alive = true;
    this.age = 0;
    this.state = 'CHASE';
    this.stateTimer = 0;
    this.stunTimer = 0;
    this.slowTimer = 0;
    this.attackTimer = 0;
    this.teleportTimer = 0;

    const cfg = Enemy.CONFIG[type];
    this.cfg = cfg;
    this.health    = cfg.health;
    this.maxHealth = cfg.health;
    this.speed     = cfg.speed;
    this.damage    = cfg.damage;
    this.attackRange  = cfg.attackRange;
    this.attackCooldown = cfg.attackCooldown;
    this.score     = cfg.score;

    // Build mesh (simple geometries)
    const geo = new THREE.SphereGeometry(cfg.radius || 1, 10, 10);
    const mat = new THREE.MeshPhongMaterial({
      color: cfg.color,
      emissive: cfg.color,
      emissiveIntensity: 0.4,
      shininess: 60
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    this.mesh.position.y = cfg.radius || 1;
    scene.add(this.mesh);

    // Health bar (simple plane above enemy)
    const hbGeo = new THREE.PlaneGeometry(2, 0.25);
    const hbMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
    this.healthBarMesh = new THREE.Mesh(hbGeo, hbMat);
    this.healthBarMesh.position.set(0, (cfg.radius || 1) + 1.5, 0);
    this.healthBarMesh.rotation.x = -Math.PI / 2;
    this.mesh.add(this.healthBarMesh);

    // Glow light
    this.light = new THREE.PointLight(cfg.color, 1.5, 6);
    this.mesh.add(this.light);

    // Enemy projectiles (for orbiters)
    this.projectiles = [];
  }

  static CONFIG = {
    CHARGER: {
      health: 50,  speed: 4.5, damage: 10, attackRange: 2.5, attackCooldown: 1.2,
      color: 0xff3333, radius: 0.9, score: 10, detectionRange: 40
    },
    ORBITER: {
      health: 30,  speed: 2.5, damage: 8,  attackRange: 20,  attackCooldown: 2.5,
      color: 0x3366ff, radius: 0.7, score: 15, orbitRadius: 15, detectionRange: 50
    },
    TELEPORTER: {
      health: 40,  speed: 0,   damage: 12, attackRange: 22,  attackCooldown: 1.8,
      color: 0xff00ff, radius: 0.8, score: 20, teleportCooldown: 4, detectionRange: 50
    },
    TANK: {
      health: 200, speed: 1.5, damage: 20, attackRange: 4,   attackCooldown: 2.0,
      color: 0x888888, radius: 1.6, score: 80, detectionRange: 60
    },
    SWARM: {
      health: 15,  speed: 5.5, damage: 5,  attackRange: 2,   attackCooldown: 0.8,
      color: 0x00cc44, radius: 0.55, score: 5, detectionRange: 45
    }
  };

  update(delta, playerPos) {
    if (!this.alive) return;
    this.age += delta;
    this.stateTimer  -= delta;
    this.attackTimer -= delta;
    this.stunTimer   -= delta;
    this.slowTimer   -= delta;

    const isStunned = this.stunTimer > 0;
    const isSlowed  = this.slowTimer > 0;
    const effectiveSpeed = isStunned ? 0 : isSlowed ? this.speed * 0.4 : this.speed;

    // Pulsing glow
    this.light.intensity = 1.2 + Math.sin(this.age * 3) * 0.4;
    if (isStunned) { this.mesh.material.emissiveIntensity = 0.8; }
    else if (isSlowed) { this.mesh.material.emissive.setHex(0x0099ff); }
    else { this.mesh.material.emissive.setHex(this.cfg.color); this.mesh.material.emissiveIntensity = 0.4; }

    const toPlayer = playerPos.clone().sub(this.mesh.position);
    const distToPlayer = toPlayer.length();

    // Behaviour by type
    switch (this.type) {
      case 'CHARGER':
        if (!isStunned && distToPlayer < this.cfg.detectionRange) {
          const dir = toPlayer.clone().normalize();
          this.mesh.position.add(dir.multiplyScalar(effectiveSpeed * delta));
          this.mesh.position.y = this.cfg.radius;
        }
        break;

      case 'ORBITER': {
        if (isStunned) break;
        // Orbit player
        const angle = this.age * 0.6 + this.mesh.id * 1.2;
        const orbitR = this.cfg.orbitRadius;
        const targetX = playerPos.x + Math.cos(angle) * orbitR;
        const targetZ = playerPos.z + Math.sin(angle) * orbitR;
        const dx = targetX - this.mesh.position.x;
        const dz = targetZ - this.mesh.position.z;
        this.mesh.position.x += dx * effectiveSpeed * delta * 0.5;
        this.mesh.position.z += dz * effectiveSpeed * delta * 0.5;
        this.mesh.position.y = this.cfg.radius;

        // Shoot projectile
        if (this.attackTimer <= 0 && distToPlayer < 35) {
          this.attackTimer = this.cfg.attackCooldown;
          this._shootAt(playerPos);
        }
        break;
      }

      case 'TELEPORTER':
        if (isStunned) break;
        this.teleportTimer -= delta;
        if (this.teleportTimer <= 0) {
          // Teleport to random position within arena (but not too close to player)
          let tx, tz;
          do {
            tx = (Math.random() - 0.5) * 48;
            tz = (Math.random() - 0.5) * 48;
          } while (Math.hypot(tx - playerPos.x, tz - playerPos.z) < 8);
          this.mesh.position.set(tx, this.cfg.radius, tz);
          Particles.burst(this.mesh.position, this.cfg.color, 30, 5);
          this.teleportTimer = this.cfg.teleportCooldown;
        }
        // Shoot at player
        if (this.attackTimer <= 0 && distToPlayer < this.cfg.attackRange + 5) {
          this.attackTimer = this.cfg.attackCooldown;
          this._shootAt(playerPos);
        }
        break;

      case 'TANK':
        if (!isStunned && distToPlayer < this.cfg.detectionRange) {
          const dir = toPlayer.clone().normalize();
          this.mesh.position.add(dir.multiplyScalar(effectiveSpeed * delta));
          this.mesh.position.y = this.cfg.radius;
          this.mesh.rotation.y += delta * 0.8;
        }
        break;

      case 'SWARM':
        if (!isStunned && distToPlayer < this.cfg.detectionRange) {
          // Flocking: approach player + slight sideways wobble
          const dir = toPlayer.clone().normalize();
          dir.x += Math.sin(this.age * 5 + this.mesh.id) * 0.3;
          dir.z += Math.cos(this.age * 5 + this.mesh.id) * 0.3;
          dir.normalize();
          this.mesh.position.add(dir.multiplyScalar(effectiveSpeed * delta));
          this.mesh.position.y = this.cfg.radius;
        }
        break;
    }

    // Clamp inside arena
    const HALF = 27;
    this.mesh.position.x = Math.max(-HALF, Math.min(HALF, this.mesh.position.x));
    this.mesh.position.z = Math.max(-HALF, Math.min(HALF, this.mesh.position.z));

    // Update health bar scale
    const hpRatio = Math.max(0, this.health / this.maxHealth);
    this.healthBarMesh.scale.x = hpRatio;
    this.healthBarMesh.material.color.setHex(hpRatio > 0.5 ? 0x22c55e : hpRatio > 0.25 ? 0xfacc15 : 0xef4444);

    // Update own projectiles
    this.projectiles = this.projectiles.filter(p => {
      p.lifetime -= delta;
      p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
      if (p.lifetime <= 0) { this.scene.remove(p.mesh); return false; }
      return true;
    });
  }

  _shootAt(targetPos) {
    const origin = this.mesh.position.clone().add(new THREE.Vector3(0, 1, 0));
    const dir = targetPos.clone().sub(origin); dir.y = 0; dir.normalize();
    const geo = new THREE.SphereGeometry(0.25, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: this.cfg.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, velocity: dir.multiplyScalar(14), lifetime: 2.5, damage: this.cfg.damage });
  }

  checkProjectileHits(player) {
    if (!player.isAlive || player.shielded) return;
    this.projectiles = this.projectiles.filter(p => {
      if (p.mesh.position.distanceTo(player.mesh.position) < 1.5) {
        player.takeDamage(p.damage);
        Particles.burst(p.mesh.position, 0xff0000, 20, 3);
        this.scene.remove(p.mesh);
        return false;
      }
      return true;
    });
  }

  takeDamage(amount, effect, duration) {
    if (!this.alive) return;
    this.health -= amount;
    if (effect === 'stun' && duration > 0) this.stunTimer  = duration;
    if (effect === 'slow' && duration > 0) this.slowTimer  = duration;

    // Flash white
    const origColor = this.mesh.material.emissive.clone();
    this.mesh.material.emissive.setHex(0xffffff);
    setTimeout(() => { if (this.alive && this.mesh) this.mesh.material.emissive.copy(origColor); }, 80);

    if (this.health <= 0) this.die();
  }

  die() {
    this.alive = false;
    Particles.burst(this.mesh.position, this.cfg.color, 60, 6);
    this.scene.remove(this.mesh);
    this.projectiles.forEach(p => this.scene.remove(p.mesh));
    this.projectiles = [];
  }
}

// ---- WaveManager ----
class WaveManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.currentWave = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveActive = false;
    this.waveDone = false;
  }

  static WAVES = [
    { enemies: [{ type:'CHARGER', count:3 }, { type:'ORBITER', count:1 }],          delay:1.5 },
    { enemies: [{ type:'CHARGER', count:5 }, { type:'TELEPORTER', count:1 }],        delay:1.2 },
    { enemies: [{ type:'CHARGER', count:4 }, { type:'ORBITER', count:2 }],           delay:1.0 },
    { enemies: [{ type:'SWARM', count:10 }, { type:'TELEPORTER', count:2 }],         delay:0.7 },
    { enemies: [{ type:'CHARGER', count:6 }, { type:'ORBITER', count:3 }],           delay:0.8 },
    { enemies: [{ type:'TANK', count:1 }, { type:'SWARM', count:6 }],               delay:1.0 },
    { enemies: [{ type:'CHARGER', count:8 }, { type:'TELEPORTER', count:3 }],        delay:0.6 },
    { enemies: [{ type:'ORBITER', count:5 }, { type:'SWARM', count:8 }],             delay:0.6 },
    { enemies: [{ type:'TANK', count:2 }, { type:'CHARGER', count:5 }],              delay:0.5 },
    { enemies: [{ type:'TANK', count:1 }, { type:'ORBITER', count:4 }, { type:'SWARM', count:10 }], delay:0.4 }
  ];

  startWave() {
    this.currentWave++;
    const waveDef = WaveManager.WAVES[Math.min(this.currentWave - 1, WaveManager.WAVES.length - 1)];

    this.spawnQueue = [];
    waveDef.enemies.forEach(group => {
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push(group.type);
      }
    });
    // Shuffle
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }

    this.spawnTimer = waveDef.delay;
    this.waveActive = true;
    this.waveDone = false;
    this.enemies = this.enemies.filter(e => e.alive);
  }

  update(delta, playerPos) {
    // Spawn from queue
    if (this.spawnQueue.length > 0 && this.waveActive) {
      this.spawnTimer -= delta;
      if (this.spawnTimer <= 0) {
        const type = this.spawnQueue.shift();
        this._spawnEnemy(type);
        const waveDef = WaveManager.WAVES[Math.min(this.currentWave - 1, WaveManager.WAVES.length - 1)];
        this.spawnTimer = waveDef.delay;
      }
    }

    // Update all enemies
    this.enemies.forEach(e => {
      if (e.alive) {
        e.update(delta, playerPos);
        e.checkProjectileHits(Game.player);
      }
    });

    // Check melee contact damage
    this.enemies.forEach(e => {
      if (!e.alive || e.type === 'ORBITER' || e.type === 'TELEPORTER') return;
      if (!Game.player.isAlive || Game.player.shielded) return;
      const dist = e.mesh.position.distanceTo(playerPos);
      if (dist < e.cfg.attackRange && e.attackTimer <= 0) {
        Game.player.takeDamage(e.cfg.damage);
        e.attackTimer = e.cfg.attackCooldown;
      }
    });

    // Check wave completion
    if (this.spawnQueue.length === 0 && this.enemies.every(e => !e.alive)) {
      if (this.waveActive) {
        this.waveActive = false;
        this.waveDone = true;
      }
    }
  }

  _spawnEnemy(type) {
    const angle = Math.random() * Math.PI * 2;
    const r = 26 + Math.random() * 4;
    const pos = new THREE.Vector3(Math.cos(angle) * r, 1, Math.sin(angle) * r);
    const enemy = new Enemy(type, pos, this.scene);
    this.enemies.push(enemy);
  }

  clearAll() {
    this.enemies.forEach(e => { if (e.alive) e.die(); });
    this.enemies = [];
    this.spawnQueue = [];
    this.waveActive = false;
    this.waveDone = false;
  }

  get aliveCount() { return this.enemies.filter(e => e.alive).length + this.spawnQueue.length; }
}
