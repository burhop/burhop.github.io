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
    // --- Three.js setup ---
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060614);
    this.scene.fog = new THREE.Fog(0x060614, 40, 80);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    this.clock = new THREE.Clock();

    // --- Lighting ---
    this.scene.add(new THREE.AmbientLight(0x1a1040, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(10, 20, 10);
    this.scene.add(sun);
    // Colored accent lights
    const l1 = new THREE.PointLight(0xff00ff, 2, 60); l1.position.set( 25, 8,  25); this.scene.add(l1);
    const l2 = new THREE.PointLight(0x00ffff, 2, 60); l2.position.set(-25, 8, -25); this.scene.add(l2);
    const l3 = new THREE.PointLight(0x9933ff, 1.5, 40); l3.position.set(0, 15, 0); this.scene.add(l3);

    // --- Arena ---
    this._buildArena();

    // --- Init subsystems ---
    Particles.init(this.scene);
    Particles.createAmbient(200);

    // --- Gesture canvas ---
    const gestureCanvas = document.getElementById('gesture-canvas');
    Gestures.init(gestureCanvas, (gesture) => this._onGesture(gesture));

    // --- Keyboard spells (1-5) ---
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'PLAYING') return;
      const keyMap = { Digit1:'FIREBALL', Digit2:'ICE_SHARD', Digit3:'LIGHTNING', Digit4:'SHIELD', Digit5:'TORNADO' };
      if (keyMap[e.code]) this._castSpell(keyMap[e.code]);
      if (e.code === 'Escape') this.pause();
    });

    // --- Right-click camera drag ---
    window.addEventListener('mousedown', (e) => {
      if (e.button === 2) { this.rightMouseDown = true; this.lastMouseX = e.clientX; this.lastMouseY = e.clientY; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) this.rightMouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.rightMouseDown && this.state === 'PLAYING') {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.camYaw   -= dx * 0.005;
        this.camPitch  = Math.max(0.15, Math.min(1.1, this.camPitch + dy * 0.004));
      }
      this.lastMouseX = e.clientX; this.lastMouseY = e.clientY;
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (this.state === 'PLAYING') this.camDist = Math.max(8, Math.min(25, this.camDist + e.deltaY * 0.02));
    });

    // --- Right-click quick cast ---
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2 && !this.rightMouseDown && this.state === 'PLAYING') {
        if (this.spellManager && this.spellManager.lastSpell) {
          this._castSpell(this.spellManager.lastSpell);
        }
      }
    });

    // --- Resize ---
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      Gestures.resize();
    });

    // --- UI init ---
    UI.init();
    UI.showScreen('menu-screen');

    // Start render loop
    this._loop();
  },

  _buildArena() {
    // Floor
    const floorGeo = new THREE.PlaneGeometry(60, 60, 30, 30);
    const floorMat = new THREE.MeshPhongMaterial({ color: 0x0d0d2b, shininess: 20 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Grid overlay
    const gridHelper = new THREE.GridHelper(60, 30, 0x2d1b69, 0x1a0d3d);
    gridHelper.position.y = 0.02;
    this.scene.add(gridHelper);

    // Boundary walls (invisible, just glowing edges)
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.6 });
    const edges = [
      { pos:[0,5,30],  rot:[0,0,0],  size:[60,10,0.2] },
      { pos:[0,5,-30], rot:[0,0,0],  size:[60,10,0.2] },
      { pos:[30,5,0],  rot:[0,Math.PI/2,0], size:[60,10,0.2] },
      { pos:[-30,5,0], rot:[0,Math.PI/2,0], size:[60,10,0.2] }
    ];
    edges.forEach(e => {
      const geo = new THREE.BoxGeometry(...e.size);
      const mesh = new THREE.Mesh(geo, edgeMat);
      mesh.position.set(...e.pos);
      mesh.rotation.set(...e.rot);
      this.scene.add(mesh);
    });

    // Corner pillars
    const pillarGeo = new THREE.CylinderGeometry(0.8, 0.8, 12, 8);
    const pillarMat = new THREE.MeshPhongMaterial({ color: 0x1e1b4b, emissive: 0x4c1d95, emissiveIntensity: 0.3 });
    [[-30,-30],[30,-30],[-30,30],[30,30]].forEach(([x,z]) => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(x, 6, z);
      this.scene.add(p);
      const l = new THREE.PointLight(0x7c3aed, 3, 20);
      l.position.set(x, 8, z);
      this.scene.add(l);
    });

    // Central magic circle on floor
    const circleGeo = new THREE.RingGeometry(2, 2.3, 64);
    const circleMat = new THREE.MeshBasicMaterial({ color: 0x7c3aed, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.03;
    this.scene.add(circle);
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
    const fwd = this._getCameraForward();
    const success = this.spellManager.cast(name, this.player, fwd);
    if (success) {
      const spell = SPELL_DEFS[name];
      UI.showSpellCastFlash(spell.color);
    }
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

    if (this.state === 'PLAYING' && this.player) {
      const fwd = this._getCameraForward();
      const right = this._getCameraRight();

      this.player.update(delta, fwd, right);
      this.waveManager.update(delta, this.player.mesh.position);
      this.spellManager.update(delta);
      this.spellManager.checkCollisions(this.waveManager.enemies);
      Particles.update(delta);

      // Wave completion check
      if (this.waveManager.waveDone) {
        this.waveManager.waveDone = false;
        this._waveReward();
      }

      UI.update(this.player, this.spellManager, this.waveManager, this.score);
      this._updateCamera();
    } else if (this.state !== 'PLAYING') {
      // Still render scene in background
      Particles.update(delta);
      this.renderer.render(this.scene, this.camera);
    }

    if (this.state === 'PLAYING') {
      this.renderer.render(this.scene, this.camera);
    }
  }
};

// Boot when DOM ready
window.addEventListener('DOMContentLoaded', () => Game.init());
