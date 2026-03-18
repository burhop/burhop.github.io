/* spells.js — Spell definitions, projectiles, SpellManager */

const SPELL_DEFS = {
  FIREBALL:  { id:0, name:'Fireball',   icon:'🔥', gesture:'LINE_UP',    key:'1', manaCost:15, damage:25, speed:20, lifetime:3,   cooldown:0.5, color:0xff4400, size:0.45, aoe:3,    effect:'explode' },
  ICE_SHARD: { id:1, name:'Ice Shard',  icon:'❄️',  gesture:'LINE_DOWN',  key:'2', manaCost:12, damage:20, speed:28, lifetime:2,   cooldown:0.3, color:0x00ddff, size:0.3,  effect:'slow'    },
  LIGHTNING: { id:2, name:'Lightning',  icon:'⚡',  gesture:'ZIGZAG',     key:'3', manaCost:20, damage:40, speed:0,  lifetime:0.2, cooldown:1.0, color:0xffee00, size:0.2,  effect:'stun', range:45 },
  SHIELD:    { id:3, name:'Shield',     icon:'🛡️',  gesture:'CIRCLE',     key:'4', manaCost:25, damage:0,  cooldown:8.0, duration:5, color:0x9933ff, effect:'shield'   },
  TORNADO:   { id:4, name:'Tornado',    icon:'🌪️',  gesture:'SPIRAL',     key:'5', manaCost:30, damage:15, speed:8,  lifetime:5,   cooldown:3.0, color:0x00ff88, size:1.2,  effect:'pull'    }
};

const GESTURE_MAP = {};
Object.values(SPELL_DEFS).forEach(s => { if (s.gesture) GESTURE_MAP[s.gesture] = s.name; });

// ---- Projectile ----
class Projectile {
  constructor(spellName, origin, direction, scene) {
    this.spellName = spellName;
    this.spell = SPELL_DEFS[spellName];
    this.scene = scene;
    this.lifetime = this.spell.lifetime;
    this.age = 0;
    this.active = true;
    this.velocity = direction.clone().normalize().multiplyScalar(this.spell.speed);

    // Mesh
    const geo = new THREE.SphereGeometry(this.spell.size || 0.4, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: this.spell.color });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(origin);
    scene.add(this.mesh);

    // Inner glow — slightly larger, additive
    const geoG = new THREE.SphereGeometry((this.spell.size || 0.4) * 2.5, 10, 10);
    const matG = new THREE.MeshBasicMaterial({ color: this.spell.color, transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glow = new THREE.Mesh(geoG, matG);
    this.mesh.add(this.glow);

    // Point light for local illumination
    this.light = new THREE.PointLight(this.spell.color, 3, 10);
    this.mesh.add(this.light);
  }

  update(delta) {
    this.age += delta;
    if (this.age >= this.lifetime) { this.destroy(); return; }

    this.mesh.position.add(this.velocity.clone().multiplyScalar(delta));

    // Floor clamp
    if (this.mesh.position.y < 0.4) this.mesh.position.y = 0.4;

    // Tornado homing behaviour
    if (this.spellName === 'TORNADO' && typeof Game !== 'undefined') {
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

  destroy() {
    if (!this.active) return;
    this.active = false;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ---- SpellManager ----
class SpellManager {
  constructor(scene) {
    this.scene = scene;
    this.projectiles = [];
    this.cooldowns = {};
    this.lastSpell = null;
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
    Game.totalSpells++;

    if (spell.effect === 'shield') {
      player.activateShield(spell.duration);
      Particles.burst(player.mesh.position, spell.color, 100, 8);
      return true;
    }

    if (name === 'LIGHTNING') {
      this._castLightning(spell, player, facingDir);
      return true;
    }

    // Projectile-based spells
    const origin = player.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const dir = facingDir.clone(); dir.y = 0;
    const proj = new Projectile(name, origin, dir, this.scene);
    this.projectiles.push(proj);
    Particles.burst(origin, spell.color, 20, 4);
    return true;
  }

  _castLightning(spell, player, facingDir) {
    const origin = player.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    const fwd = facingDir.clone(); fwd.y = 0; fwd.normalize();

    // Find best target in cone
    let bestEnemy = null, bestScore = -Infinity;
    Game.enemies.forEach(e => {
      if (!e.alive) return;
      const toE = e.mesh.position.clone().sub(player.mesh.position);
      const dist = toE.length();
      const dot = toE.normalize().dot(fwd);
      if (dot > 0.2 && dist < (spell.range || 40)) {
        const score = dot * 2 - dist * 0.05;
        if (score > bestScore) { bestScore = score; bestEnemy = e; }
      }
    });

    if (bestEnemy) {
      bestEnemy.takeDamage(spell.damage, 'stun', 1.2);
      UI.showDamageNumber(bestEnemy.mesh.position, spell.damage, spell.color);
      Particles.lightning(origin, bestEnemy.mesh.position, spell.color);
      Game.addScore(20);
    } else {
      // Shoot forward as fast bolt
      const proj = new Projectile('LIGHTNING', origin, fwd, this.scene);
      proj.velocity = fwd.multiplyScalar(50);
      proj.lifetime = 0.5;
      this.projectiles.push(proj);
    }
    Particles.burst(origin, spell.color, 40, 6);
  }

  checkCollisions(enemies) {
    for (const proj of this.projectiles) {
      if (!proj.active) continue;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const hitRadius = (proj.spell.size || 0.4) + 1.5;
        if (proj.mesh.position.distanceTo(enemy.mesh.position) < hitRadius) {
          const dmg = proj.spell.damage;
          const eff = proj.spell.effect;
          enemy.takeDamage(dmg, eff, eff === 'stun' ? 1.0 : eff === 'slow' ? 2.0 : 0);
          UI.showDamageNumber(enemy.mesh.position, dmg, proj.spell.color);
          Particles.burst(proj.mesh.position, proj.spell.color, 35, 4);

          // AOE for fireball
          if (eff === 'explode') {
            enemies.forEach(e2 => {
              if (!e2.alive || e2 === enemy) return;
              if (e2.mesh.position.distanceTo(proj.mesh.position) < (proj.spell.aoe || 3)) {
                e2.takeDamage(Math.floor(dmg * 0.5), null, 0);
              }
            });
            Particles.burst(proj.mesh.position, 0xff4400, 60, 7);
          }

          // Tornado pull enemies in
          if (eff === 'pull') {
            enemies.forEach(e2 => {
              if (!e2.alive) return;
              const d = e2.mesh.position.distanceTo(proj.mesh.position);
              if (d < 8) {
                const pull = proj.mesh.position.clone().sub(e2.mesh.position).normalize().multiplyScalar(5);
                e2.mesh.position.add(pull.multiplyScalar(0.05));
              }
            });
          }

          if (!enemy.alive) {
            Game.onEnemyKilled();
          }
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
