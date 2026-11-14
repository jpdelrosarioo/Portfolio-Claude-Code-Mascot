// How loud the microphone is right now. Used to tell a person talking over the mascot from the mascot's own voice
// coming back through the speakers: a person adds loudness on top of what the mascot's voice alone causes.
//
// Only the loudness (one number) is measured, on this device. No audio is recorded, stored or sent anywhere, and the
// microphone signal is not connected to the speakers. It uses the same microphone permission as the speech recognition.

export type LevelMeter = {
  /** Is it measuring? (False until the microphone is open and the page is allowed to run audio.) */
  ready(): boolean;
  /** The loudness over the last fifth of a second (0 = silence, 1 = as loud as it gets). */
  level(): number;
  stop(): void;
};

export function startLevelMeter(): LevelMeter {
  let stopped = false;
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  const recent: number[] = []; // the last few measurements (every 50 ms)
  const buf = new Float32Array(1024);

  // browsers keep audio paused until the visitor has used the page: carry on as soon as they do
  const wake = () => {
    if (ctx && ctx.state === "suspended") void ctx.resume();
  };
  const events = ["pointerdown", "keydown", "touchstart"] as const;
  if (typeof window !== "undefined") events.forEach((e) => window.addEventListener(e, wake, true));

  void (async () => {
    try {
      // echo cancellation on: the browser already removes part of the page's own sound; automatic gain off, so the loudness means something
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
      if (stopped) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(s).connect(analyser); // (not connected to the speakers)
      wake();
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        recent.push(Math.sqrt(sum / buf.length));
        if (recent.length > 4) recent.shift(); // (a short average: the mascot reacts quickly)
      }, 50);
    } catch {
      // no microphone, or no permission: the meter stays not ready, and talking over the mascot is simply not offered
    }
  })();

  return {
    ready: () => !!ctx && ctx.state === "running" && recent.length >= 4,
    level: () => (recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0),
    stop() {
      stopped = true;
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, wake, true));
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      ctx = null;
      stream = null;
    },
  };
}
