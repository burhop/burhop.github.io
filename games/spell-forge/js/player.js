/* player.js — Enhanced visuals: floating orb with energy rings, glow aura */

class Player {
  constructor(scene) {
    this.scene = scene;
    this.isAlive     = true;
    this.health      = 100;  this.maxHealth = 100;
    this.mana        = 100;  this.maxMana   = 100;
    this.manaRegen   = 10;
    this.moveSpeed   = 6;
    this.dashSpeed   = 22;
    this.dashCooldown = 2;
    this.dashTimer    = 0;
    this.dashActive   = false;
    this.dashVelocity = new THREE.Vector3();
    this.shielded     = false;
    this.shieldTimer  = 0;
    this.shieldAbsorb = 100;
    this.invincibleTimer = 0;
    this.isAlive     = true;
    this.spellColor  = 0x8b5cf6;  // updates per spell cast
    this.keys        = {};
    this._buildModel();
    this._bindKeys();
  }

  _buildModel() {
    this.mesh = new THREE.Group();
    this.scene.add(this.mesh);

    // ── Core floating orb ──────────────────────────────────
    const orbGeo  = new THREE.SphereGeometry(0.65, 20, 20);
    const orbMat  = new THREE.MeshPhongMaterial({
      color: 0xc4b5fd, emissive: 0x8b5cf6, emissiveIntensity: 0.8,
      shininess: 120, transparent: true, opacity: 0.95
    });
    this.orb = new THREE.Mesh(orbGeo, orbMat);
    this.orb.position.y = 1.4;
    this.mesh.add(this.orb);

    // Inner brighter core
    const coreGeo = new THREE.SphereGeometry(0.3, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.orb.add(this.core);

    // Outer glow shell
    const glowGeo = new THREE.SphereGeometry(1.1, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6, transparent: true, opacity: 0.12,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.glowMesh = new THREE.Mesh(glowGeo, glowMat);
    this.orb.add(this.glowMesh);

    // ── Energy rings orbiting the player ──────────────────
    this.rings = [];
    const ringConfigs = [
      { r: 1.0, tube: 0.04, color: 0x8b5cf6, tilt: 0,            speed: 1.2 },
      { r: 1.3, tube: 0.03, color: 0x22d3ee, tilt: Math.PI/3,    speed:-0.8 },
      { r: 0.8, tube: 0.025,color: 0xf472b6, tilt: Math.PI/2,    speed: 1.8 },
    ];
    ringConfigs.forEach(cfg => {
      const geo = new THREE.TorusGeometry(cfg.r, cfg.tube, 6, 64);
      const mat = new THREE.MeshBasicMaterial({
        color: cfg.color, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.position.y = 1.4;
      ring.rotation.x = cfg.tilt;
      ring.userData = { speed: cfg.speed, baseTilt: cfg.tilt };
      this.mesh.add(ring);
      this.rings.push(ring);
    });

    // ── Staff ─────────────────────────────────────────────
    const staffGroup = new THREE.Group();
    staffGroup.position.set(0.7, 0.2, 0);
    staffGroup.rotation.z = 0.25;
    this.mesh.add(staffGroup);

    const shaftGeo = new THREE.CylinderGeometry(0.06, 0.09, 2.4, 6);
    const shaftMat = new THREE.MeshPhongMaterial({ color: 0x78350f, emissive: 0x451a03, emissiveIntensity: 0.4, shininess: 60 });
    const shaft    = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = 1.0;
    staffGroup.add(shaft);

    // Staff crystal tip
    const gemGeo = new THREE.OctahedronGeometry(0.22);
    const gemMat = new THREE.MeshPhongMaterial({ color: 0xfacc15, emissive: 0xfbbf24, emissiveIntensity: 0.9, shininess: 200, transparent: true, opacity: 0.9 });
    this.gem = new THREE.Mesh(gemGeo, gemMat);
    this.gem.position.y = 2.35;
    staffGroup.add(this.gem);

    this.staffTipLight = new THREE.PointLight(0xfacc15, 4, 7);
    this.staffTipLight.position.copy(this.gem.position);
    staffGroup.add(this.staffTipLight);

    // ── Shield sphere ─────────────────────────────────────
    const sGeo = new THREE.SphereGeometry(2.0, 24, 24);
    const sMat = new THREE.MeshBasicMaterial({
      color: 0x9933ff, transparent: true, opacity: 0.0,
      wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.shieldMesh = new THREE.Mesh(sGeo, sMat);
    this.shieldMesh.position.y = 1.2;
    this.mesh.add(this.shieldMesh);

    const sGeo2 = new THREE.SphereGeometry(2.1, 24, 24);
    const sMat2 = new THREE.MeshBasicMaterial({
      color: 0xbb66ff, transparent: true, opacity: 0.0,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.shieldOuter = new THREE.Mesh(sGeo2, sMat2);
    this.shieldOuter.position.y = 1.2;
    this.mesh.add(this.shieldOuter);

    // ── Player area light ─────────────────────────────────
    this.playerLight = new THREE.PointLight(0x8b5cf6, 3, 14);
    this.playerLight.position.y = 1.5;
    this.mesh.add(this.playerLight);

    this.mesh.position.set(0, 0, 0);
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); this.dash(); }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  setSpellColor(color) {
    this.spellColor = color;
    this.glowMesh.material.color.setHex(color);
    this.playerLight.color.setHex(color);
    this.rings[0].material.color.setHex(color);
  }

  update(delta, cameraForward, cameraRight) {
    if (!this.isAlive) return;

    this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * delta);
    this.dashTimer = Math.max(0, this.dashTimer - delta);
    this.invincibleTimer = Math.max(0, this.invincibleTimer - delta);

    if (this.shielded) {
      this.shieldTimer -= delta;
      if (this.shieldTimer <= 0) this.deactivateShield();
    }

    // Movement
    const moveVec = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    moveVec.add(cameraForward.clone());
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  moveVec.sub(cameraForward.clone());
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  moveVec.sub(cameraRight.clone());
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveVec.add(cameraRight.clone());
    moveVec.y = 0;

    if (this.dashActive) {
      this.mesh.position.add(this.dashVelocity.clone().multiplyScalar(delta));
      this.dashActive = false;
    } else if (moveVec.length() > 0.01) {
      moveVec.normalize().multiplyScalar(this.moveSpeed * delta);
      this.mesh.position.add(moveVec);
      const angle = Math.atan2(moveVec.x, moveVec.z);
      this.mesh.rotation.y = angle;
    }

    const HALF = 26;
    this.mesh.position.x = Math.max(-HALF, Math.min(HALF, this.mesh.position.x));
    this.mesh.position.z = Math.max(-HALF, Math.min(HALF, this.mesh.position.z));
    this.mesh.position.y = 0;

    const t = Date.now() * 0.001;

    // Orb hover + pulse
    this.orb.position.y = 1.4 + Math.sin(t * 2.1) * 0.15;
    const pulse = 0.95 + Math.sin(t * 3) * 0.08;
    this.orb.scale.setScalar(pulse);

    // Spinning rings
    this.rings.forEach((ring, i) => {
      ring.rotation.y += ring.userData.speed * delta;
      ring.rotation.z += ring.userData.speed * 0.3 * delta;
    });

    // Gem spin
    this.gem.rotation.y += delta * 2;
    this.staffTipLight.intensity = 3 + Math.sin(t * 5) * 1.5;

    // Shield shimmer
    if (this.shielded) {
      const sp = 1 + Math.sin(t * 4) * 0.08;
      this.shieldMesh.scale.setScalar(sp);
      this.shieldOuter.material.opacity = 0.08 + Math.sin(t * 6) * 0.04;
      this.shieldMesh.material.opacity  = 0.25 + Math.sin(t * 4) * 0.1;
      this.shieldMesh.rotation.y += delta;
    }

    // Player light flicker (combat vibe)
    this.playerLight.intensity = 2.5 + Math.sin(t * 7) * 0.5;
  }

  dash() {
    if (this.dashTimer > 0 || !this.isAlive) return;
    const fwd = new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
    this.dashVelocity = fwd.multiplyScalar(this.dashSpeed);
    this.dashActive   = true;
    this.invincibleTimer = 0.35;
    this.dashTimer    = this.dashCooldown;
    Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 0x22d3ee, 45, 6, 0.5);
    Particles.ring(this.mesh.position.clone(), 0x22d3ee, 3);
  }

  activateShield(duration) {
    this.shielded = true;
    this.shieldTimer  = duration;
    this.shieldAbsorb = 120;
    this.shieldMesh.material.opacity  = 0.25;
    this.shieldOuter.material.opacity = 0.08;
    document.getElementById('shield-indicator').classList.remove('hidden');
    Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xbb66ff, 100, 7);
    Particles.ring(this.mesh.position.clone(), 0x9933ff, 5);
  }

  deactivateShield() {
    this.shielded = false;
    this.shieldMesh.material.opacity  = 0.0;
    this.shieldOuter.material.opacity = 0.0;
    document.getElementById('shield-indicator').classList.add('hidden');
  }

  takeDamage(amount) {
    if (!this.isAlive || this.invincibleTimer > 0) return;
    if (this.shielded) {
      this.shieldAbsorb -= amount;
      Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xbb66ff, 25, 4);
      if (this.shieldAbsorb <= 0) this.deactivateShield();
      return;
    }
    this.health -= amount;
    this.invincibleTimer = 0.5;
    // Red flash on orb
    this.orb.material.emissive.setHex(0xff0000);
    setTimeout(() => { if (this.orb) this.orb.material.emissive.setHex(0x8b5cf6); }, 120);
    UI.flashDamage();
    if (typeof Game !== 'undefined') Game.cameraShake = 0.4;
    if (this.health <= 0) { this.health = 0; this.die(); }
  }

  die() {
    this.isAlive = false;
    Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 0xf87171, 150, 9);
    Particles.ring(this.mesh.position.clone(), 0xff0000, 8);
    setTimeout(() => { if (typeof Game !== 'undefined') Game.gameOver(); }, 1800);
  }

  get position() { return this.mesh.position; }

  reset() {
    this.health = this.maxHealth;
    this.mana   = this.maxMana;
    this.isAlive = true;
    this.shielded = false;
    this.shieldMesh.material.opacity  = 0.0;
    this.shieldOuter.material.opacity = 0.0;
    this.dashTimer = 0;
    this.invincibleTimer = 0;
    this.mesh.position.set(0, 0, 0);
    document.getElementById('shield-indicator').classList.add('hidden');
  }
}
