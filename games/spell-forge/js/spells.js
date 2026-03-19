/* spells.js — Spell definitions, projectiles, SpellManager (with dramatic fire/ice visuals) */

const SPELL_DEFS = {
  FIREBALL:  { id:0, name:'Fireball',  icon:'🔥', gesture:'LINE_UP',   key:'1', manaCost:15, damage:25, speed:20, lifetime:3,   cooldown:0.5, color:0xff4400, size:0.6,  aoe:3,    effect:'explode' },
  ICE_SHARD: { id:1, name:'Ice Shard', icon:'❄️',  gesture:'LINE_DOWN', key:'2', manaCost:12, damage:20, speed:28, lifetime:2,   cooldown:0.3, color:0x88eeff, size:0.4,  effect:'slow'    },
  LIGHTNING: { id:2, name:'Lightning', icon:'⚡',  gesture:'ZIGZAG',    key:'3', manaCost:20, damage:40, speed:0,  lifetime:0.2, cooldown:1.0, color:0xffee00, size:0.2,  effect:'stun', range:45 },
  SHIELD:    { id:3, name:'Shield',    icon:'🛡️',  gesture:'CIRCLE',    key:'4', manaCost:25, damage:0,  cooldown:8.0, duration:5, color:0x9933ff, effect:'shield'   },
  TORNADO:   { id:4, name:'Tornado',   icon:'🌪️',  gesture:'SPIRAL',    key:'5', manaCost:30, damage:15, speed:8,  lifetime:5,   cooldown:3.0, color:0x00ff88, size:1.2,  effect:'pull'    }
};

const GESTURE_MAP = {};
Object.values(SPELL_DEFS).forEach(s => { if (s.gesture) GESTURE_MAP[s.gesture] = s.name; });

// Preload spell textures
const SpellTextures = {};
const loader = new THREE.TextureLoader();
SpellTextures.fireball = loader.load('img/fireball.png');
SpellTextures.iceshard = loader.load('img/iceshard.png');

// ══════════════════════════════════════════════════════════════
// Projectile
// ══════════════════════════════════════════════════════════════
class Projectile {
  constructor(spellName, origin, direction, scene) {
    this.spellName = spellName;
    this.spell     = SPELL_DEFS[spellName];
    this.scene     = scene;
    this.lifetime  = this.spell.lifetime;
    this.age       = 0;
    this.active    = true;
    this.velocity  = direction.clone().normalize().multiplyScalar(this.spell.speed);

    this._buildProjectile(origin);
  }

  _buildProjectile(origin) {
    this.mesh = new THREE.Group();
    this.mesh.position.copy(origin);
    this.scene.add(this.mesh);

    switch (this.spellName) {
      case 'FIREBALL':  this._buildFireball(); break;
      case 'ICE_SHARD': this._buildIceShard(); break;
      case 'TORNADO':   this._buildTornado();  break;
      default:          this._buildGeneric();  break;
    }
  }

