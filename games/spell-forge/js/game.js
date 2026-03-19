/* game.js — Main game orchestrator */

const Game = {
  state: 'MENU',   // MENU | PLAYING | PAUSED | GAME_OVER
  scene: null, renderer: null, camera: null, clock: null,
  player: null, waveManager: null, spellManager: null,
  score: 0, totalKills: 0, totalSpells: 0,
  cameraShake: 0,

  // Camera state
  camYaw: 0, camPitch: 0.45,
  camDist: 16, camHeight: 0,
  rightMouseDown: false,
  lastMouseX: 0, lastMouseY: 0,

  // Expose enemies for cross-module access
  get enemies() { return this.waveManager ? this.waveManager.enemies : []; },

  init() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02020e);
    this.scene.fog = new THREE.FogExp2(0x03030f, 0.016);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
    this.clock  = new THREE.Clock();

    // --- Lighting ---
    this.scene.add(new THREE.AmbientLight(0x110822, 2.8));
    const sun = new THREE.DirectionalLight(0xaa77ff, 0.6);
    sun.position.set(8, 20, 8);
    this.scene.add(sun);

    // Animated accent lights
    this.accentLights = [];
    [
      { color:0xff00cc, pos:[ 22,6, 22], i:4, d:55 },
      { color:0x00ccff, pos:[-22,6,-22], i:4, d:55 },
      { color:0x9933ff, pos:[ 22,6,-22], i:3, d:45 },
      { color:0x00ff99, pos:[-22,6, 22], i:3, d:45 },
    ].forEach(d => {
      const l = new THREE.PointLight(d.color, d.i, d.d);
      l.position.set(...d.pos);
      this.scene.add(l);
      this.accentLights.push({ light:l, basePos:[...d.pos], baseI:d.i });
    });

    // --- Arena ---
    this._buildArena();

    Particles.init(this.scene);
    Particles.createAmbient(250);

    // ── Mouse aim tracking ─────────────────────────────
    this.mouseNDC = new THREE.Vector2(0, 0);
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Y=0

    const gestureCanvas = document.getElementById('gesture-canvas');
    Gestures.init(gestureCanvas, (gesture) => this._onGesture(gesture));

    window.addEventListener('keydown', (e) => {
      if (this.state !== 'PLAYING') return;
      const keyMap = { Digit1:'FIREBALL', Digit2:'ICE_SHARD', Digit3:'LIGHTNING', Digit4:'SHIELD', Digit5:'TORNADO' };
      if (keyMap[e.code]) this._castSpell(keyMap[e.code]);
      if (e.code === 'Escape') this.pause();
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 2) { this.rightMouseDown = true; this.lastMouseX = e.clientX; this.lastMouseY = e.clientY; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) this.rightMouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.rightMouseDown && this.state === 'PLAYING') {
        this.camYaw   -= (e.clientX - this.lastMouseX) * 0.005;
        this.camPitch  = Math.max(0.15, Math.min(1.1, this.camPitch + (e.clientY - this.lastMouseY) * 0.004));
      }
      this.lastMouseX = e.clientX; this.lastMouseY = e.clientY;
      // Track normalised mouse for aim raycasting
      this.mouseNDC.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    window.addEventListener('contextmenu', e => e.preventDefault());

    // ── Touchable spell icons ──────────────────────────
    const spellNames = ['FIREBALL','ICE_SHARD','LIGHTNING','SHIELD','TORNADO'];
    for (let i = 0; i < 5; i++) {
      const el = document.getElementById('spell-' + i);
      if (el) {
        el.style.cursor = 'pointer';
        el.style.userSelect = 'none';
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.state === 'PLAYING') this._castSpell(spellNames[i]);
        });
      }
    }
    window.addEventListener('wheel', (e) => {
      if (this.state === 'PLAYING') this.camDist = Math.max(8, Math.min(25, this.camDist + e.deltaY * 0.02));
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2 && !this.rightMouseDown && this.state === 'PLAYING' && this.spellManager && this.spellManager.lastSpell)
        this._castSpell(this.spellManager.lastSpell);
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      Gestures.resize();
    });

    UI.init();
    UI.showScreen('menu-screen');
    this._loop();
  },

  _buildArena() {
    // ── Starfield ─────────────────────────────────────────
    const starCount = 2200;
    const sPosArr   = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 140 + Math.random() * 30;
      sPosArr[i*3]   = Math.sin(phi)*Math.cos(theta)*r;
      sPosArr[i*3+1] = Math.abs(Math.cos(phi))*r + 5;
      sPosArr[i*3+2] = Math.sin(phi)*Math.sin(theta)*r;
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPosArr, 3));
    this.scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({
      color:0xffffff, size:0.5, transparent:true, opacity:0.85,
      sizeAttenuation:true, blending:THREE.AdditiveBlending, depthWrite:false
    })));

    // Nebula colour clusters
    [{ c:0x440088, cx:60,  cz:60  },
     { c:0x003366, cx:-80, cz:40  },
     { c:0x660033, cx:20,  cz:-90 }].forEach(d => {
      const ng = new THREE.BufferGeometry();
      const np = new Float32Array(300*3);
      for (let i=0;i<300;i++){
        np[i*3]   = d.cx + (Math.random()-0.5)*90;
        np[i*3+1] = 45  + Math.random()*55;
        np[i*3+2] = d.cz + (Math.random()-0.5)*90;
      }
      ng.setAttribute('position', new THREE.BufferAttribute(np,3));
      this.scene.add(new THREE.Points(ng, new THREE.PointsMaterial({
        color:d.c, size:1.9, transparent:true, opacity:0.22,
        blending:THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:true
      })));
    });

    // ── Floor ─────────────────────────────────────────────
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(62,62),
      new THREE.MeshPhongMaterial({ color:0x060618, shininess:50, specular:0x111133 })
    );
    floor.rotation.x = -Math.PI/2;
    this.scene.add(floor);

    // Bright teal grid
    const g1 = new THREE.GridHelper(60, 20, 0x22d3ee, 0x22d3ee);
    g1.position.y = 0.016;
    g1.material.transparent = true; g1.material.opacity = 0.38;
    g1.material.blending = THREE.AdditiveBlending;
    this.scene.add(g1);

    // Fine purple sub-grid
    const g2 = new THREE.GridHelper(60, 60, 0x7c3aed, 0x7c3aed);
    g2.position.y = 0.01;
    g2.material.transparent = true; g2.material.opacity = 0.16;
    g2.material.blending = THREE.AdditiveBlending;
    this.scene.add(g2);

    // ── Rotating rune rings ───────────────────────────────
    this.runeRings = [];
    [
      { r:4,   t:0.06, c:0x22d3ee, s: 0.30 },
      { r:8,   t:0.045,c:0x8b5cf6, s:-0.18 },
      { r:14,  t:0.04, c:0x22d3ee, s: 0.12 },
      { r:20,  t:0.035,c:0xf472b6, s:-0.08 },
      { r:27,  t:0.07, c:0x7c3aed, s: 0.05 },
    ].forEach(cfg => {
      const geo  = new THREE.TorusGeometry(cfg.r, cfg.t, 4, 80);
      const mat  = new THREE.MeshBasicMaterial({ color:cfg.c, transparent:true, opacity:0.7, blending:THREE.AdditiveBlending, depthWrite:false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI/2;
      mesh.position.y = 0.02;
      mesh.userData.speed = cfg.s;
      this.scene.add(mesh);
      this.runeRings.push(mesh);
    });

    // ── Translucent energy walls ──────────────────────────
    const wallFillMat  = new THREE.MeshBasicMaterial({ color:0x7c3aed, transparent:true, opacity:0.11, side:THREE.DoubleSide, blending:THREE.AdditiveBlending, depthWrite:false });
    const wallEdgeMat  = new THREE.MeshBasicMaterial({ color:0xbb88ff, transparent:true, opacity:0.55, blending:THREE.AdditiveBlending });
    [
      { p:[0,8, 30], r:[0,0,0]         },
      { p:[0,8,-30], r:[0,Math.PI,0]   },
      { p:[30,8,0],  r:[0,-Math.PI/2,0]},
      { p:[-30,8,0], r:[0, Math.PI/2,0]},
    ].forEach(e => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(60,16,10,4), wallFillMat);
      mesh.position.set(...e.p); mesh.rotation.set(...e.r);
      this.scene.add(mesh);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(60,0.15,0.15), wallEdgeMat);
      edge.position.set(e.p[0], 15.9, e.p[2]); edge.rotation.set(...e.r);
      this.scene.add(edge);
    });

    // ── Ornate crystal pillars ────────────────────────────
    const pillarColors = [0xcc44ff, 0x00ccff, 0xff44aa, 0x44ffcc];
    [[-28,-28],[28,-28],[-28,28],[28,28]].forEach(([x,z],i) => {
      const col = pillarColors[i];
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6,0.9,14,8),
        new THREE.MeshPhongMaterial({ color:0x1a0d33, emissive:col, emissiveIntensity:0.18 })
      );
      shaft.position.set(x,7,z);
      this.scene.add(shaft);

      // Crystal cap
      const cap = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.95,0),
        new THREE.MeshPhongMaterial({ color:col, emissive:col, emissiveIntensity:0.9, transparent:true, opacity:0.9, shininess:220 })
      );
      cap.position.set(x,14.6,z);
      this.scene.add(cap);

      // Glow light
      const l = new THREE.PointLight(col, 5.5, 30);
      l.position.set(x,14,z);
      this.scene.add(l);
      this.accentLights.push({ light:l, basePos:[x,14,z], baseI:5.5 });

      // Base ring
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.2, 0.1, 4, 32),
        new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.6, blending:THREE.AdditiveBlending })
      );
      ring.rotation.x = Math.PI/2;
      ring.position.set(x,0.08,z);
      this.scene.add(ring);
    });

    // ── Central magic sigil ───────────────────────────────
    [2.5, 4.0, 5.8].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r+0.09, 64),
        new THREE.MeshBasicMaterial({ color: i%2===0 ? 0x22d3ee : 0x8b5cf6, side:THREE.DoubleSide, transparent:true, opacity:0.5, blending:THREE.AdditiveBlending })
      );
      ring.rotation.x = -Math.PI/2; ring.position.y = 0.03;
      this.scene.add(ring);
    });
    [[1,0],[0,1],[0.707,0.707],[0.707,-0.707]].forEach(([dx,dz]) => {
      const pts = [new THREE.Vector3(-dx*6, 0.03, -dz*6), new THREE.Vector3(dx*6, 0.03, dz*6)];
      this.scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color:0x22d3ee, transparent:true, opacity:0.3, blending:THREE.AdditiveBlending })
      ));
    });
  },

  start() {
    this.score = 0; this.totalKills = 0; this.totalSpells = 0;

    // Cleanup old
    if (this.player) { this.scene.remove(this.player.mesh); }
    if (this.waveManager) { this.waveManager.clearAll(); }
    if (this.spellManager) { this.spellManager.clearProjectiles(); }
    Particles.clear();
    Particles.createAmbient(200);

    // Create systems
    this.player       = new Player(this.scene);
    this.waveManager  = new WaveManager(this.scene);
    this.spellManager = new SpellManager(this.scene);

    this.camYaw = 0; this.camPitch = 0.45; this.camDist = 16;

    UI.hideAllScreens();
    UI.showHUD();
    this.state = 'PLAYING';

    // Start wave 1 after a short delay
    setTimeout(() => { if (this.state === 'PLAYING') this.waveManager.startWave(); }, 1500);
  },

  restart() { this.start(); },

  pause() {
    if (this.state !== 'PLAYING') return;
    this.state = 'PAUSED';
    UI.showScreen('pause-screen');
  },

  resume() {
    if (this.state !== 'PAUSED') return;
    this.state = 'PLAYING';
    UI.hideAllScreens();
    this.clock.getDelta(); // consume accumulated time
  },

  mainMenu() {
    this.state = 'MENU';
    if (this.waveManager) this.waveManager.clearAll();
    if (this.spellManager) this.spellManager.clearProjectiles();
    if (this.player) { this.scene.remove(this.player.mesh); this.player = null; }
    UI.hideHUD();
    UI.showScreen('menu-screen');
  },

  gameOver() {
    if (this.state === 'GAME_OVER') return;
    this.state = 'GAME_OVER';
    Storage.addScore(this.score, this.waveManager.currentWave, this.totalKills, this.totalSpells);
    UI.showGameOver({
      score: this.score,
      wave: this.waveManager.currentWave,
      kills: this.totalKills,
      spells: this.totalSpells
    });
  },

  addScore(amount) { this.score += amount; },

  onEnemyKilled() {
    this.totalKills++;
    this.addScore(10);
  },

  _onGesture(gesture) {
    if (this.state !== 'PLAYING' || !this.player || !this.player.isAlive) return;
    const spellName = GESTURE_MAP[gesture];
    if (spellName) this._castSpell(spellName);
  },

  _castSpell(name) {
    if (!this.player || !this.player.isAlive) return;
    // Aim toward mouse cursor position on the ground plane
    const aimDir = this._getMouseAimDir();
    const success = this.spellManager.cast(name, this.player, aimDir);
    if (success) {
      const spell = SPELL_DEFS[name];
      UI.showSpellCastFlash(spell.color);
    }
  },

  _getMouseAimDir() {
    // Raycast from camera through mouse onto ground plane
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    const hitPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, hitPoint);
    if (hit) {
      const dir = hitPoint.sub(this.player.mesh.position);
      dir.y = 0;
      if (dir.length() > 0.1) return dir.normalize();
    }
    // Fallback to player facing direction
    return this.player.facingDir.clone();
  },

  _getCameraForward() {
    // Direction from camera to player/scene center
    const fwd = new THREE.Vector3(
      -Math.sin(this.camYaw) * Math.cos(this.camPitch),
      0,
      -Math.cos(this.camYaw) * Math.cos(this.camPitch)
    );
    fwd.y = 0; fwd.normalize();
    return fwd;
  },

  _getCameraRight() {
    const fwd = this._getCameraForward();
    return new THREE.Vector3(-fwd.z, 0, fwd.x);
  },

  _updateCamera() {
    if (!this.player) return;
    const target = this.player.mesh.position;

    // Shake
    let shakeX = 0, shakeY = 0;
    if (this.cameraShake > 0) {
      this.cameraShake -= 0.015;
      shakeX = (Math.random() - 0.5) * this.cameraShake * 1.5;
      shakeY = (Math.random() - 0.5) * this.cameraShake * 1.5;
    }

    const camX = target.x + Math.sin(this.camYaw)   * this.camDist * Math.cos(this.camPitch) + shakeX;
    const camY = target.y + Math.sin(this.camPitch)  * this.camDist + 2;
    const camZ = target.z + Math.cos(this.camYaw)    * this.camDist * Math.cos(this.camPitch) + shakeY;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(target.x, target.y + 1, target.z);
  },

  _waveReward() {
    const wave = this.waveManager.currentWave;
    const bonus = wave * 100 + (wave % 5 === 0 ? 500 : 0);
    this.addScore(bonus);
    UI.showWaveClear(wave, bonus);

    if (wave >= 10) {
      // Victory — just keep going with harder waves
    }
    setTimeout(() => {
      if (this.state === 'PLAYING') this.waveManager.startWave();
    }, 3000);
  },

  _loop() {
    requestAnimationFrame(() => this._loop());
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const t = Date.now() * 0.001;

    // ── Always animate arena ──────────────────────────────
    if (this.runeRings) {
      this.runeRings.forEach(ring => { ring.rotation.z += ring.userData.speed * delta; });
    }
    if (this.accentLights) {
      this.accentLights.forEach((al, i) => {
        al.light.intensity = al.baseI * (0.85 + Math.sin(t * 1.5 + i * 1.2) * 0.25);
      });
    }

    if (this.state === 'PLAYING' && this.player) {
      const fwd   = this._getCameraForward();
      const right = this._getCameraRight();

      this.player.update(delta, fwd, right);
      this.waveManager.update(delta, this.player.mesh.position);
      this.spellManager.update(delta);
      this.spellManager.checkCollisions(this.waveManager.enemies);

      // ── Shield continuous bounce ─────────────────────
      if (this.player.shielded) {
        const SHIELD_R = 3.0;
        const BOUNCE   = 15;
        this.waveManager.enemies.forEach(e => {
          if (!e.alive) return;
          const diff = e.mesh.position.clone().sub(this.player.mesh.position);
          diff.y = 0;
          const dist = diff.length();
          if (dist < SHIELD_R && dist > 0.01) {
            // Push enemy out
            const push = diff.normalize().multiplyScalar(BOUNCE * delta * 60);
            e.mesh.position.add(push);
            // Small damage + brief stun
            e.takeDamage(5 * delta * 10, 'stun', 0.15);
            // Spark effect (throttled)
            if (Math.random() < 0.15) {
              Particles.burst(
                e.mesh.position.clone().add(diff.normalize().multiplyScalar(-0.5)).add(new THREE.Vector3(0, 1.5, 0)),
                0xbb66ff, 8, 2
              );
            }
            if (!e.alive) this.onEnemyKilled();
          }
        });
      }

      Particles.update(delta);

      if (this.waveManager.waveDone) {
        this.waveManager.waveDone = false;
        this._waveReward();
      }

      UI.update(this.player, this.spellManager, this.waveManager, this.score);
      this._updateCamera();
    } else {
      Particles.update(delta);
    }

    this.renderer.render(this.scene, this.camera);
  }
};

// Boot when DOM ready
window.addEventListener('DOMContentLoaded', () => Game.init());
