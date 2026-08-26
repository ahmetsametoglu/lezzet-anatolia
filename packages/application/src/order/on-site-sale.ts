import { OrderService, WarehouseService, type Db } from '@lezzet/database';
import type { CreateOrderItemInput } from '@lezzet/database';
import type { PaymentMethod, PreferredLanguage } from '@lezzet/types';
import { getCartView } from '../cart/read';
import { quickSale, type QuickSaleOutcome } from './quick-sale';

/**
 * **YERİNDE SATIŞ** (21.118 · `DOMAIN §17`) — depo kapısında ya da kuryenin aracında, tek adımda.
 *
 * `DOMAIN §17`: *"Admin yerinde satış yapmaz — satan kişi, malın yanında duran personeldir."*
 * Bu yüzden depo çağıranın künyesinden gelir (personelin O ANKİ deposu) ve **araç da bir depodur**
 * (`warehouse.kind='vehicle'`): aynı kapı hem tezgâhı hem arabayı taşır.
 *
 * ── İKİNCİ BİR SİPARİŞ KURALI YAZILMADI (09.8'in dersi) ─────────────────────
 * Fiyat, KDV, indirim ve toplam **sepet okumasından** geliyor (`getCartView`) — yani müşterinin
 * gördüğü sayıyı üreten motorun ta kendisinden. Pazarlık da oraya giriyor (`priceOverrides`), o
 * alanın künyesi zaten *"yalnız personel yolundan dolar (elle sipariş girişi, yerinde satış)"*
 * diyor. Burada ikinci bir hesap YOK; bu dosya yalnız sırayı kuruyor.
 *
 * ── AMA `createCheckoutDraft` KULLANILMIYOR, VE BU BİLİNÇLİ ─────────────────
 * O kapı **adresten çözülen** akıştır: dönüş tipi bile `AddressDeliveryType` (yani `pickup`
 * HARİÇ). Yerinde satışta adres yok, bölge yok, gün yok, kargo ücreti yok — dördü de `pickup`ın
 * tanımı gereği anlamsız (`resolveShippingFee` `pickup` ALMAZ: cevabı "0" değil, sorunun kendisi
 * geçersiz). Adres yolunu zorlamak, dar kümenin taşıdığı kararı sessizce delmek olurdu.
 *
 * ── `pickup` ⇒ ANINDA TÜKETİM DEĞİL ────────────────────────────────────────
 * Kural bu dosyanın kuralıdır, `delivery_type`ın değil (`DATA_MODEL` › `pickup`). Stok etkisini
 * teslimat tipi değil GEÇİŞ belirliyor (`stockEffectOf`) ve `draft → completed`i BURASI seçiyor.
 * İleride Drive (sipariş ver, gelip al) aynı `pickup` değerini kullanacak ama tam yoldan geçecek:
 * ayırır → hazırlar → teslimde tüketir. O kapıyı kapatmamak için tüketim kararı burada durur.
 */

/**
 * **Yerinde satışın anonim alıcısı** — sabit kimlik, `0001`de yazılıyor (`roles = {system}`).
 *
 * Sipariş sahipsiz olamıyor ama kimlik de SORULMUYOR (kullanıcı kararı 26.08). Bu satır bir kişi
 * değil, bir beyandır: *"müşterisi bilinmiyor."* `system` rolü hiçbir kapı açmaz ve müşteri
 * listesi/sayaçları `roles @> {customer}` ile süzüldüğü için hiçbirinde görünmez — yani ona bir
 * GEÇMİŞ oluşmuyor. Gerekçenin tamamı `0001`in künyesinde.
 *
 * Kimlikli müşteri de bu kapıdan alabilir (kendi hesabıyla duran biri) — o hâlde çağıran gerçek
 * kimliği geçirir; bu sabit yalnız VARSAYILAN değil, **kimliksiz hâlin cevabıdır**.
 */
export const ANONYMOUS_BUYER_ID = '00000000-0000-4000-8000-00000000d001';

export interface OnSiteSaleLine {
  variantId: string;
  qty: number;
  /**
   * Pazarlıklı birim fiyat (**cent**). Verilmezse liste fiyatı çözülür.
   *
   * Dokunulmamış kalemde `undefined` gider ve sunucu fiyatı kendisi çözer — her kaleme sayı
   * göndermek siparişin parasını istemciye yazdırmak olurdu (09.8'in aynı kararı).
   */
  negotiatedUnitPriceCents?: number;
}

export interface OnSiteSaleInput {
  /** Personelin O ANKİ deposu — tesis ya da ARAÇ. Varsayılanı YOKTUR (DOMAIN §17 / C2). */
  warehouseId: string;
  /** Satışı yapan personel — pazarlık izinin "kim" tarafı ve geçiş logunun aktörü. */
  staffId: string;
  /**
   * Siparişin yazılacağı müşteri. Kimlik SORULMADIĞI için bu normalde anonim kayıttır; kimlikli
   * müşteri de geçebilir (kendi hesabıyla alan biri). Kararı çağıran verir — bu kapı politika
   * uygulamaz, yalnız yazar.
   */
  customerId: string;
  lines: readonly OnSiteSaleLine[];
  paymentMethod: PaymentMethod;
  /** Tahsil edilen tutar (**cent**). Verilmezse siparişin toplamı tahsil edilmiş sayılır. */
  collectedAmountCents?: number;
  /** Paranın girdiği kasa. Verilmezse `door_cash_account_id` ayarına düşülür (`quickSale`). */
  paymentAccountId?: string;
  /** Satır adlarının dili — ret mesajları müşterinin değil PERSONELİN dilinde okunur. */
  locale?: PreferredLanguage;
}

