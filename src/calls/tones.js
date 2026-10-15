/**
 * Call sounds, synthesized with Web Audio (nothing to download):
 * 'ring'     incoming call, two-tone burst every 3 s (and a vibration on phones)
 * 'ringback' outgoing call, "the other phone is ringing", 1 s every 4 s
 * Returns a stop() function.
 */
const TONES = {
  ring: { frequencies: [440, 480], level: 0.12, period: 3, bursts: [[0, 0.4], [0.6, 1.0]], vibrate: [400, 200, 400] },
  ringback: { frequencies: [425], level: 0.05, period: 4, bursts: [[0, 1]] },
};

let context = null;

export function startTone(kind) {
  const tone = TONES[kind];
  let gain;
  let oscillators = [];
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') context.resume().catch(() => {});
    gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);
    oscillators = tone.frequencies.map((frequency) => {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start();
      return oscillator;
    });
  } catch {
    gain = null; // audio not available (e.g. no user interaction yet): stay silent
  }

  const schedule = () => {
    if (tone.vibrate) navigator.vibrate?.(tone.vibrate);
    if (!gain) return;
    const start = context.currentTime + 0.05;
    for (const [on, off] of tone.bursts) {
      gain.gain.setValueAtTime(tone.level, start + on);
      gain.gain.setValueAtTime(0, start + off);
    }
  };
  schedule();
  const timer = setInterval(schedule, tone.period * 1000);

  return () => {
    clearInterval(timer);
    navigator.vibrate?.(0);
    if (!gain) return;
    gain.gain.cancelScheduledValues(0);
    gain.gain.value = 0;
    for (const oscillator of oscillators) oscillator.stop();
    gain.disconnect();
  };
}
