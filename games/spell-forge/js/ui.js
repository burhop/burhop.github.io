/* ui.js — HUD updates, menus, damage numbers */

const UI = {
  comboCount: 0,
  comboTimer: 0,
  shaking: false,

  init() {
    // Add key labels to spell icons
    const keys = ['1','2','3','4','5'];
    const names = Object.keys(SPELL_DEFS);
    names.forEach((name, i) => {
      const icon = document.getElementById('spell-' + i);
      if (!icon) return;
      const keySpan = document.createElement('span');
      keySpan.className = 'spell-key';
      keySpan.textContent = SPELL_DEFS[name].key;
      icon.appendChild(keySpan);
      icon.title = `${SPELL_DEFS[name].name} [${SPELL_DEFS[name].key}] — Draw ${SPELL_DEFS[name].gesture}`;
    });

    // Gesture hint
    const hint = document.getElementById('gesture-hint');
    hint.innerHTML = [
      '↑ Draw Up → 🔥 Fireball',
      '↓ Draw Down → ❄️ Ice Shard',
      '⚡ Zigzag → ⚡ Lightning',
      '○ Circle → 🛡️ Shield',
      '🌀 Spiral → 🌪️ Tornado',
      '🖱️ R-Click drag = Camera'
    ].join('<br>');
  },

  update(player, spellManager, waveManager, score) {
    if (!player) return;

    // Health bar
    const hpPct = (player.health / player.maxHealth) * 100;
    document.getElementById('health-bar').style.width = hpPct + '%';
    const hpTextEl = document.getElementById('health-bar-text');
    if (hpTextEl) hpTextEl.textContent = Math.ceil(player.health) + '/' + player.maxHealth;

    // Mana bar
    const mpPct = (player.mana / player.maxMana) * 100;
    document.getElementById('mana-bar').style.width = mpPct + '%';
    const mpTextEl = document.getElementById('mana-bar-text');
    if (mpTextEl) mpTextEl.textContent = Math.floor(player.mana) + '/' + player.maxMana;

    // Score
    document.getElementById('score-num').textContent = score.toLocaleString();

    // Wave + enemy count
    document.getElementById('wave-num').textContent = waveManager.currentWave;
    document.getElementById('enemy-num').textContent = waveManager.aliveCount;

    // Spell cooldowns
    const spellNames = Object.keys(SPELL_DEFS);
    spellNames.forEach((name, i) => {
      const el = document.getElementById('spell-' + i);
      if (!el) return;
      const cd = spellManager.getCooldownProgress(name);
      const noMana = player.mana < SPELL_DEFS[name].manaCost;
      const overlay = el.querySelector('.cooldown-overlay');

      el.classList.toggle('on-cooldown', cd > 0);
      el.classList.toggle('no-mana', !cd && noMana);
      el.classList.toggle('highlight', spellManager.lastSpell === name && !cd && !noMana);

      if (cd > 0 && overlay) {
        overlay.textContent = (spellManager.cooldowns[name]).toFixed(1) + 's';
      }
    });
  },

  showDamageNumber(worldPos, amount, color) {
    // Project 3D to 2D
    const canvas = document.getElementById('game-canvas');
    const vector = worldPos.clone().add(new THREE.Vector3(0, 2, 0));
    vector.project(Game.camera);

    const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (-vector.y * 0.5 + 0.5) * canvas.clientHeight;

    if (x < 0 || x > canvas.clientWidth || y < 0 || y > canvas.clientHeight) return;

    const el = document.createElement('div');
    el.className = 'dmg-num';
    el.textContent = amount;
    el.style.color = '#' + color.toString(16).padStart(6, '0');
    el.style.left = (x + (Math.random() - 0.5) * 40) + 'px';
    el.style.top  = y + 'px';
    el.style.fontSize = amount >= 30 ? '1.5rem' : '1rem';

    const container = document.getElementById('damage-numbers');
    container.appendChild(el);
    setTimeout(() => el.remove(), 900);
  },

  flashDamage() {
    const flash = document.createElement('div');
    flash.className = 'cast-flash';
    flash.style.background = 'rgba(239,68,68,0.3)';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 350);
  },

  showSpellCastFlash(color) {
    const flash = document.createElement('div');
    flash.className = 'cast-flash';
    const r = (color >> 16) & 0xff;
    const g = (color >>  8) & 0xff;
    const b =  color        & 0xff;
    flash.style.background = `rgba(${r},${g},${b},0.12)`;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 300);
  },

  showWaveClear(waveNum, bonusScore) {
    const screen = document.getElementById('wave-clear');
    document.getElementById('wave-clear-title').textContent = waveNum % 5 === 0 ? 'BOSS WAVE CLEARED! 💀' : 'WAVE CLEARED! ⚔️';
    document.getElementById('wave-clear-msg').textContent = `+${bonusScore} bonus score!`;
    screen.classList.remove('hidden');
    setTimeout(() => screen.classList.add('hidden'), 2500);
  },

  showGameOver(stats) {
    document.getElementById('go-stats').innerHTML = `
      Final Score: <span>${stats.score.toLocaleString()}</span><br>
      Wave Reached: <span>${stats.wave}</span><br>
      Enemies Defeated: <span>${stats.kills}</span><br>
      Spells Cast: <span>${stats.spells}</span>
    `;
    this.showScreen('gameover-screen');
  },

  showHighScores() {
    const scores = Storage.getScores();
    const list = document.getElementById('high-scores-list');
    if (scores.length === 0) {
      list.innerHTML = '<p style="color:#64748b;font-family:sans-serif">No scores yet. Play first!</p>';
    } else {
      list.innerHTML = scores.map((s, i) => `
        <div class="score-row">
          <span class="score-rank">#${i+1}</span>
          <span class="score-val">${s.score.toLocaleString()}</span>
          <span class="score-meta">Wave ${s.wave} · ${s.enemies} kills · ${s.date}</span>
        </div>
      `).join('');
    }
    this.showScreen('scores-screen');
  },

  hideHighScores() { this.showScreen('menu-screen'); },

  showInstructions() { this.showScreen('instructions-screen'); },
  hideInstructions() { this.showScreen('menu-screen'); },

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  },

  hideAllScreens() {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  },

  showHUD()  { document.getElementById('hud').classList.remove('hidden'); },
  hideHUD()  { document.getElementById('hud').classList.add('hidden');    }
};
