import { one, oneOf, type RawParams } from '@/lib/url-params';
import { SETTING_GROUPS, type SettingGroup } from './settings-catalog';

// Ayarlar ekranının URL sözleşmesi. Sekme ve arama adreste taşınır, çünkü başka bir ekrandan yollanan ayar bağlantısı doğru yerde açılmalı.

const SETTINGS_PATH = '/operations/settings';

/**
 * Ayar grupları ile personel, vitrin görselleri ve MCP anahtarları. Son üçü ayar değil, ama hepsi yalnız yöneticinin kurulum işi
 * olduğu için aynı barda durur.
 */
export const SETTINGS_TABS = [...SETTING_GROUPS.map((g) => g.key), 'images', 'staff', 'mcp'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** Ayar OLMAYAN sekmeler — kurulum işleri. Arama bunları taramaz (arama bir AYAR aramasıdır). */
const NON_SETTING_TABS = new Set<string>(['staff', 'images', 'mcp']);

export function isSettingGroup(tab: SettingsTab): tab is SettingGroup {
  return !NON_SETTING_TABS.has(tab);
}

export interface SettingsUrlState {
  tab: SettingsTab;
  /** Ayar araması — ad ve açıklamada geçer. */
  q: string;
}

const DEFAULTS: SettingsUrlState = { tab: 'order', q: '' };

/** URL → ekran durumu. Tanınmayan sekme sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseSettingsUrl(params: RawParams): SettingsUrlState {
  return {
    tab: oneOf(params.tab, SETTINGS_TABS, DEFAULTS.tab),
    q: one(params.q).trim(),
  };
}

/** Ekran durumu → URL. Varsayılanlar yazılmaz (temiz adres). */
export function settingsUrl(state: SettingsUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) p.set('tab', state.tab);
  if (state.q) p.set('q', state.q);
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
