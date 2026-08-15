import { z } from 'zod';

/**
 * **TEDARİK SİPARİŞİ FORMUNUN ŞEMASI** — iki yüzeyin paylaştığı tek tanım (22.33).
 *
 * `intake-form`'un aynı gerekçesi (22.23): tedarik siparişini kuran form iki yerde açılıyor —
 * tedarik ekranının "elle sipariş" penceresi ve asistan kuyruğunun `purchase_order` gövdesi. İkinci
 * yüzey için formu YENİDEN yazmak, kullanıcının 22.23'te reddettiği şeyin ta kendisi olurdu:
 * *"komponentler ortak komponent havuzundan kullanılmamış, yeniden tasarlanmış."*
 *
 * ── SATIR NEDEN VARYANT ANAHTARLI ─────────────────────────────────────────────
 * `intake-form`un tersine burada dizi bir HARİTA gibi davranır: aynı varyant iki kez ısmarlanmaz —
 * mal kabulde iki satır AYRI parti demektir (farklı SKT/lot), siparişte ise sadece adet toplanır.
 * Yine de dizi tutuluyor: sıralama operatörün girdiği sıradır ve bir varyantı iki kez eklemek
 * hatadır, sessizce birleştirilecek bir durum değil (`purchaseOrderBlock` söyler).
 */
export const PurchaseOrderFormLineSchema = z.object({
  variantId: z.string(),
  /** Satırda okunan ad — dilekçeden ya da aramadan gelir; kimlik ekranda gösterilmez. */
  title: z.string(),
  /** Ismarlanan adet. Sipariş satırı adetsiz olmaz — `null` yok, en az 1 (`purchaseOrderBlock`). */
  qty: z.number().int(),
  /**
   * Bu tedarikçiden SON alınan birim fiyat (**cent**) — yalnız GÖSTERİLİR, girilmez.
   *
   * Alış siparişte değil MAL KABULDE kesinleşir; buraya bir giriş alanı koymak, henüz bilinmeyen bir
   * sayıyı operatöre yazdırmak olurdu. Ama tamamen gizlemek de yanlış: kasadan yaklaşık ne çıkacağını
   * görmeden verilen sipariş kararı, kararın kendisi değildir (`PurchaseOrderCard` künyesi).
   * `null` = bu varyant için eşleme/geçmiş yok — satır toplama GİRMEZ, "eksik" sayılır.
   */
  lastPurchasePriceCents: z.number().int().nullable(),
});
export type PurchaseOrderFormLine = z.infer<typeof PurchaseOrderFormLineSchema>;

export const PurchaseOrderFormSchema = z.object({
  /** Tedarikçi — **zorunlu** (aşağıdaki künye). Boş metin = seçilmedi. */
  supplierId: z.string(),
  /**
   * Hedef depo — boş bırakmak GEÇERLİ ve anlamlı: hedefi bilinmeyen sipariş hiçbir deponun eksiğini
   * kapatmış sayılmaz ve öneri motoru onu ayrıca gösterir (`ReorderLine.unassignedQty`), sessizce
   * bir depoya yazmaktan iyidir.
   *
   * **Kuyruktan gelen öneride ise DOLU gelir ve dolu kalmalı:** dilekçe zaten "şu deponun eksiği"
   * sinyalinden doğuyor (`PurchaseOrderPayloadSchema.warehouseId` zorunlu).
   */
  targetWarehouseId: z.string(),
  note: z.string(),
  lines: z.array(PurchaseOrderFormLineSchema),
});
export type PurchaseOrderFormValues = z.infer<typeof PurchaseOrderFormSchema>;

/** Boş satır — "kalem ekle" ve dilekçe kalemleri için tek yerden. */
export function emptyPurchaseOrderLine(variantId = '', title = ''): PurchaseOrderFormLine {
  return { variantId, title, qty: 1, lastPurchasePriceCents: null };
}

/**
 * Kaydetmeyi engelleyen sebep — alt bar bunu YAZIYOR, düğmeyi sessizce kapatmıyor.
 *
 * **TEDARİKÇİ ENGELİ BURADA, çünkü kapının kuralı orada.** `applyPurchaseOrder` tedarikçisiz
 * dilekçeden sipariş açmayı reddediyor (*"sonradan kimin gönderileceği bilinmeyen bir taslak"*) ve
 * bu kural onay anında öğrenilmemeli: "Onayla"ya basıp hata okumak, seçiciyi doldururken uyarılmaktan
 * kötüdür. Asistan tedarikçiyi bulamadan da öneri üretebilir — o hâlde form onu SORAR.
 */
export function purchaseOrderBlock(values: PurchaseOrderFormValues): string | null {
  if (!values.supplierId) return 'Önce tedarikçiyi seçin — kimden alınacağı belli olmayan sipariş açılamaz.';
  if (values.lines.length === 0) return 'En az bir kalem ekleyin.';
  if (values.lines.some((line) => !line.variantId)) return 'Her kalemde bir ürün seçin.';
  if (values.lines.some((line) => !Number.isInteger(line.qty) || line.qty <= 0)) return 'Adet en az 1 olmalı.';
  // Aynı varyant iki satırda: sessizce toplamak yanlış sayıyı doğru gibi gösterirdi (yukarıdaki künye).
  const ids = values.lines.map((line) => line.variantId).filter(Boolean);
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate) {
    const title = values.lines.find((line) => line.variantId === duplicate)?.title;
    return `Aynı ürün iki kalemde: ${title || 'bir ürün'} — adetleri tek satırda toplayın.`;
  }
  return null;
}

/**
 * Siparişin tahmini tutarı — **bir kalemin bile fiyatı eksikse `null`**.
 *
 * Eksik tabanla bulunan toplam gerçeğinden daima azdır ve az görünen bir tutar onayı kolaylaştırır
 * (`CLAUDE §1` — ölçülemeyen değer sıfır değildir). Kart da aynı kuralı uyguluyor; ikisi ayrı
 * yazılsaydı biri bir gün ötekinden ayrılırdı.
 */
export function purchaseOrderEstimate(values: PurchaseOrderFormValues): { totalCents: number | null; unpricedCount: number } {
  const unpricedCount = values.lines.filter((line) => line.lastPurchasePriceCents === null).length;
  if (unpricedCount > 0) return { totalCents: null, unpricedCount };
  return {
    totalCents: values.lines.reduce((sum, line) => sum + (line.lastPurchasePriceCents ?? 0) * line.qty, 0),
    unpricedCount: 0,
  };
}
