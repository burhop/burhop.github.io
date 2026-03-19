/* enemies.js — Sprite-based enemies with unique characters */

class Enemy {
  constructor(type, position, scene) {
    this.type    = type;
    this.scene   = scene;
    this.alive   = true;
    this.age     = 0;
    this.stunTimer     = 0;
    this.slowTimer     = 0;
    this.attackTimer   = 0;
    this.teleportTimer = 0;
    this.projectiles   = [];
    this.knockbackVel  = new THREE.Vector3(); // smooth bounce velocity

    const cfg  = Enemy.CONFIG[type];
    this.cfg        = cfg;
    this.health     = cfg.health;
    this.maxHealth  = cfg.health;
    this.speed      = cfg.speed;
    this.damage     = cfg.damage;
    this.attackRange = cfg.attackRange;
    this.attackCooldown = cfg.attackCooldown;
    this.score      = cfg.score;

    this._buildMesh(position);
  }

  static CONFIG = {
    CHARGER:    { health:50,  speed:4.5, damage:10, attackRange:2.8, attackCooldown:1.2, color:0xff3333, score:10, detectionRange:40, radius:1.2, spriteSize:[3.2,3.8], spriteImg:'img/charger.png', spriteImgBack:'img/charger_back.png', spriteImgSide:'img/charger_side.png', projImg:'img/proj_fire.png', projSize:2.2 },
    ORBITER:    { health:30,  speed:2.5, damage:8,  attackRange:20,  attackCooldown:2.5, color:0x3399ff, score:15, detectionRange:50, orbitRadius:15, radius:1.0, spriteSize:[2.8,3.2], spriteImg:'img/orbiter.png', spriteImgBack:'img/orbiter_back.png', spriteImgSide:'img/orbiter_side.png', projImg:'img/proj_arcane.png', projSize:2.0 },
    TELEPORTER: { health:40,  speed:0,   damage:12, attackRange:22,  attackCooldown:1.8, color:0xff44ff, score:20, detectionRange:50, teleportCooldown:3.5, radius:1.0, spriteSize:[2.8,3.5], spriteImg:'img/teleporter.png', spriteImgBack:'img/teleporter_back.png', spriteImgSide:'img/teleporter_side.png', projImg:'img/proj_shadow.png', projSize:2.0 },
    TANK:       { health:250, speed:1.4, damage:22, attackRange:4.5, attackCooldown:2.0, color:0x999999, score:80, detectionRange:60, radius:1.8, spriteSize:[5.0,6.0], spriteImg:'img/tank.png', spriteImgBack:'img/tank_back.png', spriteImgSide:'img/tank_side.png', projImg:'img/proj_fire.png', projSize:2.8 },
    SWARM:      { health:15,  speed:5.8, damage:5,  attackRange:2.2, attackCooldown:0.8, color:0x00cc55, score:5,  detectionRange:45, radius:0.6, spriteSize:[1.8,2.2], spriteImg:'img/swarm.png', spriteImgBack:'img/swarm_back.png', spriteImgSide:'img/swarm_side.png', projImg:'img/proj_arcane.png', projSize:1.4 }
  };

  _buildMesh(position) {
    this.mesh = new THREE.Group();
    this.scene.add(this.mesh);
    this.mesh.position.copy(position);
    this.mesh.position.y = 0;

    const [sw, sh] = this.cfg.spriteSize;

    // ── Character sprite – 4 directions ─────────────
    this.texFront = SpriteLoader.load(this.cfg.spriteImg);
    this.texBack  = SpriteLoader.load(this.cfg.spriteImgBack);
    this.texSideL = SpriteLoader.load(this.cfg.spriteImgSide);
    this.texSideR = SpriteLoader.loadFlipped(this.cfg.spriteImgSide);
    const spriteMat = new THREE.SpriteMaterial({ map:this.texFront, transparent:true, blending:THREE.NormalBlending, depthWrite:false, depthTest:false });
    this.sprite = new THREE.Sprite(spriteMat);
    this.spriteW = sw;
    this.sprite.scale.set(sw, sh, 1);
    this.sprite.position.y = sh / 2;
    this.mesh.add(this.sprite);

    // ── Shadow on floor ───────────────────────────────
    const shadowGeo = new THREE.CircleGeometry(this.cfg.radius * 0.85, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.45, depthWrite:false });
    const shadow    = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    this.mesh.add(shadow);