  _buildFireball() {
    // ── Central sprite ─────────────────────────────
    const spriteMat = new THREE.SpriteMaterial({
      map: SpellTextures.fireball, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      color: 0xff5500
    });
    this.fireSprite = new THREE.Sprite(spriteMat);
    this.fireSprite.scale.set(2.8, 2.8, 1);
    this.mesh.add(this.fireSprite);

    // ── Bright core orb ────────────────────────────
    const coreGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffee44, blending: THREE.AdditiveBlending });
    const core    = new THREE.Mesh(coreGeo, coreMat);
    this.mesh.add(core);

    // ── Point light — orange-red ────────────────────
    this.light = new THREE.PointLight(0xff4400, 8, 14);
    this.mesh.add(this.light);

    // ── Secondary warm glow ─────────────────────────
    this.light2 = new THREE.PointLight(0xff9900, 4, 8);
    this.mesh.add(this.light2);
  }

  _buildIceShard() {
    // ── Crystal spike geometry (elongated) ──────────
    const geo = new THREE.ConeGeometry(0.15, 1.6, 6);
    const mat = new THREE.MeshPhongMaterial({
      color: 0xaaeeff, emissive: 0x0088cc, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.88, shininess: 200
    });
    const spike = new THREE.Mesh(geo, mat);
    spike.rotation.x = Math.PI / 2;  // point forward
    this.mesh.add(spike);

    // ── Ice sprite overlay ──────────────────────────
    const spriteMat = new THREE.SpriteMaterial({
      map: SpellTextures.iceshard, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      color: 0x88ddff, opacity: 0.7
    });
    this.iceSprite = new THREE.Sprite(spriteMat);
    this.iceSprite.scale.set(2.2, 2.2, 1);
    this.mesh.add(this.iceSprite);

    // ── Secondary mini spikes ───────────────────────
    for (let i = 0; i < 4; i++) {
      const sg  = new THREE.ConeGeometry(0.06, 0.5, 4);
      const sm  = new THREE.MeshBasicMaterial({ color: 0xaaeeff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
      const sp  = new THREE.Mesh(sg, sm);
      const a   = (i / 4) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
      sp.rotation.x = Math.PI / 2;
      this.mesh.add(sp);
    }

    // ── Ice blue light ──────────────────────────────
    this.light  = new THREE.PointLight(0x44ccff, 6, 10);
    this.light2 = new THREE.PointLight(0xaaeeff, 3, 6);
    this.mesh.add(this.light);
    this.mesh.add(this.light2);

    // ── Frost trail timer ───────────────────────────
    this._trailTimer = 0;
  }

  _buildTornado() {
    // ── Vortex funnel: stacked spinning rings ────────
    this.vortexRings = [];
    const ringCount = 6;
    for (let i = 0; i < ringCount; i++) {
      const t = i / (ringCount - 1); // 0 at bottom, 1 at top
      const radius = 0.3 + t * 0.9;
      const geo = new THREE.TorusGeometry(radius, 0.06, 6, 20);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().lerpColors(new THREE.Color(0x00ff88), new THREE.Color(0x44ffdd), t),
        transparent: true, opacity: 0.7 - t * 0.25,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.position.y = -1.0 + t * 2.5;
      ring.rotation.x = Math.PI / 2;
      ring.userData = { baseY: ring.position.y, speed: 4 + i * 1.5, phase: i * 0.8 };
      this.mesh.add(ring);
      this.vortexRings.push(ring);
    }

    // ── Glowing centre column ────────────────────────
    const colGeo = new THREE.CylinderGeometry(0.15, 0.05, 2.5, 8);
    const colMat = new THREE.MeshBasicMaterial({ color: 0xaaffcc, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
    this.vortexCol = new THREE.Mesh(colGeo, colMat);
    this.vortexCol.position.y = 0.25;
    this.mesh.add(this.vortexCol);

    // ── Orbiting debris particles ────────────────────
    this.debrisGroup = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const dGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const dMat = new THREE.MeshBasicMaterial({ color: 0x88ffaa, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
      const d = new THREE.Mesh(dGeo, dMat);
      const a = (i / 8) * Math.PI * 2;
      d.position.set(Math.cos(a) * 0.6, -0.5 + Math.random() * 2, Math.sin(a) * 0.6);
      d.userData = { angle: a, height: d.position.y, radius: 0.4 + Math.random() * 0.5 };
      this.debrisGroup.add(d);
    }
    this.mesh.add(this.debrisGroup);

    // ── Lights ───────────────────────────────────────
    this.light = new THREE.PointLight(0x00ff88, 6, 14);
    this.mesh.add(this.light);
    const light2 = new THREE.PointLight(0x44ffdd, 3, 8);
    light2.position.y = 1.5;
    this.mesh.add(light2);

    this._trailTimer = 0;
  }

  _buildGeneric() {
    const geo = new THREE.SphereGeometry(this.spell.size || 0.4, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: this.spell.color, blending: THREE.AdditiveBlending });
    const s   = new THREE.Mesh(geo, mat);
    this.mesh.add(s);
    this.light = new THREE.PointLight(this.spell.color, 4, 10);
    this.mesh.add(this.light);
  }

  update(delta) {
    this.age += delta;
    if (this.age >= this.lifetime) { this.destroy(); return; }

    this.mesh.position.add(this.velocity.clone().multiplyScalar(delta));
    if (this.mesh.position.y < 1.0) this.mesh.position.y = 1.0;

    const t = this.age;

    if (this.spellName === 'FIREBALL') {
      // Pulsing flame
      const pulse = 1 + Math.sin(Date.now() * 0.015) * 0.12;
      if (this.fireSprite) this.fireSprite.scale.setScalar(2.8 * pulse);
      if (this.light)  this.light.intensity  = 7 + Math.sin(Date.now() * 0.02) * 2;
      if (this.light2) this.light2.intensity = 3 + Math.sin(Date.now() * 0.03) * 1.5;

      // Emit fire particles as trail
      this._trailTimer = (this._trailTimer || 0) - delta;
      if (this._trailTimer <= 0) {
        this._trailTimer = 0.035;
        Particles.burstFire(this.mesh.position.clone(), 5);
      }
    }

    if (this.spellName === 'ICE_SHARD') {
      // Rotate the shard
      this.mesh.rotation.z += delta * 3;

      // Point toward velocity
      if (this.velocity.length() > 0.1) {
        const fwd = this.velocity.clone().normalize();
        this.mesh.lookAt(this.mesh.position.clone().add(fwd));
      }

      // Frost particle trail
      this._trailTimer = (this._trailTimer || 0) - delta;
      if (this._trailTimer <= 0) {
        this._trailTimer = 0.04;
        Particles.burstFrost(this.mesh.position.clone(), 5);
      }

      if (this.light) this.light.intensity = 5 + Math.sin(Date.now() * 0.015) * 1.5;
    }

    if (this.spellName === 'TORNADO') {
      // Spin each vortex ring at different speeds
      if (this.vortexRings) {
        this.vortexRings.forEach(ring => {
          ring.rotation.z += delta * ring.userData.speed;
          ring.position.y = ring.userData.baseY + Math.sin(t * 3 + ring.userData.phase) * 0.15;
        });
      }
      // Pulse column
      if (this.vortexCol) {
        this.vortexCol.rotation.y += delta * 3;
        const p = 1 + Math.sin(t * 5) * 0.15;
        this.vortexCol.scale.set(p, 1, p);
      }
      // Orbit debris
      if (this.debrisGroup) {
        this.debrisGroup.children.forEach(d => {
          d.userData.angle += delta * 5;
          const r = d.userData.radius + Math.sin(t * 2) * 0.1;
          d.position.x = Math.cos(d.userData.angle) * r;
          d.position.z = Math.sin(d.userData.angle) * r;
          d.position.y = d.userData.height + Math.sin(t * 4 + d.userData.angle) * 0.3;
          d.rotation.x += delta * 8;
          d.rotation.z += delta * 6;
        });
      }
      // Green wind trail
      this._trailTimer = (this._trailTimer || 0) - delta;
      if (this._trailTimer <= 0) {
        this._trailTimer = 0.04;
        Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, Math.random() * 2 - 0.5, 0)), 0x44ffaa, 3, 2, 0.3);
      }
      if (this.light) this.light.intensity = 5 + Math.sin(t * 6) * 2;
      // Homing
      if (typeof Game !== 'undefined') {
        let nearest = null, bestDist = Infinity;
        Game.enemies.forEach(e => {
          if (!e.alive) return;
          const d = this.mesh.position.distanceTo(e.mesh.position);
          if (d < bestDist) { bestDist = d; nearest = e; }
        });
        if (nearest && bestDist < 20) {
          const toEnemy = nearest.mesh.position.clone().sub(this.mesh.position).normalize();
          this.velocity.lerp(toEnemy.multiplyScalar(this.spell.speed), delta * 1.5);
        }
      }
    }
  }

  destroy() {
    if (!this.active) return;
    this.active = false;
    this.scene.remove(this.mesh);
  }
}

