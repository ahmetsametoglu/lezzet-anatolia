import { one, oneOf, type RawParams } from '@/lib/url-params';
import { SETTING_GROUPS, type SettingGroup } from './settings-catalog';

// Ayarlar ekranının URL sözleşmesi (09.16) — tek soru: **hangi bölüme bakıyorum**.
//
// Sekme adreste taşınır çünkü ayar bir BAĞLANTIDIR: "kesim saatini şuradan değiştir" diye
// yollanan bir adres doğru sekmede açılmalı (`admin-ayarlar.md §5`: sayfalardan bağlam köprüleri).
// Arama terimi de yazılır — telefonda acil senaryonun tamamı tek bağlantıya sığsın.

const SETTINGS_PATH = '/operations/settings';

/**
 * Ayar grupları + personel + vitrin görselleri.
 *
 * Son ikisi bir AYAR DEĞİL, bu yüzden sözlükte de yoklar: personel bir kayıt, vitrin görseli bir
 * dosya. Sekme barını paylaşmalarının sebebi ikisinin de "kurulum işi" olması — nadiren bakılır,
 * yerini bilmek gerekir ve her ikisi de yalnız yöneticiye açıktır (ekranın kapısı `requireAdmin`).
 */
export const SETTINGS_TABS = [...SETTING_GROUPS.map((g) => g.key), 'images', 'staff'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function isSettingGroup(tab: SettingsTab): tab is SettingGroup {
  return tab !== 'staff' && tab !== 'images';
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