    // ── Glow aura ring on floor (coloured) ───────────
    const auraGeo = new THREE.CircleGeometry(this.cfg.radius * 1.1, 24);
    const auraMat = new THREE.MeshBasicMaterial({ color:this.cfg.color, transparent:true, opacity:0.28, blending:THREE.AdditiveBlending, depthWrite:false });
    this.aura = new THREE.Mesh(auraGeo, auraMat);
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.02;
    this.mesh.add(this.aura);

    // ── Tank-specific crown of spikes ─────────────────
    if (this.type === 'TANK') {
      for (let i = 0; i < 6; i++) {
        const sGeo  = new THREE.ConeGeometry(0.22, 1.0, 4);
        const sMat  = new THREE.MeshPhongMaterial({ color:0xbbbbbb, emissive:0x666666, emissiveIntensity:0.5 });
        const spike = new THREE.Mesh(sGeo, sMat);
        const a = (i/6)*Math.PI*2;
        spike.position.set(Math.cos(a)*1.8, 5.5, Math.sin(a)*1.8);
        this.mesh.add(spike);
      }
    }

    // ── Orbiter: mini ring ────────────────────────────
    if (this.type === 'ORBITER') {
      const rGeo = new THREE.TorusGeometry(1.4, 0.07, 6, 40);
      const rMat = new THREE.MeshBasicMaterial({ color:0x22d3ee, transparent:true, opacity:0.8, blending:THREE.AdditiveBlending });
      this.orbitRing = new THREE.Mesh(rGeo, rMat);
      this.orbitRing.position.y = sh / 2;
      this.mesh.add(this.orbitRing);
    }

    // ── Point light (gives colour cast on floor) ──────
    this.light = new THREE.PointLight(this.cfg.color, 3, 10);
    this.light.position.y = sh / 2;
    this.mesh.add(this.light);