// ══════════════════════════════════════════════════════════════
// SpellManager
// ══════════════════════════════════════════════════════════════
class SpellManager {
  constructor(scene) {
    this.scene = scene;
    this.projectiles = [];
    this.cooldowns   = {};
    this.lastSpell   = null;
    Object.keys(SPELL_DEFS).forEach(k => this.cooldowns[k] = 0);
  }

  update(delta) {
    Object.keys(this.cooldowns).forEach(k => {
      if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - delta);
    });
    this.projectiles = this.projectiles.filter(p => { p.update(delta); return p.active; });
  }

  canCast(name, player) {
    const s = SPELL_DEFS[name];
    if (!s) return false;
    if (this.cooldowns[name] > 0) return false;
    if (player.mana < s.manaCost) return false;
    return true;
  }

  cast(name, player, facingDir) {
    const spell = SPELL_DEFS[name];
    if (!spell || !this.canCast(name, player)) return false;

    player.mana -= spell.manaCost;
    this.cooldowns[name] = spell.cooldown;
    this.lastSpell = name;
    if (typeof Game !== 'undefined') Game.totalSpells++;

    if (typeof player.setSpellColor === 'function') player.setSpellColor(spell.color);

    if (spell.effect === 'shield') {
      player.activateShield(spell.duration);
      Particles.burst(player.mesh.position, spell.color, 100, 8);
      return true;
    }
    if (name === 'LIGHTNING') { this._castLightning(spell, player, facingDir); return true; }

    const origin = player.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0));
    const dir    = facingDir.clone(); dir.y = 0;
    const proj   = new Projectile(name, origin, dir, this.scene);
    this.projectiles.push(proj);

    // Cast-origin burst (differentiated by spell)
    if (name === 'FIREBALL') {
      Particles.burstFire(origin, 30);
      Particles.ring(origin, 0xff4400, 2.5);
    } else if (name === 'ICE_SHARD') {
      Particles.burstFrost(origin, 30);
      Particles.ring(origin, 0x44ccff, 2.0);
    } else {
      Particles.burst(origin, spell.color, 20, 4);
    }
    return true;
  }

  _castLightning(spell, player, facingDir) {
    const origin = player.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0));
    const fwd    = facingDir.clone(); fwd.y = 0; fwd.normalize();

    let bestEnemy = null, bestScore = -Infinity;
    Game.enemies.forEach(e => {
      if (!e.alive) return;
      const toE  = e.mesh.position.clone().sub(player.mesh.position);
      const dist = toE.length();
      const dot  = toE.normalize().dot(fwd);
      if (dot > 0.2 && dist < (spell.range || 40)) {
        const score = dot * 2 - dist * 0.05;
        if (score > bestScore) { bestScore = score; bestEnemy = e; }
      }
    });

    if (bestEnemy) {
      const hitPos = bestEnemy.mesh.position.clone().add(new THREE.Vector3(0, 2, 0));
      bestEnemy.takeDamage(spell.damage, 'stun', 1.2);
      UI.showDamageNumber(bestEnemy.mesh.position, spell.damage, spell.color);
      Particles.lightning(origin, hitPos, spell.color);
      Game.addScore(20);
    } else {
      const proj = new Projectile('LIGHTNING', origin, fwd, this.scene);
      proj.velocity = fwd.multiplyScalar(50); proj.lifetime = 0.5;
      this.projectiles.push(proj);
    }
    Particles.burst(origin, spell.color, 40, 6);
  }

  checkCollisions(enemies) {
    for (const proj of this.projectiles) {
      if (!proj.active) continue;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const hitRadius = (proj.spell.size || 0.4) + enemy.cfg.radius;
        const enemyPos  = enemy.mesh.position.clone().add(new THREE.Vector3(0, enemy.cfg.spriteSize ? enemy.cfg.spriteSize[1]/2 : 1.5, 0));
        if (proj.mesh.position.distanceTo(enemyPos) < hitRadius) {
          const dmg = proj.spell.damage;
          const eff = proj.spell.effect;
          enemy.takeDamage(dmg, eff, eff === 'stun' ? 1.0 : eff === 'slow' ? 2.5 : 0);
          UI.showDamageNumber(enemy.mesh.position, dmg, proj.spell.color);

          // Spell-specific hit effects
          if (proj.spellName === 'FIREBALL') {
            Particles.burstFire(proj.mesh.position.clone(), 80);
            Particles.ring(proj.mesh.position.clone(), 0xff4400, 4);
            // AOE
            enemies.forEach(e2 => {
              if (!e2.alive || e2 === enemy) return;
              if (e2.mesh.position.distanceTo(proj.mesh.position) < (proj.spell.aoe || 3)) {
                e2.takeDamage(Math.floor(dmg * 0.5));
              }
            });
          } else if (proj.spellName === 'ICE_SHARD') {
            Particles.burstFrost(proj.mesh.position.clone(), 60);
            Particles.iceShatter(proj.mesh.position.clone());
          } else if (proj.spellName === 'TORNADO') {
            enemies.forEach(e2 => {
              if (!e2.alive) return;
              const d = e2.mesh.position.distanceTo(proj.mesh.position);
              if (d < 8) {
                const pull = proj.mesh.position.clone().sub(e2.mesh.position).normalize().multiplyScalar(5);
                e2.mesh.position.add(pull.multiplyScalar(0.05));
              }
            });
            Particles.burst(proj.mesh.position, 0x00ff88, 40, 6);
          } else {
            Particles.burst(proj.mesh.position, proj.spell.color, 35, 4);
          }

          if (!enemy.alive) Game.onEnemyKilled();
          proj.destroy();
          break;
        }
      }
    }
  }

  getCooldownProgress(name) {
    const s = SPELL_DEFS[name];
    if (!s || !this.cooldowns[name]) return 0;
    return this.cooldowns[name] / s.cooldown;
  }

  clearProjectiles() {
    this.projectiles.forEach(p => p.destroy());
    this.projectiles = [];
    Object.keys(this.cooldowns).forEach(k => this.cooldowns[k] = 0);
  }
}
