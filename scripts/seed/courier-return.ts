import {
  closeCourierDay,
  confirmDoorDelivery,
  loadBox,
  markUndelivered,
  openBox,
  sealBox,
  startCourierDay,
  takeToVan,
  transitionOrder,
} from '@lezzet/application';
import {
  AddressService,
  DeliveryZoneService,
  OrderItemService,
  OrderService,
  PriceService,
  ReservationService,
  StockService,
  UserProfileService,
} from '@lezzet/database';
import { resolveVatTreatment } from '@lezzet/domain-core';
import { tabloDolu, type Db, type VaryantRef } from './shared';
import type { Depolar } from './warehouse';

/*
  Kurye dönüşü sahnesi: bir kurye, iki sefer (biri kapandı: teslim, kapıda ret, ulaşılamadı; biri araçta bekliyor) ve araçta
  satılmayan serbest ürün; satırlar elle yazılmaz, gerçek kapılardan geçer ki ekran üretimde oluşamayacak bir hâl göstermesin.
  Kapıdaki nakit eksik teslim edilir ki PARA bölümünün tek türü (`run_close_mismatch`) beslemede de doğsun; kuryesiz dönüşün
  üretim yolu olmadığı için sahnede yok.
*/

/** Sahnenin kurye anahtarı — `people.ts`teki `kurye` satırı (Marc Lemoine, kapsamı {str, van}). */
const KURYE_EPOSTA = 'kurye@lezzetanatolie.com';

/** Sahnenin müşterileri — `test-orders.ts`in açtığı deneme hesapları; ikinci bir küme açılmıyor. */
const MUSTERI_EPOSTALARI = ['test1@example.fr', 'test2@example.fr', 'test3@example.fr', 'test4@example.fr'];

interface SahneDurak {
  musteri: string;
  /** Kapının sonucu — sahnenin hangi hâlini besliyor. */
  akibet: 'delivered' | 'refused' | 'unreachable';
  not?: string;
}

