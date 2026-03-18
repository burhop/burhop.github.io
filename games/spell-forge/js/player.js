/* player.js — Sprite-based wizard character with glow rings and staff light */

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
    this.keys        = {};
    this._buildModel();
    this._bindKeys();
  }

  _buildModel() {
    this.mesh = new THREE.Group();
    this.scene.add(this.mesh);

    // ── Wizard sprite (billboard) ──────────────────────
    const tex = new THREE.TextureLoader().load('img/wizard.png');
    tex.colorSpace = THREE.SRGBColorSpace;
    const spriteMat = new THREE.SpriteMaterial({
      map: tex, transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.sprite = new THREE.Sprite(spriteMat);
    this.sprite.scale.set(3.5, 4.8, 1);
    this.sprite.position.y = 2.4;
    this.mesh.add(this.sprite);

    // ── Shadow ellipse on floor ───────────────────────
    const shadowGeo = new THREE.CircleGeometry(0.9, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
    const shadow    = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.mesh.add(shadow);

    // ── 3 orbiting energy rings ───────────────────────
    this.rings = [];
    [
      { r:1.0, tube:0.04, color:0x8b5cf6, tilt:0,            speed: 1.2 },
      { r:1.3, tube:0.03, color:0x22d3ee, tilt:Math.PI/3,    speed:-0.8 },
      { r:0.8, tube:0.025,color:0xf472b6, tilt:Math.PI/2,    speed: 1.8 },
    ].forEach(cfg => {
      const geo  = new THREE.TorusGeometry(cfg.r, cfg.tube, 6, 64);
      const mat  = new THREE.MeshBasicMaterial({ color:cfg.color, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending, depthWrite:false });
      const ring = new THREE.Mesh(geo, mat);
      ring.position.y = 2.0;
      ring.rotation.x = cfg.tilt;
      ring.userData.speed = cfg.speed;
      this.mesh.add(ring);
      this.rings.push(ring);
    });

    // ── Shield sphere ─────────────────────────────────
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 24, 24),
      new THREE.MeshBasicMaterial({ color:0x9933ff, transparent:true, opacity:0.0, wireframe:true, blending:THREE.AdditiveBlending, depthWrite:false })
    );
    this.shieldMesh.position.y = 2.0;
    this.mesh.add(this.shieldMesh);

    this.shieldOuter = new THREE.Mesh(
      new THREE.SphereGeometry(2.35, 24, 24),
      new THREE.MeshBasicMaterial({ color:0xbb66ff, transparent:true, opacity:0.0, side:THREE.BackSide, blending:THREE.AdditiveBlending, depthWrite:false })
    );
    this.shieldOuter.position.y = 2.0;
    this.mesh.add(this.shieldOuter);

    // ── Staff tip light ───────────────────────────────
    this.staffLight = new THREE.PointLight(0xfacc15, 5, 9);
    this.staffLight.position.set(0.5, 4.2, 0);
    this.mesh.add(this.staffLight);

    // ── Player area glow ──────────────────────────────
    this.playerLight = new THREE.PointLight(0x8b5cf6, 3, 14);
    this.playerLight.position.y = 2.0;
    this.mesh.add(this.playerLight);

    // ── Glow halo behind sprite ───────────────────────
    const haloGeo = new THREE.CircleGeometry(1.4, 24);
    const haloMat = new THREE.MeshBasicMaterial({ color:0x8b5cf6, transparent:true, opacity:0.2, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
    this.halo = new THREE.Mesh(haloGeo, haloMat);
    this.halo.position.y = 2.2;
    this.mesh.add(this.halo);
  }

  _bindKeys() {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); this.dash(); }
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  setSpellColor(color) {
    this.playerLight.color.setHex(color);
    this.halo.material.color.setHex(color);
    this.rings[0].material.color.setHex(color);
  }

  update(delta, cameraForward, cameraRight) {
    if (!this.isAlive) return;

    this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * delta);
    this.dashTimer       = Math.max(0, this.dashTimer - delta);
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
    }

    const HALF = 26;
    this.mesh.position.x = Math.max(-HALF, Math.min(HALF, this.mesh.position.x));
    this.mesh.position.z = Math.max(-HALF, Math.min(HALF, this.mesh.position.z));
    this.mesh.position.y = 0;

    const t = Date.now() * 0.001;

    // Hover animation
    this.sprite.position.y = 2.4 + Math.sin(t * 2.2) * 0.12;
    this.halo.position.y   = 2.2 + Math.sin(t * 2.2) * 0.12;

    // Flip sprite when moving left
    if (moveVec.x < -0.001) this.sprite.scale.x = -3.5;
    else if (moveVec.x > 0.001) this.sprite.scale.x = 3.5;

    // Animate rings
    this.rings.forEach(ring => {
      ring.rotation.y += ring.userData.speed * delta;
      ring.rotation.z += ring.userData.speed * 0.3 * delta;
    });

    // Lights flicker
    this.staffLight.intensity = 4 + Math.sin(t * 5) * 1.5;
    this.playerLight.intensity = 2.5 + Math.sin(t * 7) * 0.5;

    // Halo pulse
    this.halo.material.opacity = 0.15 + Math.sin(t * 3) * 0.07;

    // Shield shimmer
    if (this.shielded) {
      this.shieldMesh.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
      this.shieldMesh.material.opacity  = 0.28 + Math.sin(t * 4) * 0.1;
      this.shieldOuter.material.opacity = 0.09 + Math.sin(t * 6) * 0.04;
    }

    // Invincibility flicker (dash / post-hit)
    if (this.invincibleTimer > 0) {
      this.sprite.material.opacity = Math.sin(Date.now() * 0.04) > 0 ? 1 : 0.3;
    } else {
      this.sprite.material.opacity = 1;
    }
  }

  dash() {
    if (this.dashTimer > 0 || !this.isAlive) return;
    const fwd = this._getForward();
    this.dashVelocity = fwd.multiplyScalar(this.dashSpeed);
    this.dashActive   = true;
    this.invincibleTimer = 0.35;
    this.dashTimer    = this.dashCooldown;
    Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 0x22d3ee, 45, 6, 0.5);
    Particles.ring(this.mesh.position.clone(), 0x22d3ee, 3);
  }

  _getForward() {
    // Use camera forward if available
    if (typeof Game !== 'undefined') return Game._getCameraForward();
    return new THREE.Vector3(0, 0, -1);
  }

  activateShield(duration) {
    this.shielded     = true;
    this.shieldTimer  = duration;
    this.shieldAbsorb = 120;
    this.shieldMesh.material.opacity  = 0.28;
    this.shieldOuter.material.opacity = 0.09;
    document.getElementById('shield-indicator').classList.remove('hidden');
    Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 0xbb66ff, 100, 7);
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
      Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 0xbb66ff, 25, 4);
      if (this.shieldAbsorb <= 0) this.deactivateShield();
      return;
    }
    this.health -= amount;
    this.invincibleTimer = 0.5;
    UI.flashDamage();
    if (typeof Game !== 'undefined') Game.cameraShake = 0.4;
    if (this.health <= 0) { this.health = 0; this.die(); }
  }

  die() {
    this.isAlive = false;
    Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 0xf87171, 150, 9);
    Particles.ring(this.mesh.position.clone(), 0xff0000, 8);
    setTimeout(() => { if (typeof Game !== 'undefined') Game.gameOver(); }, 1800);
  }

  get position() { return this.mesh.position; }

  reset() {
    this.health = this.maxHealth;  this.mana = this.maxMana;
    this.isAlive = true; this.shielded = false;
    this.shieldMesh.material.opacity  = 0.0;
    this.shieldOuter.material.opacity = 0.0;
    this.dashTimer = 0; this.invincibleTimer = 0;
    this.sprite.material.opacity = 1;
    this.mesh.position.set(0, 0, 0);
    document.getElementById('shield-indicator').classList.add('hidden');
  }
}
