// Synthesized arcade audio: no remote files, autoplay, or music downloads.
export class ArcadeAudio {
  enabled = false;
  async toggle() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 380;
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      noise.connect(filter).connect(this.gain).connect(this.context.destination);
      noise.start();
    }
    this.enabled = !this.enabled;
    await this.context.resume();
    if (!this.enabled) this.thrust(0);
    return this.enabled;
  }
  thrust(amount) {
    if (this.context) this.gain.gain.setTargetAtTime(this.enabled ? amount * .14 : 0, this.context.currentTime, .035);
  }
  finish(success) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    for (const [i, frequency] of (success ? [392, 494, 587, 784] : [130, 87, 55]).entries()) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = success ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.045, now + i * .12);
      gain.gain.exponentialRampToValueAtTime(.001, now + i * .12 + .35);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now + i * .12);
      oscillator.stop(now + i * .12 + .36);
    }
  }
}