export async function seedCourierReturn(db: Db, varyantlar: VaryantRef[], depolar: Depolar): Promise<void> {
  if (await tabloDolu(db, 'delivery_run')) {
    console.log('▸ sefer tablosu dolu — kurye dönüşü sahnesi atlandı');
    return;
  }
  console.log('▸ KURYE DÖNÜŞÜ SAHNESİ seed');

  const profiles = new UserProfileService(db);
  const kurye = await profiles.findByEmail(KURYE_EPOSTA);
  if (!kurye) throw new Error(`seed: kurye profili yok (${KURYE_EPOSTA}) — sahne kurulamaz`);

  /*
    İki rota aynı gün: rota+gün başına tek sefer kuralı (`delivery_run_key`) iki ayrı rota ister ve araçta yan yana durmaları için
    ikisi aynı gün koşmalı. Gün takvimden, bugünden geriye aranır: dönen mal rampada duruyorsa sefer çoktan sürülmüştür.
  */
  const zones = (await new DeliveryZoneService(db).list()).filter(
    (zone) => zone.warehouseId === depolar.str && zone.isActive,
  );
  const { gun, rotalar } = ortakKosuGunu(zones);
  const [rotaA, rotaB] = rotalar;

  const aracId = await aracIdOf(db, depolar.van);
  const musteriler = await Promise.all(MUSTERI_EPOSTALARI.map((email) => profiles.findByEmail(email)));
  const adresler = new AddressService(db);
  const orders = new OrderService(db);
  const reservations = new ReservationService(db);

  /* Kalem adayları: STR'de BOLCA duran, aktif ve FİYATLI varyantlar — rezervasyon kullanılabilir
     stoğa bakıyor ve yetmezse reddediyor (`test-orders.ts`in aynı eşiği). */
  const { data: stokSatirlari } = await db
    .from('stock')
    .select('variant_id,physical_qty')
    .eq('warehouse_id', depolar.str)
    .gt('physical_qty', 20);
  const stokta = new Set(((stokSatirlari ?? []) as { variant_id: string }[]).map((s) => s.variant_id));
  const adaylar = varyantlar.filter((v) => v.status === 'active' && stokta.has(v.id));
  const fiyatlar = await new PriceService(db).findApplicableMap(adaylar.map((v) => v.id), 'b2c');
  const fiyatli = adaylar.filter((v) => (fiyatlar.get(v.id)?.channelPrice?.amountCents ?? 0) > 0);
  if (fiyatli.length < 6) throw new Error(`seed: kurye sahnesi için yeterli stoklu+fiyatlı varyant yok (${fiyatli.length})`);

  let imlec = 0;
  /** Sipariş kurar, `ready`ye getirir, kutusunu mühürler ve ARACA yükler — dört durağın ortak yolu. */
  const durakKur = async (zoneId: string, musteriIndex: number): Promise<{ orderId: string; code: string; dueCents: number } | null> => {
    const musteri = musteriler[musteriIndex % musteriler.length];
    if (!musteri) return null;
    const adres = (await adresler.listByCustomer(musteri.id))[0];
    if (!adres) return null;

    const varyant = fiyatli[imlec % fiyatli.length]!;
    imlec += 1;
    const birim = fiyatlar.get(varyant.id)!.channelPrice!.amountCents;
    const adet = 2;

    const vergi = resolveVatTreatment({ channel: 'b2c', deliveryCountry: 'FR' });
    const { order } = await orders.create(
      {
        customerId: musteri.id,
        warehouseId: depolar.str,
        deliveryCountry: 'FR',
        vatTreatment: vergi.treatment,
        channel: 'b2c',
        orderSource: 'web',
        deliveryType: 'route',
        deliveryZoneId: zoneId,
        deliveryDate: gun,
        locale: 'fr',
        addressId: adres.id,
        addressSnapshot: {
          label: adres.label,
          recipient: adres.recipient,
          line1: adres.line1,
          line2: adres.line2,
          postalCode: adres.postalCode,
          city: adres.city,
          phone: adres.phone,
          country: adres.country,
          lat: adres.lat,
          lng: adres.lng,
          geoPrecision: adres.geoPrecision,
          geoSource: adres.geoSource,
        },
        courierId: null,
        onAccount: false,
        paymentMethod: 'cash',
        isGiftOrder: false,
        shippingFeeCents: 0,
        orderedTotalCents: birim * adet,
      },
      [{ variantId: varyant.id, qty: adet, vatRate: 5.5, unitPriceCents: birim }],
    );

    await reservations.reserve({ orderId: order.id, warehouseId: depolar.str, variantId: varyant.id, qty: adet });
    await transitionOrder(db, { orderId: order.id, to: 'confirmed' });

    const acildi = await openBox(db, { orderId: order.id, warehouseId: depolar.str });
    if (acildi.status !== 'ok') throw new Error(`seed: kutu açılamadı (${acildi.status})`);
    const parti = await partiSec(db, depolar.str, varyant.id);
    const kalemler = await new OrderItemService(db).listByOrders([order.id]);
    const muhurlendi = await sealBox(db, {
      boxId: acildi.box.boxId,
      warehouseId: depolar.str,
      picks: [{ orderItemId: kalemler[0]!.id, batches: [{ stockId: parti, qty: adet }] }],
      actorId: kurye.id,
    });
    if (muhurlendi.status !== 'ok') throw new Error(`seed: kutu mühürlenemedi (${muhurlendi.status})`);

    return { orderId: order.id, code: acildi.box.code, dueCents: birim * adet };
  };

  /* Kapı tahsilatının gireceği hesap, para sahnesinin açtığı kasa; hesap yoksa tahsilat atlanır, kapanış farksız kapanır ve
     yalnız PARA zili doğmaz. Hesap burada yaratılmaz, para defterinin sahibi `money.ts`. */
  const { data: kasa } = await db.from('account').select('id').eq('type', 'cash').eq('is_active', true).limit(1).maybeSingle();
  const kasaId = (kasa as { id: string } | null)?.id ?? null;
  let tahsilEdilenKurus = 0;

  // ── SEFER A — sürülür, üç durak sonuçlanır, kapanır ────────────────────────
  const durakA: SahneDurak[] = [
    { musteri: MUSTERI_EPOSTALARI[0]!, akibet: 'delivered' },
    { musteri: MUSTERI_EPOSTALARI[1]!, akibet: 'refused', not: 'kapıda reddetti — koku şüphesi' },
    { musteri: MUSTERI_EPOSTALARI[2]!, akibet: 'unreachable', not: 'zil çalmadı, kimse yok' },
  ];
  const kutularA: Array<{ orderId: string; code: string; dueCents: number; akibet: SahneDurak['akibet']; not?: string }> = [];
  for (const [i, durak] of durakA.entries()) {
    const kutu = await durakKur(rotaA.id, i);
    if (kutu) kutularA.push({ ...kutu, akibet: durak.akibet, not: durak.not });
  }

  /* Sefer KURULUR ama kutular ondan SONRA biner: `loadBox` siparişin bir sefere damgalı olmasını
     bekliyor (kuryeye atama `start_delivery_run`ın claim'inde yapılıyor). */
  const seferA = await startCourierDay(db, { courierId: kurye.id, date: gun, zoneId: rotaA.id, vehicleId: aracId, depart: false });
  if (seferA.status !== 'ok') throw new Error(`seed: sefer A açılamadı (${seferA.status})`);
  for (const kutu of kutularA) {
    const yuklendi = await loadBox(db, { code: kutu.code, courierId: kurye.id });
    if (yuklendi.status !== 'ok') throw new Error(`seed: kutu araca binmedi (${yuklendi.status})`);
  }

  const suruldu = await startCourierDay(db, { courierId: kurye.id, date: gun, zoneId: rotaA.id, vehicleId: aracId, depart: true });
  if (suruldu.status !== 'ok') throw new Error(`seed: sefer A yola çıkamadı (${suruldu.status})`);

  for (const kutu of kutularA) {
    if (kutu.akibet === 'delivered') {
      /* Kapıda NAKİT tahsil ediliyor: sipariş zaten `cash` ve tutarı belli — para uydurulmuyor,
         siparişin kendi borcu kapatılıyor. Kuyruk tekrarına karşı anahtar istemcide üretilir;
         burada sahnenin kendi sabit anahtarı yeter (aynı seed iki kez koşarsa satır tekrarlamaz). */
      const teslim = await confirmDoorDelivery(db, {
        orderId: kutu.orderId,
        courierId: kurye.id,
        scannedBoxCodes: [kutu.code],
        collection: kasaId === null ? null : {
          method: 'cash',
          amountCents: kutu.dueCents,
          accountId: kasaId,
          idempotencyKey: `seed-kurye-donus:${kutu.orderId}`,
        },
      });
      if (teslim.status !== 'ok') throw new Error(`seed: teslim yazılamadı (${teslim.status})`);
      tahsilEdilenKurus += kutu.dueCents;
      continue;
    }
    if (kutu.akibet === 'refused' || kutu.akibet === 'unreachable') {
      const sonuc = await markUndelivered(db, {
        orderId: kutu.orderId,
        courierId: kurye.id,
        outcome: kutu.akibet,
        note: kutu.not ?? null,
      });
      if (sonuc.status !== 'ok') throw new Error(`seed: ${kutu.akibet} yazılamadı (${sonuc.status})`);
    }
  }

  /* Kapanış eksik beyanla: kurye 2,50 € eksik teslim eder ve fark gerçek üreticiden (`notifyRunCloseMismatch`) doğar, PARA
     bölümünün tek türü ancak böyle doğar. Tahsilat sıfırsa fark da sıfır kalır ve zil haklı olarak susar. */
  const eksikBeyanKurus = tahsilEdilenKurus > 0 ? 250 : 0;
  const kapandi = await closeCourierDay(db, {
    courierId: kurye.id,
    runId: seferA.run.runId,
    countedCashCents: tahsilEdilenKurus - eksikBeyanKurus,
    note: eksikBeyanKurus > 0 ? 'kasa sayımı eksik çıktı — kurye beyanı' : null,
  });
  if (!kapandi.ok) throw new Error(`seed: sefer A kapanamadı (${kapandi.reason})`);

  // ── SEFER B — araçta bekler, yola çıkmaz ───────────────────────────────────
  const kutuB = await durakKur(rotaB.id, 3);
  const seferB = await startCourierDay(db, { courierId: kurye.id, date: gun, zoneId: rotaB.id, vehicleId: aracId, depart: false });
  if (seferB.status !== 'ok') throw new Error(`seed: sefer B açılamadı (${seferB.status})`);
  if (kutuB) {
    const yuklendi = await loadBox(db, { code: kutuB.code, courierId: kurye.id });
    if (yuklendi.status !== 'ok') throw new Error(`seed: sefer B kutusu araca binmedi (${yuklendi.status})`);
  }

  // ── SERBEST ÜRÜN — araca alındı, satılmadı ─────────────────────────────────
  let serbestAdet = 0;
  for (const varyant of fiyatli.slice(0, 2)) {
    const alindi = await takeToVan(db, {
      warehouseId: depolar.str,
      vehicleWarehouseId: depolar.van,
      variantId: varyant.id,
      qty: 5,
      actorId: kurye.id,
    });
    if (alindi.status !== 'ok') throw new Error(`seed: araca serbest ürün alınamadı (${alindi.status})`);
    serbestAdet += alindi.movedQty;
  }

  console.log(
    `✓ kurye dönüşü sahnesi: ${rotaA.name} kapandı (1 teslim · 1 red · 1 ulaşılamadı) · ` +
      `${rotaB.name} araçta bekliyor · araçta ${serbestAdet} adet serbest ürün · gün ${gun}`,
  );
}

