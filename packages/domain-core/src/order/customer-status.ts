import type { CustomerOrderStatus, OrderStatus } from '@lezzet/types';

/**
 * Sipariş durumunun müşteriye görünen karşılığı (08.5) — saf karar, DB'siz.
 *
 * Dokuz iç durum altı kategoriye iner. Daraltma bilinçlidir ve tasarımın kuralıdır: *"iç durum
 * adları ve durum makinesinin ara halleri görünmez — müşteri dilinde az sayıda hal yeter."*
 *
 * Birleşen iki çift:
 * - `preparing` + `ready` → **hazırlanıyor.** "Hazır" depo için bir aşamadır (paket toplandı,
 *   araca bekliyor); müşteri için henüz değişen bir şey yok — siparişi hâlâ yola çıkmamıştır.
 * - `delivered` + `completed` → **teslim edildi.** `completed` bir MUHASEBE kapanışıdır (tahsilat
 *   mutabık). Müşteriye "tamamlandı" demek, elindeki paketi aldıktan sonra bir şey daha
 *   beklediğini düşündürürdü.
 *
 * **`draft` için `null` döner ve bu bir hata değil, cevabın kendisidir:** taslak henüz bir sipariş
 * değil (checkout yarıda kalmış). Ona uydurma bir müşteri hâli vermek — "alındı" demek — müşteriye
 * vermediği bir siparişi göstermek olurdu. Çağıran onu listeden düşürür.
 */
export function customerOrderStatus(status: OrderStatus): CustomerOrderStatus | null {
  switch (status) {
    case 'draft':
      return null;
    case 'confirmed':
      return 'received';
    case 'preparing':
    case 'ready':
      return 'preparing';
    case 'out_for_delivery':
      return 'on_the_way';
    case 'delivered':
    case 'completed':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    case 'returned':
      return 'returning';
  }
}

/**
 * Sipariş müşteri için hâlâ "akıyor" mu — liste bunu en üstte ve yeşil çerçeveyle ayırır
 * (tasarım: *"aktif sipariş listenin en üstünde, yeşil çerçeveyle ayrışır"*).
 *
 * Ölçüt "kapanmış mı" değil **"beklediğim bir şey var mı"**: teslim edilmiş sipariş de iptal de
 * iade de kapanmıştır — müşterinin takip edeceği bir hareket kalmamıştır. İade sürecini aktif
 * saymadık: orada topu müşteri değil biz taşıyoruz, ve listede yeşil çerçeve "yolda" beklentisi
 * yaratırdı.
 */
export function isActiveForCustomer(status: CustomerOrderStatus): boolean {
  return status === 'received' || status === 'preparing' || status === 'on_the_way';
}

/**
 * **`fulfilled_qty` anlamlı mı** — yani o sayı bir ÖLÇÜM mü, yoksa henüz yazılmamış varsayılan mı?
 *
 * Kolonun varsayılanı `0` ve hazırlık onaylanana kadar (06.5, `setFulfilled`) öyle kalır. Yani yeni
 * onaylanmış bir siparişte `fulfilled_qty = 0` **"hiçbiri gönderilmedi" DEMEZ**, "daha bakılmadı"
 * der. İkisini karıştıran ekran, müşteriye siparişinin boş gittiğini söyler ve tutarları eksiye
 * düşürür — bu gerçekten yaşandı (30.07, kullanıcı ekran görüntüsüyle yakaladı).
 *
 * CLAUDE.md §1'in kuralı: *ölçülemeyen değer sıfır değildir.* Bu fonksiyon o kuralın sipariş
 * tarafındaki karşılığı: ölçüm var mı yok mu sorusunu TEK yerde cevaplar, okuyan taraf da
 * yoksa `qty`ye düşer.
 *
 * Eşik `ready`: hazırlık onayı tam olarak orada yazılıyor. `preparing` henüz mutfakta demek —
 * kalemler sayılmamıştır.
 */
export function isFulfilmentKnown(status: OrderStatus): boolean {
  switch (status) {
    case 'draft':
    case 'confirmed':
    case 'preparing':
    case 'cancelled':
      return false;
    case 'ready':
    case 'out_for_delivery':
    case 'delivered':
    case 'completed':
    case 'returned':
      return true;
  }
}

