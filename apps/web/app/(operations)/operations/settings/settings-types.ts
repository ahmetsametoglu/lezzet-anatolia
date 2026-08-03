import { z } from 'zod';
import { SettingScopeEnum, UserRoleEnum, type Setting, type UserProfile, type UserRole } from '@lezzet/types';
import type { ExceptionScope, SettingDef, SettingValue } from './settings-catalog';
import type { SettingsTab, SettingsUrlState } from './settings-url';

// Ayarlar ekranının tipleri (09.16). Şema tek kaynak (`CLAUDE.md §1`): giriş şemaları
// `packages/types`'ın `Setting`/`UserProfile` şemalarından türer, görünüm modelleri de onlardan.

// `ExceptionScope` SÖZLÜKTE tanımlı (`settings-catalog`) — buradan yalnız yeniden dışa veriliyor ki
// tüketicilerin import satırı değişmesin. Taşındı çünkü sözlük ona ihtiyaç duyuyor ve bu dosya da
// sözlükten tip alıyor; iki yönlü bağ `pnpm boundaries`'te döngü hatasıydı.
export type { ExceptionScope };

// ── Yazma girişleri ─────────────────────────────────────────────────────────

/**
 * Ayar yazma girişi — değer HAM gelir (metin/mantıksal/nesne), tür dönüşümü sunucuda yapılır.
 *
 * Neden ham: dönüşüm kuralı sözlükte (`SettingDef.kind`) ve sınır denetimiyle aynı yerde durmalı.
 * İstemci "25,00 €"yi cent'e çevirip gönderseydi, sınırı da onun yorumlaması gerekirdi — kuralın
 * iki yerde yaşaması demek olurdu.
 */
export const SettingWriteSchema = z.object({
  key: z.string().min(1),
  scopeType: SettingScopeEnum.default('global'),
  /** Kapsam kimliği: kanal `b2b`/`b2c`, ülke `FR`/`DE`, bölge uuid. Global'de null. */
  scopeId: z.string().nullable().default(null),
  raw: z.union([z.string(), z.boolean(), z.record(z.boolean())]),
});

/** Personel künyesi + rol kümesi — tek yazımda gider (rol değişimi bir künye düzenlemesidir). */
export const StaffFormSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, 'Ad boş olamaz'),
  email: z.string().trim().email('Geçerli bir e-posta girin').or(z.literal('')),
  phone: z.string().trim(),
  roles: z.array(UserRoleEnum),
  warehouseIds: z.array(z.string().uuid()),
});

// ── Görünüm modelleri ───────────────────────────────────────────────────────

/** Bir ayarın genel değerini EZEN satır. */
export interface SettingExceptionView {
  id: string;
  scopeType: ExceptionScope;
  scopeId: string;
  /** "Kanal: B2B" · "Bölge: Kuzey hattı" — ekseni ve hedefi birlikte söyler. */
  scopeLabel: string;
  display: string;
}

/**
 * Listede ve düzenleme penceresinde kullanılan ayar satırı.
 *
 * Sözlük tanımından TÜRER (`Omit` ile alan kopyalanmaz): ada/açıklamaya/sınıra ikinci bir kaynak
 * açmak, bir gün ayrışan iki sözlük demekti.
 */
export type SettingRowView = Omit<SettingDef, 'exceptionScopes'> & {
  exceptionScopes: readonly ExceptionScope[];
  /** Yürürlükteki genel değer — global satır yoksa fabrika değeri. */
  value: SettingValue;
  display: string;
  /** Fabrika değerinin okunan hâli; `null` = fabrika değeri YOK (kurulum-özgü seçim). */
  fallbackDisplay: string | null;
  /** Genel değer fabrika değerinden farklı mı — "elle değiştirilmiş" işareti. */
  changed: boolean;
  /** Global satırın kimliği; `null` = ayar hiç yazılmamış, kod varsayılanıyla çalışıyor. */
  rowId: string | null;
  updatedAt: string | null;
  exceptions: SettingExceptionView[];
};

/** Personel satırı — kimlik + roller + erişim. */
export interface StaffRowView {
  id: string;
  name: string;
  /** Ekranda gösterilen iletişim: e-posta varsa o, yoksa telefon. */
  contact: string;
  email: string | null;
  phone: string | null;
  roles: UserRole[];
  roleLabels: string[];
  /** Avatar baş harfleri — adı olmayan kayıtta '—'. */
  initials: string;
  warehouseIds: string[];
  /** Kapsam özeti: "STR · KEHL" · "depo-üstü" · "kapsamsız". */
  scopeText: string;
  /** Auth hesabı bağlı mı — bağlı değilse kişi giriş YAPAMAZ. */
  canSignIn: boolean;
}

/** İstisna penceresinin eksen seçenekleri — kapsam kimlikleri veriden gelir, elle yazılmaz. */
export interface ScopeOptions {
  channel: { value: string; label: string }[];
  country: { value: string; label: string }[];
  zone: { value: string; label: string }[];
  /** Depo istisnası — yalnız AKTİF depolar: kapalı bir tesise ayar yazmak, okunmayacak bir kural yazmaktır. */
  warehouse: { value: string; label: string }[];
}

export interface SettingsData {
  rows: SettingRowView[];
  staff: StaffRowView[];
  scopeOptions: ScopeOptions;
  warehouseOptions: { value: string; label: string }[];
  /**
   * `account` türündeki ayarın seçenekleri. YALNIZ AKTİF hesaplar: kapatılmış bir hesap listede
   * kalır ama yeni harekete kapalıdır (`AccountService.deactivate` künyesi) — onu seçilebilir
   * bırakmak, kapı önü satışın parasını kapalı bir kasaya yazmak olurdu.
   */
  accountOptions: { value: string; label: string }[];
  /** Değişikliğin tüm süreçlerde geçerli olacağı azami süre (sn) — ekranın operatöre verdiği söz. */
  propagationSeconds: number;
}

/**
 * İki cihaz dalının paylaştığı props — tek yerde tanımlı, ikisi de aynı sözleşmeyi uygular.
 *
 * Client'ta DEĞİL burada: client dalları import ediyor, dallar da bu tipi — sözleşme client'ta
 * dursaydı döngüsel bağımlılık doğardı (`pnpm boundaries` bunu hata sayıyor).
 */
export interface SettingsViewProps {
  data: SettingsData;
  urlState: SettingsUrlState;
  navPending: boolean;
  /** Açık sekmenin (ya da arama açıkken tüm bölümlerin) gösterilecek satırları. */
  rows: SettingRowView[];
  /** Arama kutusunun YEREL taslağı — adres gecikmeli yazıldığı için `urlState.q`'dan ileride olabilir. */
  search: string;
  onTab: (tab: SettingsTab) => void;
  onSearch: (q: string) => void;
  onOpenSetting: (row: SettingRowView) => void;
  onNewStaff: () => void;
  onOpenStaff: (row: StaffRowView) => void;
}

/** Okuma tarafının ham girdisi (test edilebilirlik için ayrı). */
export interface SettingsReadInput {
  settings: Setting[];
  staff: UserProfile[];
  zones: { id: string; name: string }[];
  warehouses: { id: string; code: string; name: string }[];
  /** Hesaplar — `account` türündeki ayarın hem seçenekleri hem ad sözlüğü (`door_cash_account_id`). */
  accounts: { id: string; name: string }[];
}
