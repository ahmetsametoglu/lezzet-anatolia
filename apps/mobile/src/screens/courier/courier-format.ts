import { formatPrice } from '@lezzet/helper';

import { courierCopy } from './copy';

/*
  KURYE EKRANLARININ BİÇİMLEME KURALLARI — saf, React'siz, testli.

  Ekranlardan AYRI durur çünkü hiçbiri bir görünüm kararı değil: gün adının Türkçe yazımı, tutarın
  cent ↔ metin çevrimi ve farkın işaretli gösterimi üç ayrı kuraldır ve üçü de bir bileşen değişse
  bile aynı kalır.

  İÇERİK ÖZETİNİ AYRIŞTIRAN KURAL (`parseContentSummary`) 21.10e'de SÖKÜLDÜ: durak sözleşmesi artık
  kalem satırlarını kimlikleriyle taşıyor (`CourierStop.items`), yani ekranın listesi bir metinden
  tahmin edilmiyor — kaynağından okunuyor. Ayrıştırma o boşluğun pansumanıydı; boşluk kapandı.
*/

const t = courierCopy;

/** Operasyon yüzeyi TEK DİLLİDİR: para yazımı da cihaz dilinden değil, yüzeyin dilinden gelir. */
const SURFACE_LOCALE = 'tr' as const;

/** `4200` → `"42,00 €"`. Biçim `@lezzet/helper`ın tek kaynağından; RN'de yeniden yazılmaz. */
export function money(cents: number): string {
  return formatPrice(cents, SURFACE_LOCALE);
}

/**
 * TÜRKÇE BÜYÜK HARF — `toUpperCase` tek başına YANLIŞTIR: JS'in dil-bağımsız dönüşümü `i` → `I`
 * verir, Türkçede ise `İ` olmalı ("Nisan" → "NISAN" değil "NİSAN"). Üstbaşlık CSS/RN tarafında
 * ayrıca `textTransform:'uppercase'` alıyor; buradan zaten büyük çıkan harfler orada değişmez,
 * yani iki katman çelişmiyor — bu fonksiyon yalnız noktalı/noktasız i ayrımını KURTARIYOR.
 */
export function turkishUpper(value: string): string {
  return value.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

/**
 * `"2026-08-08"` → `"8 AĞUSTOS"` (v2:38'in üstbaşlığı).
 *
 * `Intl` KULLANILMADI: Hermes'in ICU kapsamı platforma göre değişiyor ve ay adının Android'de
 * İngilizce dönmesi sessiz bir arıza olurdu. Onikilik sözlük metindir, sözlükte durur.
 * Biçim tanınmazsa `null` döner — uydurma bir gün adı yazmaktansa üstbaşlık kuyruksuz kalır
 * (CLAUDE §1: ölçülemeyen değer sıfır/varsayılan değildir).
 */
export function dayLabel(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const month = t.months[Number(match[2]) - 1];
  if (month === undefined) return null;
  return `${Number(match[3])} ${month}`;
}

/**
 * `"Musa Kaya"` → `"Musa K."` (v2:38). Kapıda kimin geldiğini söyleyen kısa ad; tam soyadı
 * üstbaşlığa sığmıyor ve orada bir kimlik değil bir selamdır.
 */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';
  return `${parts.slice(0, -1).join(' ')} ${last.slice(0, 1)}.`;
}

/**
 * GİRDİ METNİ → CENT. Kurye virgülle de noktayla da yazar; ikisi de kabul edilir.
 *
 * Boş/bozuk girdide `null` DÖNER, 0 değil: "hiç yazmadım" ile "sıfır yazdım" aynı şey değildir ve
 * sıfıra düşürmek bozuk bir girdiyi sağlıklı gibi okuturdu (CLAUDE §1). Yuvarlama `round`:
 * "12,345" gibi bir girdide kuruş kaybı değil en yakın kuruş olsun.
 */
export function parseAmountToCents(text: string): number | null {
  const clean = text.replace(/\s/g, '').replace(',', '.');
  if (clean.length === 0 || !/^\d*\.?\d*$/.test(clean) || clean === '.') return null;
  const value = Number(clean);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/** CENT → GİRDİ METNİ (`4200` → `"42,00"`). Simge YOK: alanın yanında ayrıca `€` yazıyor. */
export function centsToAmountText(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * FARKIN İŞARETLİ YAZIMI (K7) — `+12,00 €` · `−3,50 €` · `0,00 €`.
 *
 * İşaret MUTLAK DEĞERE indirgenmez, çünkü anlamı taşıyan şey işarettir: eksi = eksik teslim, artı
 * = fazla para (`design/pages/app-kurye.md` K7). Eksi işareti U+2212'dir, tire değil — rakamla
 * aynı genişlikte durur ve sütun hizası bozulmaz (v2:954 aynı karakteri kullanıyor).
 */
export function signedMoney(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
  return `${sign}${money(Math.abs(cents))}`;
}
