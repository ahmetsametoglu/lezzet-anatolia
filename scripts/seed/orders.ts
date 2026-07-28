import {
  AccountService, AddressService, CartService, DeliveryZoneService, MoneyMovementService, OrderService,
  ReservationService, StockService,
} from '@lezzet/database';
import { derivePaymentStatusForOrder, generateReferenceNo } from '@lezzet/domain-core';
import type { OrderStatus } from '@lezzet/types';
import { an, euro, gun, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';

// ── Sepet (07) ───────────────────────────────────────────────────────────────────────────────────
// Sepette stok AYRILMAZ ve sepetteki fiyat BAĞLAYICI DEĞİLDİR (DOMAIN §5): gösterimdir. Bayat sepet
// bilinçli konuyor — checkout'ta "fiyat değişti" bildirimi ancak eski fiyatlı bir sepetle denenir.

export async function seedCarts(db: Db, kisiler: Kisiler, varyantlar: VaryantRef[]): Promise<void> {
  if (await tabloDolu(db, 'cart')) {
    console.log('▸ sepetler zaten dolu — atlandı');
    return;
  }
  console.log('▸ SEPET seed');
  const carts = new CartService(db);
  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate');
  const { data } = await db.from('stock').select('id,variant_id').not('offer_price', 'is', null).limit(1);
  const teklif = (data ?? [])[0] as { id: string; variant_id: string } | undefined;

  const b2c = kisiler.get('b2cSadik');
  if (b2c) {
    for (const [i, v] of satilabilir.slice(0, 3).entries()) {
      await carts.addItem(b2c, { variantId: v.id, qty: 1 + i, unitPrice: euro(8 + i * 2) });
    }
    // Partiye çıpalı teklif satırı: indirim PARTİYE aittir, parti tükenirse kalem normal fiyata döner.
    if (teklif) await carts.addItem(b2c, { variantId: teklif.variant_id, qty: 2, unitPrice: 4.9, stockId: teklif.id });
  }

  const b2b = kisiler.get('b2bOnayli');
  if (b2b) {
    // Toptan sepeti: çok kalem, yüksek adet — asgari sepet ve kargo eşiği burada anlam kazanır.
    for (const [i, v] of satilabilir.slice(4, 12).entries()) {
      await carts.addItem(b2b, { variantId: v.id, qty: 6 + i * 2, unitPrice: euro(5.4 + i * 0.8) });
    }
  }

  // BAYAT sepet: bir yıl önce eklenmiş, fiyatı artık yanlış. "Sepette bekleyen fiyat bağlayıcı
  // değildir" kararının (DOMAIN §5) görünür kanıtı.
  const bayat = kisiler.get('b2cKapaliKapida');
  if (bayat && satilabilir[2]) {
    await carts.addItem(bayat, { variantId: satilabilir[2].id, qty: 2, unitPrice: 3.2 });
    // Tarihi geriye almanın SERVİSTE karşılığı yok ve olmamalı: `updatedAt` her dokunuşta tazelenir
    // (sepet kurtarma zamanlaması ona bakar). Geriye almak yalnız seed'in derdi — o yüzden burada,
    // doğrudan. Sepetin anahtarı `customer_id`'dir (id yok), miras `update` bu tabloda çalışmaz.
    const { error } = await db.from('cart').update({ updated_at: an(-380) }).eq('customer_id', bayat);
    if (error) throw error;
  }
  console.log('✓ sepet: 3 sepet (normal · toptan · BAYAT) + partiye çıpalı teklif satırı');
}

// ── Siparişler (07) ──────────────────────────────────────────────────────────────────────────────
// Sipariş katı bir zincir DEĞİL, izin verilen geçişler kümesidir; iki yol vardır (tam yol / hızlı
// satış). Aşağıdaki siparişler durumların HEPSİNİ kaplar — depo kuyruğu, kurye günü, muhasebe
// listesi ve müşteri geçmişi ancak böyle dolu görünür.
//
// Siparişler GERÇEK akışla kurulur (ayır → onayla → hazırla → yola çık → teslim et → kapat), elle
// durum yazılarak değil: böylece rezervasyon, kalem–parti kaydı, geçiş logu ve kâr kalemleri de
// kendiliğinden doğru oluşur.

interface SiparisKalem {
  variantId: string;
  qty: number;
  unitPrice: number;
  vatRate: number;
}

/** Tam yolun durakları — sırayla yürünür; hedef nerede ise orada durulur. */
const TAM_YOL: OrderStatus[] = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed'];

export async function seedOrders(db: Db, kisiler: Kisiler, varyantlar: VaryantRef[]): Promise<void> {
  if (await tabloDolu(db, 'order')) {
    console.log('▸ siparişler zaten dolu — atlandı');
    return;
  }
  console.log('▸ SİPARİŞ seed');
  const orders = new OrderService(db);
  const reservations = new ReservationService(db);
  const stocks = new StockService(db);
  const zones = await new DeliveryZoneService(db).list({ activeOnly: true });
  const addresses = new AddressService(db);

  const movements = new MoneyMovementService(db);
  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate');
  const kurye = kisiler.get('kurye') ?? null;
  const depocu = kisiler.get('depocu') ?? null;

  /** Kalem kurar: fiyat kanal tabanından, KDV üründen. */
  const kalem = (i: number, qty: number): SiparisKalem => {
    const v = satilabilir[i % satilabilir.length]!;
    return { variantId: v.id, qty, unitPrice: euro(7 + (i % 9) * 1.6), vatRate: v.vatRate };
  };
  const toplam = (kalemler: SiparisKalem[], kargo = 0) => euro(kalemler.reduce((s, k) => s + k.unitPrice * k.qty, 0) + kargo);

  /** Kalemin karşılanabileceği partileri FEFO sırasıyla toplar (hazırlık onayının girdisi). */
  async function partiSec(variantId: string, qty: number): Promise<Array<{ stockId: string; qty: number }>> {
    const partiler = await stocks.listInStock(variantId);
    const secim: Array<{ stockId: string; qty: number }> = [];
    let kalan = qty;
    for (const p of partiler) {
      if (kalan <= 0) break;
      const al = Math.min(p.physicalQty, kalan);
      if (al > 0) secim.push({ stockId: p.id, qty: al });
      kalan -= al;
    }
    return secim;
  }

  const varsayilanAdres = async (customerId: string) => (await addresses.listByCustomer(customerId))[0] ?? null;

  // Paranın gireceği hesap: kasa. Para bölümü siparişlerden ÖNCE koştuğu için hazırdır.
  const kasaId = (await new AccountService(db).list({ activeOnly: true })).find((h) => h.type === 'cash')?.id ?? null;

  /**
   * Tahsilat/iade bir HAREKETTİR (12.2): siparişteki `amount_*` ondan türer. Hareket + cache tek
   * transaction'da (`recordForOrder`), ödeme durumu ardından motordan.
   */
  async function tahsilatYaz(orderId: string, tutar: number, tip: 'order_payment' | 'order_refund'): Promise<void> {
    if (!kasaId || tutar <= 0) return;
    await movements.recordForOrder({ orderId, accountId: kasaId, amount: tutar, type: tip, valueDate: gun(-1) });
  }

  /**
   * Ödeme durumunu motordan türetip yazar. Web kapısı (`lib/money/order-payment`) üretim yoludur;
   * seed onu import EDEMEZ (uygulama kodu), o yüzden aynı motoru doğrudan çağırır — eşleme
   * motorda olduğu için kural yine tek yerdedir.
   */
  async function odemeDurumuTazele(orderId: string): Promise<void> {
    const bulunan = await orders.getWithItems(orderId);
    if (!bulunan) return;
    const { order, items } = bulunan;
    const durum = derivePaymentStatusForOrder(order, items, {
      collected: order.amountCollected,
      refunded: order.amountRefunded,
    }).status;
    if (durum !== order.paymentStatus) await orders.update({ id: orderId, paymentStatus: durum });
  }

  /** Siparişi açar ve hedef duruma kadar GERÇEK akışla yürütür. */
  async function siparis(opts: {
    musteri: string;
    kalemler: SiparisKalem[];
    hedef: 'draft' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled' | 'returned';
    channel: 'b2b' | 'b2c';
    kaynak?: 'web' | 'whatsapp' | 'door' | 'manual';
    deliveryType?: 'route' | 'shipping';
    onAccount?: boolean;
    paymentMethod?: 'online' | 'cash' | 'card' | 'cheque' | 'bank_transfer';
    ttlDk?: number | null;
    kargo?: number;
    tahsilat?: number;
    yasi?: number;
    /** Patron ikramı — yalnız muhasebe export'undan düşer, gerisi tam normal (DOMAIN §9). */
    hediye?: boolean;
    /** Dış muhasebeden dönmüş resmî fatura numarası (12.7 eşleştirme kuyruğu boşalmış satır). */
    faturaNo?: string;
    etiket: string;
  }): Promise<string | null> {
    const customerId = kisiler.get(opts.musteri);
    if (!customerId) return null;

    const adres = await varsayilanAdres(customerId);
    const deliveryType = opts.deliveryType ?? 'route';
    const zone = deliveryType === 'route' ? zones.find((z) => adres && z.postalCodes.includes(adres.postalCode)) : undefined;

    const { order, items } = await orders.create(
      {
        customerId,
        channel: opts.channel,
        orderSource: opts.kaynak ?? 'web',
        deliveryType,
        deliveryZoneId: zone?.id ?? null,
        deliveryDate: deliveryType === 'route' ? gun(2) : null,
        addressId: adres?.id ?? null,
        addressSnapshot: adres ? { line1: adres.line1, postalCode: adres.postalCode, city: adres.city, country: adres.country } : null,
        courierId: ['out_for_delivery', 'delivered', 'completed', 'returned'].includes(opts.hedef) ? kurye : null,
        onAccount: opts.onAccount ?? false,
        paymentMethod: opts.paymentMethod ?? null,
        isGiftOrder: opts.hediye ?? false,
        shippingFee: opts.kargo ?? 0,
        total: toplam(opts.kalemler, opts.kargo ?? 0),
      },
      opts.kalemler,
    );

    // Yaşlandırma: vade gecikmesi ve "eski sipariş" ancak geçmiş tarihli kayıtta görünür.
    if (opts.yasi) await orders.update({ id: order.id, createdAt: an(-opts.yasi) });
    // Fatura numarası DIŞARIDA doğar, sistem yalnız eşleştirir (12.7) — burada eşleşmiş hâli kurulur.
    if (opts.faturaNo) await orders.update({ id: order.id, invoiceNo: opts.faturaNo });

    // Hızlı satış AYRI YOLDUR: rezervasyon yok, fiiliden anında düşer (07.10).
    if (opts.kaynak === 'door' && opts.hedef === 'completed') {
      const picks = [];
      for (const item of items) picks.push({ orderItemId: item.id, batches: await partiSec(item.variantId, item.qty) });
      const sonuc = await orders.quickSale({
        orderId: order.id,
        picks,
        actorId: depocu,
        // Referans MOTORDAN gelir (biçim tek yerde tanımlı); hızlı satışta ilk kalıcı durum `completed`.
        referenceNo: generateReferenceNo({ year: new Date().getFullYear() }),
        paymentMethod: opts.paymentMethod ?? 'cash',
      });
      // Tahsilat AYRI yazılır (12.2): kapı önü nakdi kasanın bakiyesine de düşsün. Durum da
      // hareketten türetilir — üretimde bunu kapı yapar (`lib/order/quick-sale`), seed onu taklit eder.
      if (sonuc.ok) {
        await tahsilatYaz(order.id, opts.tahsilat ?? toplam(opts.kalemler), 'order_payment');
        await odemeDurumuTazele(order.id);
      }
      console.log(`  ✓ ${opts.etiket} · ${sonuc.ok ? 'kapandı' : `atlandı (${sonuc.reason})`}`);
      return order.id;
    }

    if (opts.hedef === 'draft') {
      // Online checkout başlamış, ödeme bekleniyor: rezervasyon TTL'li (süre dolarsa cron bırakır).
      for (const item of items) await reservations.reserve({ orderId: order.id, variantId: item.variantId, qty: item.qty, ttlMinutes: opts.ttlDk ?? 30 });
      console.log(`  ✓ ${opts.etiket} · taslak (TTL'li rezervasyon)`);
      return order.id;
    }

    // Tam yol: önce ayır (kapıda/vadeli → süresiz), sonra ilerlet.
    for (const item of items) await reservations.reserve({ orderId: order.id, variantId: item.variantId, qty: item.qty });

    // İptal/iade kendi hedefine doğrudan gitmez: siparişin oraya gelmiş olması gerekir. İptal
    // `confirmed`'dan, iade ise teslim SONRASINDAN olur — yol farkı budur (ORDER_LIFECYCLE).
    const durak: OrderStatus[] =
      opts.hedef === 'cancelled'
        ? ['confirmed']
        : opts.hedef === 'returned'
          ? ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered']
          : TAM_YOL.slice(0, TAM_YOL.indexOf(opts.hedef as OrderStatus) + 1);

    let onceki: OrderStatus = 'draft';
    for (const hedef of durak) {
      if (hedef === 'preparing') {
        // Hazırlık onayı: fiilen çıkan partiler yazılır (geri çağırma + gerçek COGS bunun üstünde).
        const picks = [];
        for (const item of items) picks.push({ orderItemId: item.id, batches: await partiSec(item.variantId, item.qty) });
        await orders.transition({ orderId: order.id, from: onceki, to: 'preparing', actorId: depocu });
        await orders.recordPreparation(order.id, picks);
        onceki = 'preparing';
        continue;
      }
      if (hedef === 'delivered') {
        await orders.deliver(order.id, { actorId: kurye, deliveryProof: { by: 'Kurye', at: an(0), method: 'imza' } });
        onceki = 'delivered';
        continue;
      }
      if (hedef === 'completed') {
        await orders.close(order.id, { actorId: depocu, routeUnitCost: 2.5, packagingUnitCost: 1.2 });
        onceki = 'completed';
        continue;
      }
      // Referans İLK KALICI DURUMDA doğar (tam yolda `confirmed`) — RPC mevcut numarayı ezmez.
      await orders.transition({
        orderId: order.id,
        from: onceki,
        to: hedef,
        actorId: depocu,
        referenceNo: hedef === 'confirmed' ? generateReferenceNo({ year: new Date().getFullYear() }) : null,
      });
      onceki = hedef;
    }

    if (opts.hedef === 'cancelled' || opts.hedef === 'returned') {
      await orders.transition({ orderId: order.id, from: onceki, to: opts.hedef, actorId: depocu });
      await reservations.releaseByOrder(order.id);
    }

    // Tahsilat bir HAREKETTİR (12.2): siparişteki `amount_*` ondan türer, doğrudan yazılmaz.
    if (opts.tahsilat) await tahsilatYaz(order.id, opts.tahsilat, 'order_payment');
    // Ödeme durumu her hâlükârda tazelenir: tahsilatı olmayan sipariş de doğru durumda kalsın
    // (vadeli sipariş `pending`, iptal edilen `pending`…).
    await odemeDurumuTazele(order.id);

    console.log(`  ✓ ${opts.etiket} · ${opts.hedef}`);
    return order.id;
  }

  // — Tam yolun her durağı (depo/kurye kuyrukları dolsun)
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(0, 2), kalem(1, 1)], hedef: 'draft', channel: 'b2c', paymentMethod: 'online', etiket: 'Ödeme bekleyen checkout' });
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(2, 3)], hedef: 'confirmed', channel: 'b2c', paymentMethod: 'cash', tahsilat: 0, etiket: 'Onaylı — kapıda ödeyecek' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(3, 8), kalem(4, 6), kalem(5, 4)], hedef: 'preparing', channel: 'b2b', onAccount: true, etiket: 'Depoda hazırlanıyor (toptan)' });
  await siparis({ musteri: 'b2cKapaliKapida', kalemler: [kalem(6, 2)], hedef: 'ready', channel: 'b2c', paymentMethod: 'card', tahsilat: 0, etiket: 'Hazır — sevkiyat bekliyor' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(7, 5), kalem(8, 5)], hedef: 'out_for_delivery', channel: 'b2b', onAccount: true, etiket: 'Yolda (kuryede)' });
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(9, 2), kalem(10, 1)], hedef: 'delivered', channel: 'b2c', paymentMethod: 'cash', tahsilat: 0, etiket: 'Teslim edildi — kapıda tahsilat bekliyor' });

  // — Kapanmış siparişler (kâr raporunun girdisi)
  // Fatura numarası eşleşmiş: 12.7 kuyruğunun BOŞALMIŞ hâli de ekranda görülebilsin.
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(11, 3)], hedef: 'completed', channel: 'b2c', paymentMethod: 'online', tahsilat: toplam([kalem(11, 3)]), yasi: 12, faturaNo: 'FA-2026-0117', etiket: 'Kapandı — online ödenmiş (faturası eşleşti)' });
  await siparis({ musteri: 'b2cAlman', kalemler: [kalem(12, 2)], hedef: 'completed', channel: 'b2c', deliveryType: 'shipping', kargo: 7.9, paymentMethod: 'online', tahsilat: toplam([kalem(12, 2)], 7.9), yasi: 20, etiket: 'Kapandı — DE kargo (OSS izlemi)' });

  // — Vadeli: AÇIK BAKİYE ve GECİKME türetiminin öznesi (ödenmemiş, biri vadesi geçmiş)
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(13, 10), kalem(14, 6)], hedef: 'completed', channel: 'b2b', onAccount: true, tahsilat: 0, yasi: 45, etiket: 'Vadeli — GECİKMİŞ (45 gün)' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(15, 4)], hedef: 'completed', channel: 'b2b', onAccount: true, tahsilat: 0, yasi: 10, etiket: 'Vadeli — henüz vadesi dolmadı' });
  await siparis({ musteri: 'b2bAlman', kalemler: [kalem(16, 6)], hedef: 'completed', channel: 'b2b', onAccount: true, tahsilat: euro(toplam([kalem(16, 6)]) / 2), yasi: 8, etiket: 'Vadeli — KISMİ ödenmiş' });

  // — Hızlı satış (kapı önü): tek adımda kapanır, rezervasyon yok
  await siparis({ musteri: 'b2cKapaliKapida', kalemler: [kalem(17, 2)], hedef: 'completed', channel: 'b2c', kaynak: 'door', paymentMethod: 'cash', etiket: 'Hızlı satış — kapı önü (nakit)' });
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(18, 1), kalem(19, 2)], hedef: 'completed', channel: 'b2c', kaynak: 'door', paymentMethod: 'card', etiket: 'Hızlı satış — kapı önü (kart)' });

  // — Patron ikramı: parayı patron öder, gelir/kâr/kasa TAM normal — yalnız muhasebe export'una
  // girmez (DOMAIN §9). Export özetinde "hariç tutulan" satırı bununla dolar.
  await siparis({ musteri: 'b2cKapaliKapida', kalemler: [kalem(24, 2)], hedef: 'completed', channel: 'b2c', paymentMethod: 'cash', tahsilat: toplam([kalem(24, 2)]), yasi: 6, hediye: true, etiket: 'Patron ikramı (export dışı)' });

  // — İptal ve iade
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(20, 2)], hedef: 'cancelled', channel: 'b2c', paymentMethod: 'online', tahsilat: 0, etiket: 'İptal' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(21, 3)], hedef: 'returned', channel: 'b2b', onAccount: true, tahsilat: 0, etiket: 'İade sürecinde' });

  // — WhatsApp ve elle giriş: kaynak ekseni kanaldan bağımsızdır (CHANNELS §2)
  await siparis({ musteri: 'b2bBekleyen', kalemler: [kalem(22, 4)], hedef: 'confirmed', channel: 'b2c', kaynak: 'whatsapp', paymentMethod: 'cash', tahsilat: 0, etiket: 'WhatsApp siparişi' });
  await siparis({ musteri: 'b2cAlman', kalemler: [kalem(23, 3)], hedef: 'preparing', channel: 'b2c', kaynak: 'manual', deliveryType: 'shipping', kargo: 7.9, paymentMethod: 'bank_transfer', etiket: 'Telefondan elle girilen sipariş' });

  const { count } = await db.from('order').select('*', { count: 'exact', head: true });
  console.log(`✓ sipariş: ${count ?? 0} kayıt (9 durumun hepsi · 4 kaynak · tam yol + hızlı satış)`);
}

