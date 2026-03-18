/* storage.js — LocalStorage wrapper */
const Storage = {
  KEY: 'spellForgeArena_v1',

  defaultData() {
    return {
      highScores: [],
      settings: { sfxVolume: 0.7, mouseSensitivity: 1.0 }
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return this.defaultData();
      const parsed = JSON.parse(raw);
      return Object.assign(this.defaultData(), parsed);
    } catch (e) { return this.defaultData(); }
  },

  save(data) {
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch (e) {}
  },

  addScore(score, wave, enemies, spells) {
    const data = this.load();
    data.highScores.push({
      score, wave, enemies, spells,
      date: new Date().toLocaleDateString()
    });
    data.highScores.sort((a, b) => b.score - a.score);
    data.highScores = data.highScores.slice(0, 10);
    this.save(data);
    return data.highScores;
  },

  getScores() { return this.load().highScores || []; }
};
