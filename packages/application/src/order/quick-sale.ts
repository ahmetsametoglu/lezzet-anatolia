import { OrderService, SettingsService, WarehouseService, type Db } from '@lezzet/database';
import { canTransition, generateReferenceNo, producesReferenceNo, stockEffectOf } from '@lezzet/domain-core';
import type { OrderStatus, PaymentMethod, PreparationPick } from '@lezzet/types';
import { recordOrderPayment } from './payment';
import { readCourierRun } from '../courier/day';
import { suggestPicksForVariant } from '../warehouse/preparation';

/**
 * Hızlı satış kapısı (07.10) — **uygulama katmanı orkestrasyonu**. ORDER_LIFECYCLE "Hızlı satış yolu".
 *
 * Kapı önünde tek bir an vardır: mal gider, para alınır, satış kapanır. Tam yolun yedi adımı burada
 * bir adımdır — ama hiçbir **iz** atlanmaz: parti kaydı, referans, geçiş logu ve kâr kalemleri
 * tam yoldakiyle aynı yerlere yazılır.
 *
 * Kararların hepsi motorda: geçiş izinli mi (`status-machine`), bu yol gerçekten hızlı satış mı
 * (`stockEffectOf → consume_direct`), referans üretilir mi. Bu dosya onları gerçek girdilere
 * bağlar; yazımı tek transaction'da RPC yapar.
 *
 * **Mal ile para iki ayrı yazımdır** (12.2): satış RPC'si stoğu düşürüp siparişi kapatır, tahsilat
 * ardından hareket tablosuna yazılır (`recordOrderPayment`) — kapı önü nakdi kasanın bakiyesine de
 * düşsün diye. Sıra bilinçlidir: mal zaten gitti, para kaydı onu geri alamaz.
 */

export type QuickSaleOutcome =
  | {
      status: 'ok';
      referenceNo: string | null;
      consumedQty: number;
      cogsAmountCents: number;
      /** Tahsilat hareketi yazıldı mı — hesap belirsizse satış kapanır ama para kayıtsız kalır. */
      paymentRecorded: boolean;
    }
  /** Kurallara aykırı — sipariş taslak değil (kapanmış siparişi kapıda yeniden satamazsın). */
  | { status: 'forbidden'; reason: 'same_status' | 'terminal' | 'not_allowed' | 'not_fast_sale_path' }
  /** Araya biri girdi: sipariş bu arada ilerletilmiş. */
  | { status: 'stale'; currentStatus: OrderStatus }
  /** Mal yok — kasiyer ekranı kalan miktarı gösterir, satış hiç yazılmaz. */
  | { status: 'insufficient_stock'; variantId: string; available: number }
  | { status: 'not_found' };

export interface QuickSaleInput {
  orderId: string;
  /** Kapıdaki satışı yapan personel. */
  actorId?: string | null;
  paymentMethod: PaymentMethod;
  /** Tahsil edilen tutar (**cent**). Verilmezse siparişin toplamı tahsil edilmiş sayılır. */
  collectedAmountCents?: number;
  /**
   * Paranın girdiği hesap (kasadaki çekmece). Verilmezse `door_cash_account_id` ayarına düşülür;
   * o da yoksa tahsilat KAYDEDİLMEZ — satış yine kapanır, para kayıtsız görünür.
   */
  paymentAccountId?: string;
  /**
   * Hangi kalemden hangi parti çıktı. Verilmezse **FEFO ile türetilir** — kapıda hazırlık ekranı
   * yoktur, önce süresi dolan çıkar (DOMAIN §4).
   */
  picks?: readonly PreparationPick[];
}