    // ── Billboard health bar ──────────────────────────
    const hbBg = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.24),
      new THREE.MeshBasicMaterial({ color:0x111111, side:THREE.DoubleSide, transparent:true, opacity:0.75 })
    );
    hbBg.position.set(0, sh * 0.25, 0);
    this.mesh.add(hbBg);

    const hbFill = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.16),
      new THREE.MeshBasicMaterial({ color:0x22c55e, side:THREE.DoubleSide })
    );
    hbFill.position.set(0, sh * 0.5, 0.01);
    this.mesh.add(hbFill);
    this.hpBar = hbFill;

    // Group the hp bar planes so we can billboard them
    this.hpGroup = new THREE.Group();
    this.hpGroup.add(hbBg);
    this.hpGroup.add(hbFill);
    this.mesh.remove(hbBg);
    this.mesh.remove(hbFill);
    this.mesh.add(this.hpGroup);
    this.hpGroup.position.y = 0;
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

    const [,sh] = this.cfg.spriteSize;

    // Animate sprite
    this.sprite.position.y = sh/2 + Math.sin(this.age * (this.type === 'SWARM' ? 5 : 2)) * 0.08;
    this.light.intensity = 2.5 + Math.sin(this.age * 3) * 0.8;
    this.aura.material.opacity = stunned ? 0.55 : 0.22 + Math.sin(this.age * 2.5) * 0.06;
    if (this.aura) this.aura.rotation.z += delta * 0.6;

    // ── 4-direction sprite switching ────────────────────
    if (typeof Game !== 'undefined' && Game.camera) {
      const camDir  = Game.camera.position.clone().sub(this.mesh.position).normalize();
      const toPlayer = playerPos.clone().sub(this.mesh.position);
      if (toPlayer.length() > 0.1) {
        toPlayer.normalize();
        const dot   = camDir.x * toPlayer.x + camDir.z * toPlayer.z;
        const cross = camDir.x * toPlayer.z - camDir.z * toPlayer.x;
        const angle = Math.atan2(cross, dot);

        let tex;
        const absAngle = Math.abs(angle);
        if (absAngle < Math.PI / 6) {
          tex = this.texFront;
          this.sprite.scale.x = this.spriteW;
        } else if (absAngle > 5 * Math.PI / 6) {
          tex = this.texBack;
          this.sprite.scale.x = this.spriteW;
        } else {
          tex = angle > 0 ? this.texSideR : this.texSideL;
        }
        this.sprite.scale.x = this.spriteW; // always positive
        if (this.sprite.material.map !== tex) {
          this.sprite.material.map = tex;
          this.sprite.material.needsUpdate = true;
        }
      }
    }

    // Status colour tint on sprite
    if (stunned) {
      this.sprite.material.color.setHex(0xffffaa);
    } else if (slowed) {
      this.sprite.material.color.setHex(0x88ccff);
    } else {
      this.sprite.material.color.setHex(0xffffff);
    }

    const toPlayer = playerPos.clone().sub(this.mesh.position);
    const dist     = toPlayer.length();

    // Flip sprite to face movement direction
    const moving = spd > 0;

    switch (this.type) {
      case 'CHARGER':
        if (!stunned && dist < this.cfg.detectionRange) {
          const dir = toPlayer.clone().normalize().multiplyScalar(spd * delta);
          this.mesh.position.add(dir);
        }
        break;

      case 'ORBITER': {
        if (stunned) break;
        const angle = this.age * 0.55 + this.mesh.id * 1.3;
        const or    = this.cfg.orbitRadius;
        const tx    = playerPos.x + Math.cos(angle) * or;
        const tz    = playerPos.z + Math.sin(angle) * or;
        const step  = spd * delta * 0.5;
        const dx    = (tx - this.mesh.position.x) * step;
        const dz    = (tz - this.mesh.position.z) * step;
        this.mesh.position.x += dx;
        this.mesh.position.z += dz;
        if (this.orbitRing) this.orbitRing.rotation.y += delta * 2.5;
        if (this.attackTimer <= 0 && dist < 35) {
          this.attackTimer = this.cfg.attackCooldown;
          this._shootAt(playerPos);
        }
        break;
      }

      case 'TELEPORTER':
        if (stunned) break;
        // Fade in/out on teleport
        this.teleportTimer -= delta;
        if (this.teleportTimer <= 0) {
          let tx, tz;
          do {
            tx = (Math.random()-0.5)*48; tz = (Math.random()-0.5)*48;
          } while (Math.hypot(tx-playerPos.x, tz-playerPos.z) < 8);
          Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0,2,0)), this.cfg.color, 50, 6);
          this.mesh.position.set(tx, 0, tz);
          Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0,2,0)), this.cfg.color, 50, 6);
          this.teleportTimer = this.cfg.teleportCooldown;
        }
        if (this.attackTimer <= 0 && dist < 28) {
          this.attackTimer = this.cfg.attackCooldown;
          this._shootAt(playerPos);
        }
        break;

      case 'TANK':
        if (!stunned && dist < this.cfg.detectionRange) {
          const dir = toPlayer.clone().normalize().multiplyScalar(spd * delta);
          this.mesh.position.add(dir);
        }
        if (this.attackTimer <= 0 && dist < 7) {
          this.attackTimer = this.cfg.attackCooldown;
          Particles.ring(this.mesh.position.clone(), 0xaaaaaa, 6);
        }
        break;

      case 'SWARM':
        if (!stunned && dist < this.cfg.detectionRange) {
          const dir = toPlayer.clone().normalize();
          dir.x += Math.sin(this.age * 5 + this.mesh.id) * 0.4;
          dir.z += Math.cos(this.age * 5 + this.mesh.id) * 0.4;
          dir.normalize().multiplyScalar(spd * delta);
          this.mesh.position.add(dir);
        }
        break;
    }

    // ── Apply knockback velocity (smooth bounce) ────────
    if (this.knockbackVel.length() > 0.05) {
      this.mesh.position.add(this.knockbackVel.clone().multiplyScalar(delta));
      // Friction: decelerate rapidly
      this.knockbackVel.multiplyScalar(Math.max(0, 1 - 6 * delta));
    } else {
      this.knockbackVel.set(0, 0, 0);
    }

    // Clamp inside arena
    const HALF = 27;
    this.mesh.position.x = Math.max(-HALF, Math.min(HALF, this.mesh.position.x));
    this.mesh.position.z = Math.max(-HALF, Math.min(HALF, this.mesh.position.z));
    this.mesh.position.y = 0;

    // HP bar update
    const hpRatio = Math.max(0, this.health / this.maxHealth);
    this.hpBar.scale.x = hpRatio;
    this.hpBar.material.color.setHex(hpRatio > 0.5 ? 0x22c55e : hpRatio > 0.25 ? 0xfacc15 : 0xef4444);

    // Billboard HP bar toward camera
    if (typeof Game !== 'undefined' && Game.camera) {
      const camPos = Game.camera.position.clone().sub(this.mesh.position);
      this.hpGroup.rotation.y = Math.atan2(camPos.x, camPos.z);
      const [,sph] = this.cfg.spriteSize;
      this.hpGroup.position.y = sph * 0.35;
    }

    // Projectiles
    this.projectiles = this.projectiles.filter(p => {
      p.lifetime -= delta;
      p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
      // Animate sprite pulse
      if (p.sprite) {
        const pulse = 1 + Math.sin(Date.now() * 0.012) * 0.2;
        const sz = p.projSize || 2.0;
        p.sprite.scale.set(sz * pulse, sz * pulse, 1);
        p.sprite.material.rotation += delta * 2;
      }
      // Spin ring
      if (p.ring) {
        p.ring.rotation.x += delta * 8;
        p.ring.rotation.y += delta * 6;
      }
      // Particle trail
      p._trailTimer = (p._trailTimer || 0) - delta;
      if (p._trailTimer <= 0 && p.color) {
        p._trailTimer = 0.04;
        Particles.burst(p.mesh.position.clone(), p.color, 5, 2, 0.25);
      }
      if (p.lifetime <= 0) { this.scene.remove(p.mesh); return false; }
      return true;
    });
  }

  _shootAt(targetPos) {
    const origin = this.mesh.position.clone().add(new THREE.Vector3(0, 2.5, 0));
    const dir    = targetPos.clone().add(new THREE.Vector3(0,2,0)).sub(origin);
    dir.normalize();

    const color = this.cfg.color;
    const group = new THREE.Group();
    group.position.copy(origin);

    // ── Main projectile sprite (like wizard fireball) ────
    const tex = new THREE.TextureLoader().load(this.cfg.projImg);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spriteMat = new THREE.SpriteMaterial({
      map: tex, transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false,
      color: color
    });
    const sprite = new THREE.Sprite(spriteMat);
    const sz = this.cfg.projSize || 2.0;
    sprite.scale.set(sz, sz, 1);
    group.add(sprite);

    // ── Bright white core ──────────────────────────────
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color:0xffffff, blending:THREE.AdditiveBlending })
    );
    group.add(core);

    // ── Spinning energy ring ───────────────────────────
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(sz * 0.25, 0.03, 6, 16),
      new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.6, blending:THREE.AdditiveBlending })
    );
    group.add(ring);

    // ── Point light ────────────────────────────────────
    const light = new THREE.PointLight(color, 4, 10);
    group.add(light);

    this.scene.add(group);
    this.projectiles.push({
      mesh: group, velocity: dir.multiplyScalar(14), lifetime: 2.5,
      damage: this.cfg.damage, ring, sprite, core, _trailTimer: 0, color, projSize: sz
    });
    Particles.burst(origin, color, 25, 5, 0.4);
  }

  checkProjectileHits(player) {
    if (!player.isAlive) return;
    this.projectiles = this.projectiles.filter(p => {
      const hitR = player.shielded ? 2.5 : 1.5;
      if (p.mesh.position.distanceTo(player.mesh.position.clone().add(new THREE.Vector3(0,2,0))) < hitR) {
        player.takeDamage(p.damage);
        Particles.burst(p.mesh.position, 0xff4444, 25, 3);
        this.scene.remove(p.mesh);
        return false;
      }
      return true;
    });
  }

  takeDamage(amount, effect, duration) {
    if (!this.alive) return;
    this.health -= amount;
    if (effect === 'stun') this.stunTimer = duration || 0;
    if (effect === 'slow') this.slowTimer = duration || 0;

    // Blink sprite white on hit
    this.sprite.material.color.setHex(0xffffff);
    const savedColor = this.cfg.color;
    setTimeout(() => {
      if (this.alive && this.sprite) this.sprite.material.color.setHex(0xffffff);
    }, 80);

    if (this.health <= 0) this.die();
  }

  die() {
    this.alive = false;
    Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0,2.5,0)), this.cfg.color, 90, 7);
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
    { enemies:[{type:'CHARGER',count:3},{type:'ORBITER',count:1}], delay:1.5 },
    { enemies:[{type:'CHARGER',count:5},{type:'TELEPORTER',count:1}], delay:1.2 },
    { enemies:[{type:'CHARGER',count:4},{type:'ORBITER',count:2}], delay:1.0 },
    { enemies:[{type:'SWARM',count:10},{type:'TELEPORTER',count:2}], delay:0.7 },
    { enemies:[{type:'CHARGER',count:6},{type:'ORBITER',count:3}], delay:0.8 },
    { enemies:[{type:'TANK',count:1},{type:'SWARM',count:6}], delay:1.0 },
    { enemies:[{type:'CHARGER',count:8},{type:'TELEPORTER',count:3}], delay:0.6 },
    { enemies:[{type:'ORBITER',count:5},{type:'SWARM',count:8}], delay:0.6 },
    { enemies:[{type:'TANK',count:2},{type:'CHARGER',count:5}], delay:0.5 },
    { enemies:[{type:'TANK',count:1},{type:'ORBITER',count:4},{type:'SWARM',count:10}], delay:0.4 }
  ];

  startWave() {
    this.currentWave++;
    const def = WaveManager.WAVES[Math.min(this.currentWave-1, WaveManager.WAVES.length-1)];
    this.spawnQueue = [];
    def.enemies.forEach(g => { for (let i=0;i<g.count;i++) this.spawnQueue.push(g.type); });
    for (let i=this.spawnQueue.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [this.spawnQueue[i],this.spawnQueue[j]]=[this.spawnQueue[j],this.spawnQueue[i]];
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
        const def = WaveManager.WAVES[Math.min(this.currentWave-1, WaveManager.WAVES.length-1)];
        this._spawnEnemy(this.spawnQueue.shift());
        this.spawnTimer = def.delay;
      }
    }

    this.enemies.forEach(e => {
      if (!e.alive) return;
      e.update(delta, playerPos);
      e.checkProjectileHits(Game.player);

      // Melee contact
      if (e.type !== 'ORBITER' && e.type !== 'TELEPORTER' && Game.player.isAlive) {
        const dist = e.mesh.position.distanceTo(playerPos);
        if (dist < e.cfg.attackRange && e.attackTimer <= 0) {
          Game.player.takeDamage(e.cfg.damage);
          e.attackTimer = e.cfg.attackCooldown;
        }
      }
    });

    if (this.spawnQueue.length===0 && this.enemies.every(e=>!e.alive) && this.waveActive) {
      this.waveActive = false;
      this.waveDone   = true;
    }
  }

  _spawnEnemy(type) {
    const angle = Math.random() * Math.PI * 2;
    const r     = 27 + Math.random() * 3;
    const pos   = new THREE.Vector3(Math.cos(angle)*r, 0, Math.sin(angle)*r);
    this.enemies.push(new Enemy(type, pos, this.scene));
  }

  clearAll() {
    this.enemies.forEach(e => { if (e.alive) e.die(); });
    this.enemies=[]; this.spawnQueue=[];
    this.waveActive=false; this.waveDone=false;
  }

  get aliveCount() { return this.enemies.filter(e=>e.alive).length + this.spawnQueue.length; }
}
