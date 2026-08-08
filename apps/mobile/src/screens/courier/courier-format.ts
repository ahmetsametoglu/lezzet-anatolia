import { formatPrice } from '@lezzet/helper';

import { courierCopy } from './copy';

/*
  KURYE EKRANLARININ BİÇİMLEME KURALLARI — saf, React'siz, testli.

  Ekranlardan AYRI durur çünkü hiçbiri bir görünüm kararı değil: gün adının Türkçe yazımı, tutarın
  cent ↔ metin çevrimi, farkın işaretli gösterimi ve içerik özetinin satırlara ayrılması dört ayrı
  kuraldır ve dördü de bir bileşen değişse bile aynı kalır.
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

/** Durak özetinden çıkan tek kalem. `orderItemId` YOKTUR — sözleşme taşımıyor (ekran künyesi). */
export interface SummaryLine {
  /** Satır anahtarı: özet metnindeki sıra. Kalem KİMLİĞİ değil, liste anahtarı. */
  key: string;
  qty: number;
  name: string;
}

interface ParsedSummary {
  lines: SummaryLine[];
  /** Özete sığmayan kalem sayısı (`+2`) — işaretlenemeyen kalemler. */
  hidden: number;
}

/**
 * İÇERİK ÖZETİNİ SATIRLARA AYIRIR — `"2 × Baklava, 1 × Mantı +3"`.
 *
 * Biçim uydurma değil, sözleşmenin ürettiği biçim: `application/courier/day.ts`'in `summarize`ı
 * ilk ÜÇ kalemi `"{qty} × {ad}"` olarak virgülle birleştirip kalanı `+N` diye ekliyor. Ekranın
 * kalem listesi bugün BUNDAN çıkıyor, çünkü sözleşmede kalem satırı YOK (yalnız `itemCount` ve
 * bu özet). Ayrıştırma bu yüzden ihtiyattır: tanınmayan bir parça ATILMAZ, adı olduğu gibi
 * `qty:1` ile satıra alınır — kuryenin kolide gördüğü bir şeyi ekranın yutması, listeyi
 * güvenilmez yapardı.
 */
export function parseContentSummary(summary: string, itemCount: number): ParsedSummary {
  const trimmed = summary.trim();
  if (trimmed.length === 0) return { lines: [], hidden: itemCount };

  const tail = /\s\+(\d+)$/.exec(trimmed);
  const body = tail ? trimmed.slice(0, tail.index) : trimmed;
  const hiddenFromTail = tail ? Number(tail[1]) : 0;

  const lines = body
    .split(', ')
    .filter((part) => part.trim().length > 0)
    .map((part, index) => {
      const match = /^(\d+)\s×\s(.+)$/.exec(part.trim());
      return {
        key: `line-${index}`,
        qty: match ? Number(match[1]) : 1,
        name: match ? (match[2] ?? part.trim()) : part.trim(),
      };
    });

  // Gizli sayı iki kaynaktan doğrulanır: özetin kuyruğu ve `itemCount` farkı. Büyük olan alınır —
  // özet kuyruğu yoksa ama sayı tutmuyorsa da kurye eksik olduğunu GÖRMELİ.
  return { lines, hidden: Math.max(hiddenFromTail, itemCount - lines.length, 0) };
}
