/**
 * KOLİ PLANI (07.12) — sepetteki kalemler hangi kutulara, kaç kutuya sığar?
 *
 * **Saf karar:** girdi olarak ölçüleri ve deponun kutu listesini alır, dizi döndürür. Veritabanı
 * bilmez, sağlayıcı bilmez (`STACK §4`).
 *
 * ── ÖLÇÜT HACİM + AĞIRLIK TAVANI, ADET DEĞİL ────────────────────────────────
 * Referans projede bölen sabit bir ADETTİ (`ceil(Σadet / 20)`) ve orada doğruydu: satılan tek şey
 * kupaydı, hepsi aynı boydaydı. Bizim katalogda 90 g'lık dilim ile 2,5 kg'lık tepsi yan yana
 * duruyor — sabit adet böleni ikisini aynı kutuya koyar ve ya kutu patlar ya yarısı boş gider.
 *
 * ── ÖLÇÜSÜZ KALEM PLANI DURDURUR, YEDEK SABİTE DÜŞMEZ ───────────────────────
 * 07.12'nin en keskin kuralı: *"ölçüsüzlük `null`'dur, sıfır değil ve plan yedek sabite düştüğünü
 * SÖYLEMELİ"*. Burada bir adım öteye gidiliyor — **yedek sabit YOK**. Ölçüsü olmayan bir kalem
 * varsa plan `ok: false` döner ve hangi varyantların ölçüsüz olduğunu söyler. Sebep kozmetik değil:
 * uydurulmuş bir ölçü doğrudan tarifeye girer, taşıyıcı gerçeği tartar ve farkı faturaya yazar.
 * Referans projedeki sessiz yedek (`19×10×13 cm`) tam bu riski üretiyordu.
 *
 * ── DOLULUK ORANI — kutu %100 dolmaz ────────────────────────────────────────
 * Düzgün olmayan paketler arasında boşluk kalır. Hacim karşılaştırması bu yüzden ham değil,
 * `FILL_RATE` ile indirgenmiş kapasiteye karşı yapılır. Oran parametrik bir varsayımdır
 * (`CLAUDE §4`): ölçülebilir bir gerçek değil, güvenli tarafta kalan bir katsayı.
 */

/** Planlanacak kalem — ambalajlı ürün ölçüsü + adet. */
export interface ParcelItem {
  variantId: string;
  qty: number;
  /** Ambalajlı brüt ağırlık (g). `null` = tartılmadı. */
  packedWeightG: number | null;
  /** Ambalajlı dış ölçü (mm). Üçü birlikte var ya da üçü birlikte yok (kısıt veride). */
  packedLengthMm: number | null;
  packedWidthMm: number | null;
  packedHeightMm: number | null;
}

/** Deponun kutusu — plan yalnız AKTİF kutuları görmeli (çağıranın süzgeci). */
export interface ParcelBox {
  id: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  tareG: number;
  /** Azami içerik ağırlığı (g). `null` = sınır bilinmiyor → ağırlık tavanı uygulanmaz. */
  maxContentG: number | null;
}

/** Planlanmış tek kutu. */
export interface PlannedParcel {
  box: ParcelBox;
  /** Bu kutuya konan kalemler (adetleriyle). */
  contents: ReadonlyArray<{ variantId: string; qty: number }>;
  /** Taşıyıcıya bildirilecek ağırlık: içerik + kutunun darası. */
  weightG: number;
  /** İçeriğin kapladığı ham hacim (mm³) — doluluk denetiminin kanıtı. */
  contentVolumeMm3: number;
}

export type ParcelPlanFailure =
  /** Deponun aktif kutusu yok — kutu tanımlanmadan gönderi hazırlanamaz. */
  | { ok: false; reason: 'no_box'; unmeasured: readonly string[] }
  /** Bir ya da daha çok kalemin ölçüsü yok — TAHMİN EDİLMEZ, plan durur. */
  | { ok: false; reason: 'unmeasured'; unmeasured: readonly string[] }
  /** Tek bir paket en büyük kutuya bile sığmıyor — operatör kararı gerekir. */
  | { ok: false; reason: 'too_large'; unmeasured: readonly string[]; variantId: string };

export type ParcelPlanResult = { ok: true; parcels: readonly PlannedParcel[]; unmeasured: readonly [] } | ParcelPlanFailure;

/**
 * Kutunun kullanılabilir hacim oranı. Düzgün olmayan paketler arasında kalan boşluğun payı —
 * ölçülmüş bir gerçek değil, güvenli tarafta kalan bir varsayım (parametrik).
 */
export const FILL_RATE = 0.75;

const volumeOf = (l: number, w: number, h: number): number => l * w * h;

/** Kalem ölçülü mü — dördü de dolu olmalı (ölçüler zaten all-or-none, ağırlık ayrı sorulur). */
function measured(item: ParcelItem): boolean {
  return (
    item.packedWeightG !== null &&
    item.packedLengthMm !== null &&
    item.packedWidthMm !== null &&
    item.packedHeightMm !== null
  );
}

