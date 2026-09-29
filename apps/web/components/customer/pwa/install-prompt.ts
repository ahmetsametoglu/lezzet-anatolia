// Chrome kurulum sinyalini belge açılışında bir kez verir; site içi gezinmede sayfa yeniden yüklenmediği için sinyal kökte
// yakalanıp burada tutulur, yoksa hesap sayfasına geçen müşteri düğmeyi hiç görmezdi.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function captureInstallPrompt(): () => void {
  const onPrompt = (event: Event) => {
    // Tarayıcının kendi çubuğu çıkmasın: kurulum yalnız müşterinin bastığı düğmeyle açılır.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  };
  const onInstalled = () => {
    deferred = null;
    notify();
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Sinyal tek kullanımlık: pencere bir kez açılınca tarayıcı aynı olayı yeniden kullandırmaz. */
export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null;
  notify();
  await event.prompt();
}
