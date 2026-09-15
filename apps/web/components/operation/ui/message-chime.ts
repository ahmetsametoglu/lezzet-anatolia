'use client';

/**
 * **Yeni mesaj sesi** (15.34) — operasyon web'inde, sekme açıkken (arka planda da) müşteriden mesaj gelince.
 *
 * Ses DOSYASI YOK: iki kısa ton Web Audio ile üretilir. Dosya bir varlık ve bir istek demekti; bu tını için
 * ikisine de gerek yok.
 *
 * **Tarayıcı sesi kullanıcı dokunuşundan önce çaldırmaz** (otomatik oynatma kuralı). Kilit sayfaya ilk dokunuşta
 * açılır (`unlockMessageChime`); kilit açılmadan gelen mesajda ses çalmaz ve bu bilinçli — uyarının görsel
 * yarısı (düğmenin rozeti, kuyruk) yine çalışır.
 *
 * Ne zaman çalacağı burada DEĞİL, motorda (`hasNewInbound` · `alertAllowed`): mobil uygulama aynı kararı okur.
 */

let context: AudioContext | null = null;

/** İlk dokunuşta ses bağlamını kurar; dönen fonksiyon dinleyicileri kaldırır (bileşen ayrılırken). */
export function unlockMessageChime(): () => void {
  const unlock = () => {
    try {
      context ??= new AudioContext();
      void context.resume();
    } catch {
      // Tarayıcı Web Audio vermiyorsa ses YOK — uyarının görsel yarısı çalışmaya devam eder; iz bırakacak
      // bir arıza değil, tarayıcının yeteneği.
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

/** İki tonlu kısa tını. Kilit açılmadıysa sessizce geçer (künye). */
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