/** Paket kutuya FİZİKSEL olarak giriyor mu — üç kenarın da sığması gerekir (döndürme serbest). */
function fitsInside(item: ParcelItem, box: ParcelBox): boolean {
  const paket = [item.packedLengthMm!, item.packedWidthMm!, item.packedHeightMm!].sort((a, b) => a - b);
  const kutu = [box.lengthMm, box.widthMm, box.heightMm].sort((a, b) => a - b);
  return paket.every((kenar, i) => kenar <= kutu[i]!);
}

/**
 * Sepeti kutulara böler.
 *
 * **Sıra: büyükten küçüğe** (first-fit decreasing). Küçükten başlamak kutuları küçük paketlerle
 * doldurur ve büyük paket sonunda kendine yer bulamaz — aynı sepet için gereksiz bir kutu daha
 * doğar. Klasik bir sezgiseldir; en iyi çözümü vaat etmez, ama sonucu ÖLÇÜLEBİLİRDİR (dönen plan
 * ağırlığı ve hacmi taşır) ve tekrarlanabilir.
 *
 * **Kutu seçimi: sığan EN KÜÇÜK kutu.** Büyük kutu daha az kutu demek değil (hacim aynı) ama daha
 * çok hacimsel ağırlık demek — tarifenin barajı yukarı doğru işliyor.
 */
export function planParcels(items: readonly ParcelItem[], boxes: readonly ParcelBox[]): ParcelPlanResult {
  const unmeasured = items.filter((i) => i.qty > 0 && !measured(i)).map((i) => i.variantId);
  // Ölçüsüzlük ÖNCE söylenir: kutu yokluğu da bir eksiklik ama operatörün göreceği ilk iş
  // ölçüyü tamamlamaktır ve iki eksikliği aynı anda söylemek ekranı okunmaz kılar.
  if (unmeasured.length > 0) return { ok: false, reason: 'unmeasured', unmeasured };

  const usable = boxes.filter((b) => volumeOf(b.lengthMm, b.widthMm, b.heightMm) > 0);
  if (usable.length === 0) return { ok: false, reason: 'no_box', unmeasured: [] };

  // Her adet AYRI bir paket olarak açılır: iki adet aynı varyant iki ayrı kutuya düşebilir.
  const units = items
    .filter((i) => i.qty > 0)
    .flatMap((i) => Array.from({ length: i.qty }, () => i))
    .sort((a, b) => volumeOf(b.packedLengthMm!, b.packedWidthMm!, b.packedHeightMm!) - volumeOf(a.packedLengthMm!, a.packedWidthMm!, a.packedHeightMm!));

  const byVolume = [...usable].sort(
    (a, b) => volumeOf(a.lengthMm, a.widthMm, a.heightMm) - volumeOf(b.lengthMm, b.widthMm, b.heightMm),
  );
  const largest = byVolume[byVolume.length - 1]!;

  const parcels: Array<{ box: ParcelBox; contents: Map<string, number>; weightG: number; volume: number }> = [];

  for (const unit of units) {
    if (!fitsInside(unit, largest)) {
      return { ok: false, reason: 'too_large', unmeasured: [], variantId: unit.variantId };
    }
    const unitVolume = volumeOf(unit.packedLengthMm!, unit.packedWidthMm!, unit.packedHeightMm!);

    // 1) Açık kutulardan sığan İLKİNE koy (first-fit).
    const open = parcels.find((p) => {
      const kapasite = volumeOf(p.box.lengthMm, p.box.widthMm, p.box.heightMm) * FILL_RATE;
      const agirlikTamam = p.box.maxContentG === null || p.weightG + unit.packedWeightG! <= p.box.maxContentG;
      return fitsInside(unit, p.box) && p.volume + unitVolume <= kapasite && agirlikTamam;
    });
    if (open) {
      open.contents.set(unit.variantId, (open.contents.get(unit.variantId) ?? 0) + 1);
      open.weightG += unit.packedWeightG!;
      open.volume += unitVolume;
      continue;
    }

    // 2) Yeni kutu: paketi ALAN en küçük kutu — hacim de ağırlık da tutmalı.
    const box =
      byVolume.find(
        (b) =>
          fitsInside(unit, b) &&
          unitVolume <= volumeOf(b.lengthMm, b.widthMm, b.heightMm) * FILL_RATE &&
          (b.maxContentG === null || unit.packedWeightG! <= b.maxContentG),
      ) ?? largest;
    parcels.push({ box, contents: new Map([[unit.variantId, 1]]), weightG: unit.packedWeightG!, volume: unitVolume });
  }

  return {
    ok: true,
    unmeasured: [],
    parcels: parcels.map((p) => ({
      box: p.box,
      contents: [...p.contents.entries()].map(([variantId, qty]) => ({ variantId, qty })),
      // Dara BURADA ekleniyor, biriktirme sırasında değil: ağırlık tavanı İÇERİĞE bakar
      // (`max_content_g` künyesi), taşıyıcıya bildirilen sayı ise kutuyla birlikte olandır.
      weightG: p.weightG + p.box.tareG,
      contentVolumeMm3: p.volume,
    })),
  };
}
