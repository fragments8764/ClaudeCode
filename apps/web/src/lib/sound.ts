/**
 * Optional sound design (off by default):
 *  - ambient pad: two detuned oscillators through a slowly breathing low-pass filter;
 *    volume and brightness follow aurora intensity
 *  - "Go now" chime: a soft bell
 * Uses WebAudio; must be started from a user gesture on iOS.
 */
let ctx: AudioContext | null = null;
let pad: { gain: GainNode; filter: BiquadFilterNode; oscs: OscillatorNode[]; lfo: OscillatorNode } | null = null;

function audio(): AudioContext {
  ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function startPad(intensity: number) {
  const a = audio();
  if (!pad) {
    const gain = a.createGain();
    gain.gain.value = 0;
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.connect(gain).connect(a.destination);
    const oscs = [110, 164.81, 220.5].map((f, i) => {
      const o = a.createOscillator();
      o.type = i === 1 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 7;
      o.connect(filter);
      o.start();
      return o;
    });
    const lfo = a.createOscillator();
    const lfoGain = a.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    pad = { gain, filter, oscs, lfo };
  }
  setPadIntensity(intensity);
}

export function setPadIntensity(i: number) {
  if (!pad || !ctx) return;
  const t = ctx.currentTime;
  pad.gain.gain.setTargetAtTime(0.015 + Math.max(0, Math.min(1, i)) * 0.045, t, 2);
  pad.filter.frequency.setTargetAtTime(300 + i * 1400, t, 2);
}

export function stopPad() {
  if (!pad || !ctx) return;
  const p = pad;
  p.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
  setTimeout(() => {
    p.oscs.forEach((o) => o.stop());
    p.lfo.stop();
  }, 2500);
  pad = null;
}

export function chime() {
  const a = audio();
  const t = a.currentTime;
  [523.25, 783.99, 1046.5].forEach((f, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t + i * 0.12);
    g.gain.linearRampToValueAtTime(0.06, t + i * 0.12 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 2.2);
    o.connect(g).connect(a.destination);
    o.start(t + i * 0.12);
    o.stop(t + i * 0.12 + 2.3);
  });
}