export type OnSiteSaleOutcome =
  | { status: 'ok'; orderId: string; totalCents: number; referenceNo: string | null; paymentRecorded: boolean }
  /** Kalemsiz satış yazılamaz — RPC de reddediyor, kontrol gidiş-dönüşü harcamamak için. */
  | { status: 'empty' }
  | { status: 'warehouse_not_found' }
  /** Satılamaz satır (tükendi / satışa kapalı). Elle fiyat yazmak kapanmış ürünü DİRİLTMEZ. */
  | { status: 'blocked_lines'; lines: string[] }
  /** Kapanış adımının reddi olduğu gibi taşınır — mal yok, yarış, kural reddi. */
  | { status: 'sale_failed'; outcome: Exclude<QuickSaleOutcome, { status: 'ok' }> };

export async function sellOnSite(db: Db, input: OnSiteSaleInput): Promise<OnSiteSaleOutcome> {
  if (input.lines.length === 0) return { status: 'empty' };

  const warehouse = await new WarehouseService(db).getById(input.warehouseId);
  if (!warehouse) return { status: 'warehouse_not_found' };

  const locale: PreferredLanguage = input.locale ?? 'tr';
  const overrides = new Map(
    input.lines
      .filter((line) => line.negotiatedUnitPriceCents !== undefined)
      .map((line) => [line.variantId, line.negotiatedUnitPriceCents!] as const),
  );

  /*
    Sepet okuması yerin DEPOSUNU alıyor ve bu tam da istediğimiz süzgeç: depo bazlı
    `available_stock` aracı AYNEN gösteriyor (depo-üstü toplam göstermiyor — `available_stock_total`
    araçları dışlıyor). Yani kuryenin arabasındaki mal burada görünür, ayrılmış mal görünmez.
  */
  const view = await getCartView(
    db,
    locale,
    input.lines.map((line) => ({ kind: 'variant' as const, variantId: line.variantId, qty: line.qty, stockId: null })),
    { customerId: input.customerId, priceOverrides: overrides, warehouseId: input.warehouseId },
  );

  const blocked = view.lines.filter((line) => line.unitPriceCents === null).map((line) => line.name);
  if (blocked.length > 0) return { status: 'blocked_lines', lines: blocked };

  /*
    PAKET SATIRI BURADA YOK ve bu bir eksiklik değil, girdinin şekli: bu kapı yalnız varyant
    kalemi alıyor (`OnSiteSaleLine.variantId`), yani sepet okuması da paket satırı üretemiyor.
    Süzgeç tipi daraltmak için, davranışı değiştirmiyor. Kapıda paket satılmak istenirse girdi
    genişler; o gün pazarlığın pakete UYGULANMADIĞI da hatırlanmalı (`priceOverrides` künyesi:
    paketin fiyatı tek sayıdır ve payların toplamı olmak zorundadır — DOMAIN §13).
  */
  const variantLines = view.lines.filter((line): line is typeof line & { variantId: string } => line.variantId !== undefined);

  const items: CreateOrderItemInput[] = variantLines.map((line) => ({
    variantId: line.variantId,
    qty: line.qty,
    unitPriceCents: line.unitPriceCents ?? 0,
    // Pazarlık izi İKİSİ BİRLİKTE yazılır (kısıt veride: `order_item_negotiation_complete`).
    ...(line.listUnitPriceCents != null
      ? { listUnitPriceCents: line.listUnitPriceCents, priceSetBy: input.staffId }
      : {}),
    vatRate: line.vatRate,
  }));

  const { order } = await new OrderService(db).create(
    {
      customerId: input.customerId,
      warehouseId: input.warehouseId,
      channel: 'b2c',
      // `door` enum değeri 15.15'ten beri tanımlıydı ve yazan yolu YOKTU — bu kapı onu dolduruyor.
      orderSource: 'door',
      deliveryType: 'pickup',
      status: 'draft',
      paymentMethod: input.paymentMethod,
      // Kargo ücreti SORULMUYOR: `resolveShippingFee` `pickup` almıyor, sipariş doğrudan 0 yazar.
      shippingFeeCents: 0,
      totalCents: view.totalCents,
      locale,
    },
    items,
  );

  const outcome = await quickSale(db, {
    orderId: order.id,
    actorId: input.staffId,
    paymentMethod: input.paymentMethod,
    collectedAmountCents: input.collectedAmountCents,
    paymentAccountId: input.paymentAccountId,
  });

  if (outcome.status !== 'ok') return { status: 'sale_failed', outcome };

  return {
    status: 'ok',
    orderId: order.id,
    totalCents: view.totalCents,
    referenceNo: outcome.referenceNo,
    paymentRecorded: outcome.paymentRecorded,
  };
}
