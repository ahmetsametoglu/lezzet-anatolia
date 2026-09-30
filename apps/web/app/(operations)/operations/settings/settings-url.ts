import { one, oneOf, type RawParams } from '@/lib/url-params';
import { SETTING_TABS, type SettingTab } from './settings-layout';

// Ayarlar ekranının URL sözleşmesi. Sekme ve arama adreste taşınır, çünkü başka bir ekrandan yollanan ayar bağlantısı doğru yerde açılmalı.

const SETTINGS_PATH = '/operations/settings';

/** Üç ayar sekmesi ve Kurulum; Kurulum ayar değil, personel, vitrin görselleri ve MCP anahtarları gibi yöneticinin kurulum işleri. */
export const SETTINGS_TABS: readonly (SettingTab | 'setup')[] = [...SETTING_TABS.map((t) => t.key), 'setup'];
export type SettingsTab = SettingTab | 'setup';

export function isSettingTab(tab: SettingsTab): tab is SettingTab {
  return tab !== 'setup';
}

export interface SettingsUrlState {
  tab: SettingsTab;
  /** Ayar araması — ad ve açıklamada geçer. */
  q: string;
  /** Yalnız varsayılandan farklı ayarlar; arama gibi bütün sekmelerde çalışır. */
  changed: boolean;
}

const DEFAULTS: SettingsUrlState = { tab: 'order', q: '', changed: false };

/** URL → ekran durumu. Tanınmayan sekme sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseSettingsUrl(params: RawParams): SettingsUrlState {
  return {
    tab: oneOf(params.tab, SETTINGS_TABS, DEFAULTS.tab),
    q: one(params.q).trim(),
    changed: one(params.changed) === '1',
  };
}

/** Ekran durumu → URL. Varsayılanlar yazılmaz (temiz adres). */
export function settingsUrl(state: SettingsUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) p.set('tab', state.tab);
  if (state.q) p.set('q', state.q);
  if (state.changed) p.set('changed', '1');
  const qs = p.toString();
  return qs ? `${SETTINGS_PATH}?${qs}` : SETTINGS_PATH;
}

/**
 * BAŞKA bir ekrandan Ayarlar'a bağlantı — "bu eşiği nereden değiştiririm" köprüsü.
 *
 * Stok ekranındaki `stockLink` ile aynı gerekçe: adresi elle kurmak parametre adlarını ikinci kez
 * yazmak olurdu ve bu dosyanın başlığı "tek kaynak" diyor.
 */
export function settingsLink(patch: Partial<SettingsUrlState> = {}): string {
  return settingsUrl({ ...DEFAULTS, ...patch });
}

export { SETTINGS_PATH };
