import type { z } from 'zod';
import { SettingScopeEnum, type AccountType } from '@lezzet/types';
import type { SettingSection } from './settings-layout';

/**
 * Ayar sözlüğünün tipleri yaprak dosyada durur: sözlük, sözlüğün parçaları (`settings-catalog-distance-sales`) ve ekran tipleri
 * buradan okur. Sözlükte kalsalardı sözlük ile parçaları birbirini import ederdi.
 */

/** İstisna açılabilen eksenler; `global` istisna değil, değerin kendisidir. */
export const ExceptionScopeEnum = SettingScopeEnum.exclude(['global']);
export type ExceptionScope = z.infer<typeof ExceptionScopeEnum>;

/**
 * Değerin türü, gösterimi ve düzenleme kontrolünü belirler. `channelFlags`in kanal ayrımı değerin içinde yaşar, istisna satırı
 * olarak değil, yoksa aynı soruya iki cevap kapısı açılırdı; `year` tam sayıdan ayrıdır, çünkü yıl binlik ayraçla yazılmaz.
 */
export type SettingKind =
  'money' | 'percent' | 'integer' | 'year' | 'time' | 'boolean' | 'channelFlags' | 'text' | 'account' | 'choice' | 'invoiceTemplate';

/** Ayarın değeri — `jsonb` sütununun ekranda karşılık gelen dar hâli. */
export type SettingValue = string | number | boolean | Record<string, boolean>;

export interface SettingDef {
  key: string;
  /** İnsan dilinde ad — arayüzde görünen tek isim. */
  label: string;
  /** "Bu neyi etkiler" — bir cümle. */
  help: string;
  /** Ayarın durduğu konu kartı; sekme karttan türer (`settings-layout`). */
  section: SettingSection;
  kind: SettingKind;
  /** Sayısal değerin birimi (`dk`, `gün`, `puan`, `cent`). Para ve yüzde kendi biçimini taşır. */
  unit?: string;
  /** `account` türünde seçilebilen hesap türü; başka türdeki hesaba yazılan para yanlış yerde birikir ya da aktarım yazılamaz. */
  accountType?: AccountType;
  /** `choice` türünün seçenekleri: değer listeden gelir ki ekran bir enum'u ham kimliğiyle göstermesin. */
  choices?: readonly { value: string; label: string }[];
  /** Alt/üst sınır — ham sayı üzerinden (para cent, yüzde tam sayı). */
  min?: number;
  max?: number;
  /** Sınırın SEBEBİ — reddi anlaşılır kılar ("ödeme penceresinin asgarisi"). Sınır varsa yazılır. */
  limitReason?: string;
  /** Geniş etkili ayar: düzenleme penceresi bu cümleyi uyarı olarak gösterir. */
  impact?: string;
  /** Değer boşken satırda görünen uyarı: boşluğun sistemde neye yol açtığını söyler. */
  unsetNote?: string;
  /** Güven puanı ağırlığının yönü; kart ödülleri ve cezaları ayrı sütunda çizer. */
  polarity?: 'reward' | 'penalty';
  /** `global` dışında istisna açılabilen eksenler; boşsa yalnız genel değer. Tip ekranın sunabildiği eksenlerden gelir. */
  exceptionScopes: readonly ExceptionScope[];
  /**
   * Fabrika değeri, migration'ın yazdığı satır; kurulumdan kuruluma değişen ayarlarda (banka hesabı gibi) bilerek boştur. Nöbet
   * testi iki yönlü doğrular: `fallback` verilen anahtar migration'da bulunmalı, verilmeyen bulunmamalı.
   */
  fallback?: SettingValue;
}
