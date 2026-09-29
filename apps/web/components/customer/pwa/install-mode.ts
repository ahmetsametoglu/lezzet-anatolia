export type InstallMode = 'hidden' | 'prompt' | 'ios';

/** iPhone'da kurulum sinyali yok, yalnız rehber gösterilebilir; kurulum yolu olmayan tarayıcıda kart hiç çizilmez. */
export function installModeOf(device: { standalone: boolean; ios: boolean }, canPrompt: boolean): InstallMode {
  if (device.standalone) return 'hidden';
  if (canPrompt) return 'prompt';
  return device.ios ? 'ios' : 'hidden';
}
