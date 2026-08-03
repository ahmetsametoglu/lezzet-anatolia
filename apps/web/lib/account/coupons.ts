import 'server-only';
import { DiscountCodeService, DiscountService, serviceDb } from '@lezzet/database';

/**
 * Müşterinin KULLANILABİLİR kişisel kuponları — hesaptaki "Kuponlarım" kutusunun kaynağı (17.5).
 *
 * Kupon ayrı bir tablo değil, `customerId` dolu bir **indirim** satırıdır: puan çevirimi
 * `redeem_points` RPC'siyle o satırı doğurur. İkinci bir "kupon" varlığı açmak, aynı şeyin iki
 * tanımı olurdu ve sepette çalışan indirim motorunun bu ikinciyi hiç görmemesi anlamına gelirdi.
 *
 * **Süzgeç KULLANILABİLİRLİĞE göre, sahipliğe göre değil.** Ekran "kuponlarım" diyor ama müşterinin
 * beklediği anlam "bugün kullanabileceklerim"dir; kullanılmış ya da süresi geçmiş bir kodu listede
 * göstermek, sepette reddedilecek bir kodu vaat etmektir. Üç eleme yapılıyor:
 *
 *  · pasif edilmiş (`isActive` kapalı) — operatör iptal etmiş olabilir
 *  · tarih penceresi dışında (`validFrom`/`validTo`)
 *  · kotası dolmuş — puan kuponu tek kullanımlıktır, bir siparişte harcandıktan sonra listede
 *    durması müşteriyi checkout'ta "bu kod kullanılmış" hatasına götürürdü
 *
 * Kota sayımı `usageCounts` ile yapılıyor, `discount_use` satırı elle sayılarak değil: o metot
 * iptal edilmiş siparişleri zaten dışlıyor ve o kural (iptal "hiç olmadı", iade "oldu ve döndü")
 * burada ikinci kez yazılmamalı.
 */
export interface CustomerCoupon {
  id: string;
  code: string;
  /** Kuponun değeri (cent) — puan kuponu her zaman tutar indirimidir, yüzde değil. */
  amountCents: number | null;
  percent: number | null;
  /** Asgari sepet koşulu; `null` = koşulsuz. Ekran bunu ancak varsa yazar. */
  minBasketCents: number | null;
  validTo: string | null;
}

export async function listCustomerCoupons(customerId: string): Promise<CustomerCoupon[]> {
  const db = serviceDb();
  const discounts = new DiscountService(db);
  const mine = await discounts.listByCustomer(customerId);
  if (mine.length === 0) return [];

  const now = Date.now();
  const active = mine.filter((d) => {
    if (!d.isActive) return false;
    if (d.validFrom && Date.parse(d.validFrom) > now) return false;
    if (d.validTo && Date.parse(d.validTo) < now) return false;
    return true;
  });
  if (active.length === 0) return [];

  const ids = active.map((d) => d.id);
  const [usage, codes] = await Promise.all([
    discounts.usageCounts(ids),
    // **Kod AYRI bir varlık** (`DiscountCode`) ve bunun sebebi dildir: aynı kural birden çok koda
    // açılabilir. Puan kuponunda tek kod vardır ama ekran bunu VARSAYMAZ — ilki alınır, yoksa
    // satır hiç çizilmez. Kodsuz bir kupon müşteriye gösterilemez: yazacağı bir şey yoktur.
    new DiscountCodeService(db).listByDiscounts(ids),
  ]);

  return active
    .filter((d) => {
      const used = usage.get(d.id);
      // Kota YOKSA sınırsızdır; `maxUses` null bir eksiklik değil, bilinçli bir "sınırsız".
      if (d.maxUses !== null && (used?.total ?? 0) >= d.maxUses) return false;
      if (d.perCustomerLimit !== null && (used?.byCustomer.get(customerId) ?? 0) >= d.perCustomerLimit) return false;
      return true;
    })
    .flatMap((d) => {
      const code = codes.get(d.id)?.[0]?.code;
      if (!code) return [];
      return [{
        id: d.id,
        code,
        amountCents: d.amountCents,
        percent: d.percent,
        minBasketCents: d.minBasketCents,
        validTo: d.validTo,
      }];
    });
}
