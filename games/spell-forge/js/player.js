/* player.js — Player controller: movement, dash, health/mana, shield */

class Player {
  constructor(scene) {
    this.scene = scene;
    this.isAlive = true;
    this.health    = 100;
    this.maxHealth = 100;
    this.mana      = 100;
    this.maxMana   = 100;
    this.manaRegen = 10;
    this.moveSpeed = 6;
    this.dashSpeed = 20;
    this.dashCooldown = 2;
    this.dashTimer = 0;
    this.dashActive = false;
    this.dashVelocity = new THREE.Vector3();
    this.shielded = false;
    this.shieldTimer = 0;
    this.shieldAbsorb = 100;
    this.invincibleTimer = 0; // brief post-hit invincibility
    this.deathTimer = 0;

    // Build player model
    this._buildModel();

    // Input state
    this.keys = {};
    this._bindKeys();
  }

  _buildModel() {
    const group = new THREE.Group();
    this.scene.add(group);
    this.mesh = group;

    // Body sphere
    const bodyGeo = new THREE.SphereGeometry(0.7, 12, 12);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x8b5cf6, emissive: 0x4c1d95, emissiveIntensity: 0.5, shininess: 80 });
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = 0.7;
    group.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.SphereGeometry(0.4, 10, 10);
    const headMat = new THREE.MeshPhongMaterial({ color: 0xc4b5fd, emissive: 0x6d28d9, emissiveIntensity: 0.4, shininess: 80 });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.position.y = 1.8;
    group.add(this.headMesh);

    // Staff
    const staffGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6);
    const staffMat = new THREE.MeshPhongMaterial({ color: 0xd97706, emissive: 0x92400e, emissiveIntensity: 0.3 });
    const staff = new THREE.Mesh(staffGeo, staffMat);
    staff.position.set(0.9, 1.4, 0); staff.rotation.z = 0.3;
    group.add(staff);

    // Staff tip glow
    const tipGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(1.25, 2.4, 0);
    group.add(tip);

    // Tip light
    this.tipLight = new THREE.PointLight(0xfacc15, 3, 8);
    this.tipLight.position.copy(tip.position);
    group.add(this.tipLight);

    // Shield sphere (invisible by default)
    const sGeo = new THREE.SphereGeometry(1.8, 16, 16);
    const sMat = new THREE.MeshBasicMaterial({ color: 0x9933ff, transparent: true, opacity: 0.0, wireframe: false, blending: THREE.AdditiveBlending, depthWrite: false });
    this.shieldMesh = new THREE.Mesh(sGeo, sMat);
    this.shieldMesh.position.y = 1;
    group.add(this.shieldMesh);

    // Ambient glow around player
    this.playerLight = new THREE.PointLight(0x8b5cf6, 2, 12);
    this.playerLight.position.y = 1;
    group.add(this.playerLight);

    group.position.set(0, 0, 0);
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); this.dash(); }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  update(delta, cameraForward, cameraRight) {
    if (!this.isAlive) {
      this.deathTimer -= delta;
      return;
    }

    // Mana regen
    this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * delta);

    // Dash
    this.dashTimer = Math.max(0, this.dashTimer - delta);
    this.invincibleTimer = Math.max(0, this.invincibleTimer - delta);
    if (this.shielded) {
      this.shieldTimer -= delta;
      if (this.shieldTimer <= 0) this.deactivateShield();
    }

    // Movement
    const moveVec = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    moveVec.add(cameraForward);
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  moveVec.sub(cameraForward);
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  moveVec.sub(cameraRight);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveVec.add(cameraRight);
    moveVec.y = 0;

    if (this.dashActive) {
      this.mesh.position.add(this.dashVelocity.clone().multiplyScalar(delta));
      this.dashActive = false;
    } else if (moveVec.length() > 0.01) {
      moveVec.normalize().multiplyScalar(this.moveSpeed * delta);
      this.mesh.position.add(moveVec);

      // Rotate player to face movement direction
      const angle = Math.atan2(moveVec.x, moveVec.z);
      this.mesh.rotation.y = angle;
    }

    // Clamp inside arena
    const HALF = 26;
    this.mesh.position.x = Math.max(-HALF, Math.min(HALF, this.mesh.position.x));
    this.mesh.position.z = Math.max(-HALF, Math.min(HALF, this.mesh.position.z));
    this.mesh.position.y = 0;

    // Animate bob
    this.bodyMesh.position.y = 0.7 + Math.sin(Date.now() * 0.003) * 0.1;
    this.headMesh.position.y = 1.8 + Math.sin(Date.now() * 0.003) * 0.1;
    this.tipLight.intensity = 2.5 + Math.sin(Date.now() * 0.005) * 0.8;

    // Shield visual
    if (this.shielded) {
      this.shieldMesh.material.opacity = 0.25 + Math.sin(Date.now() * 0.005) * 0.1;
      this.shieldMesh.rotation.y += delta * 1.5;
    }
  }

  dash() {
    if (this.dashTimer > 0 || !this.isAlive) return;
    const fwd = new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
    this.dashVelocity = fwd.multiplyScalar(this.dashSpeed);
    this.dashActive = true;
    this.invincibleTimer = 0.35;
    this.dashTimer = this.dashCooldown;
    Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x22d3ee, 30, 5);
  }

  activateShield(duration) {
    this.shielded = true;
    this.shieldTimer = duration;
    this.shieldAbsorb = 100;
    this.shieldMesh.material.opacity = 0.25;
    document.getElementById('shield-indicator').classList.remove('hidden');
    Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x9933ff, 80, 6);
  }

  deactivateShield() {
    this.shielded = false;
    this.shieldMesh.material.opacity = 0.0;
    document.getElementById('shield-indicator').classList.add('hidden');
  }

  takeDamage(amount) {
    if (!this.isAlive) return;
    if (this.invincibleTimer > 0) return;

    if (this.shielded) {
      this.shieldAbsorb -= amount;
      Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x9933ff, 20, 3);
      if (this.shieldAbsorb <= 0) this.deactivateShield();
      return;
    }

    this.health -= amount;
    this.invincibleTimer = 0.5;

    // Screen flash
    UI.flashDamage();

    // Camera shake via Game
    if (typeof Game !== 'undefined') Game.cameraShake = 0.3;

    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }

  die() {
    this.isAlive = false;
    this.deathTimer = 1;
    Particles.burst(this.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xf87171, 120, 8);
    setTimeout(() => { if (typeof Game !== 'undefined') Game.gameOver(); }, 1500);
  }

  get position() { return this.mesh.position; }

  reset() {
    this.health = this.maxHealth;
    this.mana   = this.maxMana;
    this.isAlive = true;
    this.shielded = false;
    this.shieldMesh.material.opacity = 0.0;
    this.dashTimer = 0;
    this.invincibleTimer = 0;
    this.mesh.position.set(0, 0, 0);
    document.getElementById('shield-indicator').classList.add('hidden');
  }
}
