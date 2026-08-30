/*
  ADET ÇEKMECESİNİN HESABI — saf, ekransız, testli (Operasyon Mobil v3 · `00-ortak` `sheetAdet`).

  ── SAYIM BİR TOPLAM DEĞİL, BİR DÖKÜMDÜR ────────────────────────────────────
  Tasarımın modeli tek bir sayı tutmuyor: `kutular` (hangi boydan kaç koli) + `elle` (koli dışı tek
  paket), toplam bunlardan TÜRETİLİYOR. Fark önemli — depocu çekmeceyi kapatıp yeniden açtığında
  "27" değil "2 × 12 + 3 tek paket" görmeli, çünkü düzeltmek istediği şey toplam değil bir
  koli sayısıdır. Tek sayı tutulsaydı ikinci açılışta döküm kaybolur ve depocu 27'yi elle bozmak
  zorunda kalırdı.

  ── KAYITLI BOY İLE SAHADA EKLENEN BOY AYRI KİMLİKTİR ───────────────────────
  Kayıtlı boy `code` taşır (`variant_barcode`ın koli kodu); sahada eklenen boyun kodu YOKTUR
  (`code: null`) çünkü henüz ürüne kaydedilmemiştir. İkisini tek anahtarla toplamak, kaydedilmemiş
  bir çarpanı kayıtlıymış gibi gösterirdi. Anahtar bu yüzden `code ?? çarpan`: aynı çarpandan iki
  kez eklenen boy tek satırda birleşir, kayıtlı bir boyla asla karışmaz.
*/

/** Ürünün KAYITLI koli boyu — sözleşmenin `CaseSizeContract`ıyla aynı şekil (`z.infer` orada). */
export interface CaseSize {
  code: string;
  qtyPerCode: number;
}

/** Sayılan bir koli boyu — `code: null` = sahada eklendi, ürüne henüz kaydedilmedi. */
export interface CountedCase {
  code: string | null;
  qtyPerCode: number;
  count: number;
}

/** Satırın adet dökümü; toplam BURADAN türer, ayrıca tutulmaz. */
export interface QuantityBreakdown {
  cases: CountedCase[];
  /** Koli dışı, tek tek sayılan paket. */
  loose: number;
}

export const EMPTY_BREAKDOWN: QuantityBreakdown = { cases: [], loose: 0 };

/** Bir boyun kimliği — kayıtlıysa kodu, sahada eklendiyse çarpanı. */
export function caseKey(size: { code: string | null; qtyPerCode: number }): string {
  return size.code ?? `x${size.qtyPerCode}`;
}

/** Toplam paket: koliler × çarpanları + tek paketler. */
export function quantityTotal(value: QuantityBreakdown): number {
  return value.cases.reduce((total, item) => total + item.count * item.qtyPerCode, 0) + value.loose;
}

/**
 * Çekmecenin çizeceği satırlar: önce ürünün KAYITLI boyları (sayılmamışlar da görünür — depocu
 * neyin sorulduğunu görmeli), sonra sahada eklenenler.
 *
 * Kayıtlı boyların sırası çağıranın verdiği sıradır (sunucu çarpana göre sıralıyor); sahada
 * eklenenler EKLENME sırasında kalır — az önce eklediği satırın listenin ortasına atlaması,
 * depocuya "eklenmedi mi?" dedirtir.
 */
export function breakdownRows(value: QuantityBreakdown, sizes: CaseSize[]): CountedCase[] {
  const counted = new Map(value.cases.map((item) => [caseKey(item), item]));
  const registered = sizes.map((size) => ({
    code: size.code,
    qtyPerCode: size.qtyPerCode,
    count: counted.get(caseKey(size))?.count ?? 0,
  }));
  const known = new Set(sizes.map((size) => caseKey(size)));
  const extra = value.cases.filter((item) => !known.has(caseKey(item)));
  return [...registered, ...extra];
}

/**
 * Bir boyun sayısını yazar. Sıfıra inen KAYITLI boy listede kalır (çekmece onu zaten çiziyor),
 * sıfıra inen SAHADA EKLENEN boy dökümden düşer — yoksa yanlışlıkla eklenmiş bir çarpan, sayısı
 * sıfır olsa bile "ürüne kaydedilecek" diye görünmeye devam ederdi.
 */
export function setCaseCount(
  value: QuantityBreakdown,
  size: { code: string | null; qtyPerCode: number },
  count: number,
): QuantityBreakdown {
  const key = caseKey(size);
  const next = Math.max(0, count);
  const exists = value.cases.some((item) => caseKey(item) === key);
  if (!exists) {
    return next === 0 ? value : { ...value, cases: [...value.cases, { ...size, count: next }] };
  }
  return {
    ...value,
    cases: value.cases
      .map((item) => (caseKey(item) === key ? { ...item, count: next } : item))
      .filter((item) => item.count > 0 || item.code !== null),
  };
}

/**
 * Hesabın okunur hâli: *"2 × 12  +  3 tek paket  =  27 paket"*.
 *
 * Metin şablonları ÇAĞIRANDAN gelir (kit disiplini: komponent metin gömmez); çarpım işareti ve
 * ayraç sayının kendi dilidir, çevrilmez.
 */
export function breakdownText(
  value: QuantityBreakdown,
  copy: { loose: string; total: string; empty: string },
): string {
  const parts = value.cases
    .filter((item) => item.count > 0)
    .map((item) => `${item.count} × ${item.qtyPerCode}`);
  if (value.loose > 0) parts.push(copy.loose.replace('{n}', String(value.loose)));
  if (parts.length === 0) return copy.empty;
  return copy.total.replace('{parts}', parts.join('  +  ')).replace('{n}', String(quantityTotal(value)));
}

/**
 * "Başka koli boyu" çekmecesinin sunduğu çarpanlar (tasarımın kendi listesi).
 *
 * Sabit ve KISA: saha uydurma çarpan giremesin diye. Tasarımın dipnotu bunu söylüyor — *"Bu
 * listede de yoksa masada ürün kartına eklenir; sahada uydurulmuş çarpan stok sayımını bozar."*
 */
export const EXTRA_CASE_SIZES = [2, 3, 6, 8, 10, 16, 20, 36] as const;

/** Tek paket cetvelinin durakları — 0'dan 24'e (tasarım: `for (let i = 0; i <= 24; i++)`). */
export const LOOSE_RULER = Array.from({ length: 25 }, (_, index) => index);