export async function quickSale(db: Db, input: QuickSaleInput): Promise<QuickSaleOutcome> {
  const orders = new OrderService(db);

  const found = await orders.getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };
  const { order, items } = found;

  // 1) Kural: `completed`'a geçilebilir mi, ve bu geçiş HIZLI SATIŞ yolu mu? İkincisi önemlidir:
  //    `delivered → completed` de izinlidir ama o kapanıştır (07.7), stoğu burada düşürmemeli.
  const verdict = canTransition(order.status, 'completed');
  if (!verdict.allowed) return { status: 'forbidden', reason: verdict.reason };
  if (stockEffectOf(order.status, 'completed') !== 'consume_direct') {
    return { status: 'forbidden', reason: 'not_fast_sale_path' };
  }

  // 2) Partiler: verilmediyse FEFO önerisi. Yetmiyorsa satış hiç başlamaz.
  let picks: PreparationPick[];
  if (input.picks) {
    picks = input.picks.map((pick) => ({ ...pick, batches: [...pick.batches] }));
  } else {
    picks = [];
    for (const item of items) {
      const suggestion = await suggestPicksForVariant(db, order.warehouseId, item.variantId, item.qty);
      if (suggestion.shortfall > 0) {
        return {
          status: 'insufficient_stock',
          variantId: item.variantId,
          available: item.qty - suggestion.shortfall,
        };
      }
      picks.push({ orderItemId: item.id, batches: suggestion.picks.map((p) => ({ stockId: p.stockId, qty: p.qty })) });
    }
  }

  // 3) Referans: hızlı satışta ilk kalıcı durum `completed`'dır — numara burada doğar.
  const referenceNo =
    !order.referenceNo && producesReferenceNo(order.status, 'completed')
      ? generateReferenceNo({ year: new Date(order.createdAt).getFullYear() })
      : null;

  // 4) Paketleme maliyeti ayardan; kapı önünde varsayılan 0 — mal elden gidiyor, soğuk zincir paketi yok.
  const settings = new SettingsService(db);
  const packagingCents = await settings.getNumber('door_packaging_unit_cost_cents', 0);

  const result = await orders.quickSale({
    orderId: order.id,
    picks,
    actorId: input.actorId,
    referenceNo,
    paymentMethod: input.paymentMethod,
    packagingUnitCostCents: packagingCents,
  });

  if (!result.ok) {
    // Son söz RPC'nindir: öneri hazırlanırken boş olan raf, yazım anında dolmuş olabilir (ya da tersi).
    if (result.reason === 'insufficient_stock' && result.variantId) {
      return { status: 'insufficient_stock', variantId: result.variantId, available: result.available ?? 0 };
    }
    return { status: 'stale', currentStatus: result.currentStatus };
  }

  // ── 4b) ARAÇTAN SATIŞ SEFERE BAĞLANIR (ölçülmüş açık, 26.08) ──────────────
  //
  // Sefer kapanışının beklediği nakit `delivery_run_collection` görünümünden geliyor ve o görünüm
  // `where o.delivery_run_id is not null` ile süzüyor. Kolonu YAZAN tek yer ise `start_delivery_run`
  // (0046) — yani seferin DURAKLARI. Araçtan yapılan satış bir durak değildir; kolon boş kalırdı ve
  // sonuç şu olurdu: kurye akşam elindeki parayı teslim eder, sistem onu beklemez, mutabakat
  // **fazla** verir ve farkın sebebi hiçbir ekranda görünmez. Her araç satışında tekrarlardı.
  //
  // Kural EKRANDA değil BURADA, çünkü burası her yerinde satışın geçtiği tek kapı: ekranın
  // hatırlamasına bırakılsaydı unutan ilk yol sessizce açık nakit üretirdi.
  //
  // Ölçüt satışın YERİ (`kind === 'vehicle'`), personelin rolü değil: depo kapısındaki satış bir
  // sefere ait değildir ve oradaki para kasaya girer. Açık sefer yoksa (kurye henüz çıkmamış ya da
  // dönmüş) bağ KURULMAZ — uydurulmuş bir sefer, parayı yanlış kapanışa yazardı.
  //
  // ── "AÇIK SEFER"İN TANIMI TEK YERDEN OKUNUR (mobil şeridin ölçümü, 26.08) ──
  //
  // İlk yazımda burası kendi tanımını kuruyordu (`returnedAt === null`), kurye ekranı ise başka bir
  // tanımdan konuşuyordu (kapanış kaydı var mı). Gerçek akışta ikisi çakışır — `close_delivery_run`
  // dönüş damgasını ve kapanış satırını AYNI çağrıda yazar (0046) — ama çakışmaları bir tesadüftür,
  // kural değil: seed dönüş damgasını kapanış olmadan yazınca ikisi ayrıştı ve motor, ekranın
  // "açık" dediği sefere bağ kurmayı reddetti. İki tanım varsa biri bir gün yanlış olur.
  //
  // Bu yüzden ölçüt artık ekranın okuduğu fonksiyonun ta kendisi (`readCourierRun`): aynı gün, aynı
  // kurye, aynı öncelik kuralı. Ve tanım TEK sinyale indi — **sefer kapanmamışsa açıktır**. Ölçüt
  // dönüş damgası DEĞİL, çünkü sorulan soru "araç yolda mı" değil, *"bu para hâlâ bir mutabakata
  // girebilir mi"*: kapanmış sefere sonradan satış bağlamak, dün mutabık olan fotoğrafı bugün
  // sebepsiz "eksik" göstermek olurdu. Damgayı ölçüt yapmak ise ekranla ayrışmayı geri getirirdi.
  //
  // "Günler önce dönülmüş, kapatılmamış bir sefer bugünün parasını yutar mı?" — yutamaz: okuma
  // GÜNE bağlı (`readCourierRun` varsayılanı bugün), dünün seferi hiç aday olmaz.
  if (input.actorId) {
    const warehouse = await new WarehouseService(db).getById(order.warehouseId);
    if (warehouse?.kind === 'vehicle') {
      const sefer = await readCourierRun(db, { courierId: input.actorId });
      if (sefer && !sefer.closed) await orders.update({ id: order.id, deliveryRunId: sefer.runId });
    }
  }

  // 5) Tahsilat AYRI bir gerçektir (12.2): para bir hesaba girer, sipariş cache'i ondan türer.
  //    Satışın kendisi bu adıma bağlı DEĞİLDİR — mal çoktan gitti, stok düştü. Hesap belirsizse
  //    satış yine kapanır, tahsilat kaydedilmemiş olarak görünür: uydurulmuş bir "ödendi"den iyidir.
  const accountId = input.paymentAccountId ?? (await settings.get<string | null>('door_cash_account_id', null));
  let paymentRecorded = false;
  if (accountId) {
    const collected = await recordOrderPayment(db, {
      orderId: order.id,
      accountId,
      amountCents: input.collectedAmountCents ?? order.orderedTotalCents,
      description: 'Kapı önü satış',
    });
    paymentRecorded = collected.status === 'ok';
  }

  // 6) ÖDÜL ÇAĞRISI BURADAN KALKTI (17.9). İki sebep birden:
  //    · **Sipariş puanı kaldırıldı** (kullanıcı kararı 11.08) — yazılacak bir sipariş puanı yok.
  //    · **Getirenin ödülü artık ödemeye bağlı**, teslimata/kapanışa değil: yukarıdaki
  //      `recordOrderPayment` zaten ödeme durumunu `paid`e çeviriyor ve ödül orada doğuyor
  //      (`order/payment.ts` → `finalize`). Buradan ikinci kez çağırmak aynı kuralı iki yerde
  //      tutmak olurdu.
  //    **Bilinçli sonuç:** hesap ayarlı değilse tahsilat kaydedilmez ve ödül de yazılmaz. Para
  //    fiilen alınmış olabilir ama defter onu görmüyor; "para alındığında yaz" kuralının ölçütü
  //    defterdir, elimizdeki nakit değil.

  return {
    status: 'ok',
    referenceNo: result.referenceNo ?? null,
    consumedQty: result.consumedQty ?? 0,
    cogsAmountCents: result.cogsAmountCents ?? 0,
    paymentRecorded,
  };
}
