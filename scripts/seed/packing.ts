/*
  ── AMBALAJ ÖLÇÜSÜ ÜRETİCİSİ (besleme, 28.08) ────────────────────────────────

  **BU SAYILAR UYDURMADIR ve öyle olmak zorunda.** Gerçek ambalaj ölçüsü tartılıp ölçülür; ne
  basılı katalogda ne API'de var (arandı, yok). Beslemenin işi gerçeği taklit etmek değil,
  EKRANLARIN VE MOTORUN karşılaşacağı hâlleri üretmek: ölçülü varyant, ölçüsüz varyant, ve
  ikisinin arasındaki yarım hâl (tartılmış ama ölçülmemiş).

  `CLAUDE.md` bunu zaten söylüyor — yerel veri sahtedir ve ondan iş çıkarımı yapılmaz. Buradaki
  formül bir iddia değil, bir SAHNE KURUCUSUDUR.

  ── FORMÜL ──────────────────────────────────────────────────────────────────
  Hacim net ağırlıktan türer (hamur işi ~0,55 g/cm³ — içindeki hava dâhil), kutu 1,6 : 1,1 : 1
  oranında bir dikdörtgen prizmaya oturur ve ambalaj payı eklenir. Sonuç 5 mm'ye yuvarlanır:
  gerçek kutular yuvarlak sayılarda üretilir, milimetre hassasiyetinde bir kutu sahtelik kokar.

  Brüt ağırlık = net + dara. Dara sabit bir pay (kutu/film) + ağırlıkla büyüyen bir pay: 90 g'lık
  dilimin kutusu 20 g, 2,5 kg'lık tepsininki 200 g'dır ve ikisi aynı formülden çıkar.
*/

/** Türetilmiş ambalaj künyesi — dördü birlikte doğar (kısıt: ölçüler all-or-none). */
export interface AmbalajOlcusu {
  packedWeightG: number;
  packedLengthMm: number;
  packedWidthMm: number;
  packedHeightMm: number;
}

/** Hamur işi yoğunluğu (g/cm³) — içindeki hava dâhil kaba bir taban. */
const YOGUNLUK = 0.55;
/** Kutu oranı: boy : en : yükseklik. Tepsi ve kutu bu bantta yaşar. */
const ORAN = { boy: 1.6, en: 1.1, yuk: 1 };
/** Ambalaj payı — içerik ile kutu arasındaki boşluk (her kenara mm). */
const PAY_MM = 8;
/** Dara: sabit pay (g) + net ağırlığın oranı. */
const DARA_SABIT_G = 12;
const DARA_ORAN = 0.07;

/** 5 mm'ye yuvarlar — gerçek kutular yuvarlak sayılarda üretilir. */
function beseYuvarla(mm: number): number {
  return Math.max(5, Math.round(mm / 5) * 5);
}

/**
 * Net ağırlıktan ambalaj künyesi türetir. `null` net ağırlık → `null` künye: ölçüsüz varyanttan
 * ölçü uydurmak, beslemenin kurmak istediği "eksik ölçü" hâlini yok ederdi.
 */
export function ambalajOlcusu(netWeightG: number | null | undefined): AmbalajOlcusu | null {
  if (!netWeightG || netWeightG <= 0) return null;

  const hacimCm3 = netWeightG / YOGUNLUK;
  // hacim = k³ × (1,6 × 1,1 × 1) → k = ∛(hacim / 1,76)
  const k = Math.cbrt(hacimCm3 / (ORAN.boy * ORAN.en * ORAN.yuk));

  return {
    packedWeightG: Math.round(netWeightG + DARA_SABIT_G + netWeightG * DARA_ORAN),
    packedLengthMm: beseYuvarla(k * ORAN.boy * 10 + PAY_MM * 2),
    packedWidthMm: beseYuvarla(k * ORAN.en * 10 + PAY_MM * 2),
    packedHeightMm: beseYuvarla(k * ORAN.yuk * 10 + PAY_MM * 2),
  };
}

/**
 * Beslemenin kurduğu ÜÇ HÂL — hangi varyantın hangi hâle düşeceğini indis belirler (deterministik:
 * aynı `db:refresh` aynı sahneyi kurar, ölçüm tekrarlanabilir olsun diye).
 *
 * - `tam`    → dördü de dolu; canlı teklif alınabilir
 * - `yarim`  → tartılmış ama ÖLÇÜLMEMİŞ; kısıt buna izin veriyor (kimi tarife yalnız ağırlığa
 *              bakar, üstelik operatör önce tartıp sonra ölçebilir) ve ekran bunu ayırt etmeli
 * - `yok`    → hiç ölçülmemiş; "ölçüsü eksik" süzgecinin ve teklif reddinin sınandığı hâl
 */
export type OlcuHali = 'tam' | 'yarim' | 'yok';

export function olcuHali(indis: number, kusurlu: boolean): OlcuHali {
  if (!kusurlu) return 'tam';
  if (indis % 23 === 0) return 'yok';
  if (indis % 13 === 0) return 'yarim';
  return 'tam';
}

/** Hâle göre yazılacak alanlar — `undefined` "yazma" demektir (servis kolonu atlar). */
export function ambalajAlanlari(
  netWeightG: number | null | undefined,
  hal: OlcuHali,
): Partial<Record<keyof AmbalajOlcusu, number | undefined>> {
  if (hal === 'yok') return {};
  const olcu = ambalajOlcusu(netWeightG);
  if (olcu === null) return {};
  if (hal === 'yarim') return { packedWeightG: olcu.packedWeightG };
  return olcu;
}
