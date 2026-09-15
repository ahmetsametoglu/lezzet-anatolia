'use client';

/**
 * Ses dosyası yok: iki kısa ton Web Audio ile üretilir, dosya bir varlık ve bir istek demekti. Ne zaman çalacağı motorda
 * (`hasNewInbound`, `alertAllowed`): native uygulama aynı kararı okur.
 */

let context: AudioContext | null = null;

/** Tarayıcı sesi kullanıcı dokunuşundan önce çaldırmaz; kilit ilk dokunuşta açılır, dönen fonksiyon dinleyicileri kaldırır. */
export function unlockMessageChime(): () => void {
  const unlock = () => {
    try {
      context ??= new AudioContext();
      void context.resume();
    } catch {
      // Web Audio yoksa ses yok, rozet ve kuyruk yine çalışır: iz bırakacak bir arıza değil, tarayıcının yeteneği.
    }
    detach();
  };
  const detach = () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  if (context?.state === 'running') return () => {};
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return detach;
}

/** Kilit açılmadıysa sessizce geçer: uyarının görsel yarısı yine çalışır. */
export function playMessageChime(): void {
  if (!context || context.state !== 'running') return;
  const start = context.currentTime;
  [880, 1320].forEach((frequency, index) => {
    const tone = context!.createOscillator();
    const gain = context!.createGain();
    const at = start + index * 0.14;
    tone.type = 'sine';
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.18, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    tone.connect(gain).connect(context!.destination);
    tone.start(at);
    tone.stop(at + 0.24);
  });
}