/** Müşteriye gösterilen dört sabit kilometre taşı (tasarım: "zaman çizgisi 4 sabit adım"). */
export type OrderMilestone = 'received' | 'prepared' | 'on_the_way' | 'delivered';

export interface OrderTimelineStep {
  milestone: OrderMilestone;
  state: 'done' | 'current' | 'pending';
  /**
   * Adımın gerçekleştiği an — **kaydı yoksa `null`.**
   *
   * Ayrım şu: **durum çıkarsanabilir, damga çıkarsanamaz.** Sipariş yoldaysa hazırlandığı
   * kesindir (hazırlanmamış sipariş yola çıkmaz), o yüzden adım `done` işaretlenir. Ama "ne zaman
   * hazırlandı" sorusunun cevabı yoksa uydurulmaz — ekran o adımın altına saat yazmaz.
   * (CLAUDE.md §1: ölçülemeyen değer sıfır değildir; burada da tarih değildir.)
   */
  at: string | null;
}

/** Kilometre taşını KARŞILAYAN iç durum(lar) — sıra anlamlıdır, zaman çizgisi bu sırayla çizilir. */
const MILESTONE_STATUSES: readonly (readonly [OrderMilestone, readonly OrderStatus[]])[] = [
  ['received', ['confirmed']],
  ['prepared', ['ready']],
  ['on_the_way', ['out_for_delivery']],
  ['delivered', ['delivered', 'completed']],
];

/**
 * Sipariş zaman çizgisi (08.5) — dört adımın hangisi geçildi, hangisi şu an, hangisi bekliyor.
 *
 * **Girdi durum GEÇMİŞİDİR, anlık durum değil.** Sipariş `out_for_delivery` iken "Hazırlandı"nın
 * da geçildiğini yalnız geçmiş söyleyebilir; anlık durumdan çıkarmaya çalışmak, atlanan geçişleri
 * (hızlı satış yolu) uydurmak olurdu.
 *
 * **`null` = çizgi çizilmez.** İptal ve iade için tasarım açıkça *"çizgi yerine tek durum bloğu"*
 * diyor ve haklı: iptal bir yolculuğun adımı değil, yolculuğun kendisinin sonlanması. Taslak da
 * müşteriye hiç görünmez.
 *
 * `prepared` adımı `ready` iç durumuna bakar, `preparing`e DEĞİL: müşteri "hazırlandı" gördüğünde
 * işin bittiğini anlar — mutfakta olmayı adım saymak, aynı adımı iki kez göstermek olurdu.
 */
export function orderTimeline(
  current: OrderStatus,
  /** Durum defteri (`order_status_log`), eskiden yeniye. */
  history: readonly { toStatus: OrderStatus; createdAt: string }[],
): OrderTimelineStep[] | null {
  if (current === 'draft' || current === 'cancelled' || current === 'returned') return null;

  const stampOf = new Map<OrderStatus, string>();
  for (const row of history) if (!stampOf.has(row.toStatus)) stampOf.set(row.toStatus, row.createdAt);

  const reached = new Set<OrderStatus>([...history.map((h) => h.toStatus), current]);
  const hit = MILESTONE_STATUSES.map(([, statuses]) => statuses.some((s) => reached.has(s)));

  // En ileri geçilen adım. Hiçbiri yoksa (yalnız `preparing`) ilk adım "şu an"dır: sipariş alınmış
  // ama kaydı düşmemiş olabilir — müşteriye boş bir çizgi göstermektense ilk adımı işaretlemek doğru.
  let furthest = 0;
  for (let i = hit.length - 1; i >= 0; i -= 1) {
    if (hit[i]) {
      furthest = i;
      break;
    }
  }

  const terminal = current === 'delivered' || current === 'completed';
  return MILESTONE_STATUSES.map(([milestone, statuses], i) => ({
    milestone,
    // Geçilmiş adım `done`: yoldaki sipariş hazırlanmıştır, kaydı düşmemiş olsa da. Bu bir uydurma
    // DEĞİL, fiziksel bir çıkarım — ortada boş halka bırakmak müşteriye bozuk bir çizgi gösterirdi.
    state: (i < furthest ? 'done' : i === furthest ? (terminal ? 'done' : 'current') : 'pending') as OrderTimelineStep['state'],
    // Damga ise çıkarsanmaz: defterde karşılığı yoksa `null`.
    at: statuses.map((st) => stampOf.get(st)).find(Boolean) ?? null,
  }));
}