/**
 * İki rotanın ortak koşu günü, bugünden geriye aranır: dönen mal rampada duruyorsa sefer çoktan sürülmüştür. Bulunamazsa sessiz
 * geçilmez, çünkü ortak günü olmayan iki rota bir veri hatasıdır.
 */
function ortakKosuGunu(
  zones: ReadonlyArray<{ id: string; name: string; weekdays: number[] }>,
): { gun: string; rotalar: [{ id: string; name: string }, { id: string; name: string }] } {
  const bugun = new Date();
  for (let geri = 0; geri < 7; geri += 1) {
    const tarih = new Date(bugun.getTime() - geri * 24 * 60 * 60 * 1000);
    // `getDay()` pazar=0; bölgenin ölçeği pazartesi=1…pazar=7 (`delivery_zone.weekdays`).
    const gunNo = tarih.getDay() === 0 ? 7 : tarih.getDay();
    const kosanlar = zones.filter((zone) => zone.weekdays.includes(gunNo));
    if (kosanlar.length >= 2) {
      return { gun: tarih.toISOString().slice(0, 10), rotalar: [kosanlar[0]!, kosanlar[1]!] };
    }
  }
  throw new Error('seed: aynı gün koşan iki rota yok — kurye dönüşü sahnesi kurulamaz');
}

/**
 * Araç deposunun aracı (`warehouse.vehicle_id`); seferin `vehicleId`si bu olmak zorunda, çünkü kuryenin araç deposu seferin
 * aracından çözülür ve araç yazılmazsa araca alınan serbest ürün kurye dönüşü ekranında hiç görünmez.
 */
async function aracIdOf(db: Db, vanWarehouseId: string): Promise<string> {
  const { data, error } = await db.from('warehouse').select('vehicle_id').eq('id', vanWarehouseId).single();
  if (error) throw error;
  const vehicleId = (data as { vehicle_id: string | null } | null)?.vehicle_id ?? null;
  if (!vehicleId) throw new Error('seed: araç deposunun aracı yok — kurye dönüşü sahnesi kurulamaz');
  return vehicleId;
}

/** Mühürleme için parti — depoda fiili adedi olan ilk satır. */
async function partiSec(db: Db, warehouseId: string, variantId: string): Promise<string> {
  const partiler = await new StockService(db).listByVariant(warehouseId, variantId);
  const parti = partiler.find((row) => row.physicalQty > 0);
  if (!parti) throw new Error(`seed: mühürlenecek parti yok (varyant ${variantId})`);
  return parti.id;
}
