import { audioCtx, isMuted, onMuteChange, unlockAudio } from "./sound";

/**
 * Maç müziği: tarayıcıda Web Audio ile anlık üretilen 128 BPM elektronik parça.
 * Dosya indirmez, telifsizdir. Bölümler: giriş (davul + bas) → ana (arpej) → doruk (lead melodi).
 * Akorlar: Am – F – C – G.
 */

const BPM = 128;
const STEP = 60 / BPM / 4; // 16'lık nota
const LOOK = 0.15;

// Akor kökleri (MIDI) ve akor tonları
const CHORDS: { root: number; tones: number[] }[] = [
  { root: 45, tones: [57, 60, 64, 69] }, // Am
  { root: 41, tones: [57, 60, 65, 69] }, // F
  { root: 48, tones: [55, 60, 64, 67] }, // C
  { root: 43, tones: [55, 59, 62, 67] }, // G
];
// Lead motifi (16'lık adım → nota, 0 = sus), her akor için 16 adım
const LEAD: number[][] = [
  [76, 0, 0, 74, 0, 0, 72, 0, 74, 0, 76, 0, 0, 0, 79, 0],
  [77, 0, 0, 76, 0, 0, 74, 0, 72, 0, 0, 0, 74, 0, 0, 0],
  [76, 0, 0, 74, 0, 0, 72, 0, 79, 0, 0, 0, 76, 0, 74, 0],
  [74, 0, 0, 0, 71, 0, 0, 0, 74, 0, 76, 0, 79, 0, 0, 0],
];
const ARP = [0, 1, 2, 3, 2, 1, 0, 2, 3, 2, 1, 3, 0, 3, 2, 1];

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Music {
  private ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private duck!: GainNode; // kick'e göre "pompalanan" bus (bas, pad, arpej)
  private delay!: DelayNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private step = 0;
  private next = 0;
  private playing = false;
  private unsub: (() => void) | null = null;

  start() {
    unlockAudio();
    const ctx = audioCtx();
    if (!ctx || this.playing) return;
    if (this.ctx !== ctx) this.build(ctx);
    this.playing = true;
    this.step = 0;
    this.next = ctx.currentTime + 0.08;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(isMuted() ? 0.0001 : 0.45, ctx.currentTime + 1.2);
    this.riser(ctx.currentTime + 0.05, 16 * STEP * 2);
    this.unsub = onMuteChange((m) => this.master.gain.setTargetAtTime(m ? 0.0001 : 0.45, ctx.currentTime, 0.08));
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (!this.playing || !this.ctx) return;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsub?.();
    this.unsub = null;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.0001, t, 0.25);
  }

  private build(ctx: BaseAudioContext) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(comp).connect(ctx.destination);
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    // Arpej/lead için ritmik eko
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter();
    dl.type = "lowpass";
    dl.frequency.value = 2600;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    dl.connect(wet).connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Test/önizleme: parçayı çevrimdışı bir bağlama baştan sona yazar. */
  renderTo(ctx: BaseAudioContext, seconds: number) {
    this.build(ctx);
    this.master.gain.setValueAtTime(0.45, 0);
    this.riser(0.05, 16 * STEP * 2);
    for (let i = 0, t = 0.08; t < seconds; i++, t += STEP) this.playStep(i, t);
  }

  private schedule() {
    const ctx = this.ctx!;
    while (this.next < ctx.currentTime + LOOK) {
      this.playStep(this.step, this.next);
      this.step++;
      this.next += STEP;
    }
  }

  private playStep(i: number, t: number) {
    const s16 = i % 16;
    const bar = Math.floor(i / 16);
    const chord = CHORDS[bar % 4];
    // Bölüm: 0-3 giriş, 4-11 ana, 12-19 doruk, sonra 4'ten tekrar
    const loopBar = bar < 4 ? bar : 4 + ((bar - 4) % 16);
    const section = loopBar < 4 ? 0 : loopBar < 12 ? 1 : 2;
    const fillBar = loopBar % 8 === 7;

    // Davullar
    if (s16 % 4 === 0) this.kick(t);
    if (s16 === 4 || s16 === 12) this.clap(t);
    if (fillBar && s16 >= 12) this.clap(t, 0.5);
    if (s16 % 2 === 1 || section > 0) this.hat(t, s16 % 4 === 2 ? 0.13 : 0.06, s16 % 4 === 2 ? 0.09 : 0.03);
    // Bas: offbeat 8'likler, her ikinci vuruşta oktav
    if (s16 % 4 === 2) this.bass(t, chord.root + (s16 === 10 ? 12 : 0), STEP * 1.8);
    if (s16 % 4 === 3 && section > 0) this.bass(t, chord.root + 12, STEP * 0.8, 0.5);
    // Pad: her ölçü başında
    if (s16 === 0 && section > 0) this.pad(t, chord.tones, STEP * 16);
    // Arpej
    if (section > 0) this.pluck(t, chord.tones[ARP[s16]] + (section === 2 && s16 % 8 >= 4 ? 12 : 0), 0.1);
    // Lead
    if (section === 2) {
      const n = LEAD[bar % 4][s16];
      if (n) this.lead(t, n, STEP * 2.6);
    }
    // Bölüm geçişlerinden önce yükselen ses
    if ((loopBar === 3 || loopBar === 11) && s16 === 0) this.riser(t, STEP * 16);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.35);
    // Sidechain pompası
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(0.25, t);
    this.duck.gain.linearRampToValueAtTime(1, t + STEP * 3);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, vol: number, dur: number, q = 1) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private clap(t: number, v = 1) {
    for (let k = 0; k < 3; k++) this.noiseHit(t + k * 0.011, "bandpass", 1500, 0.35 * v, 0.06 + (k === 2 ? 0.12 : 0), 1.2);
  }

  private hat(t: number, vol: number, dur: number) {
    this.noiseHit(t, "highpass", 8000, vol, dur);
  }

  private bass(t: number, midi: number, dur: number, v = 1) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o.type = "sawtooth";
    o2.type = "square";
    o.frequency.value = hz(midi);
    o2.frequency.value = hz(midi - 12);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 6;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.duck);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.02);
    o2.stop(t + dur + 0.02);
  }

  private pad(t: number, tones: number[], dur: number) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.075, t + 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(this.duck);
    for (const n of tones.slice(0, 3)) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  private pluck(t: number, midi: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = hz(midi + 12);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 4;
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(f).connect(g);
    g.connect(this.duck);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + 0.2);
  }

  private lead(t: number, midi: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 3200;
    f.connect(g);
    g.connect(this.master);
    g.connect(this.delay);
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = hz(midi);
      o.detune.value = det;
      // Hafif vibrato
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = 6;
      lfo.connect(lg).connect(o.detune);
      o.connect(f);
      o.start(t);
      lfo.start(t);
      o.stop(t + dur + 0.02);
      lfo.stop(t + dur + 0.02);
    }
  }

  private riser(t: number, dur: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 3;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.95);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

export const music = new Music();
