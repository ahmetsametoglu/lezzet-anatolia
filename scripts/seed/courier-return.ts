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
  ── KURYE DÖNÜŞÜ SAHNESİ (kullanıcı kararı 04.09) ───────────────────────────────────────────────

  **Neden var:** D6 (kurye dönüşü) ve K (araçtaki seferler) ekranlarının hiçbir hâli beslemede
  doğmuyordu — `delivery_run` tablosu boştu, dönen sipariş yoktu, araçta serbest ürün yoktu. O
  ekranları denemek için her `db:refresh`ten sonra elle sipariş verip toplama, yükleme, sürme ve
  kapama adımlarının tamamını geçmek gerekiyordu. Kullanıcının cümlesi: *"her seferinde şu an akışı
  koşmak zor biraz… gerekirse besleme dosyalarını düzenleyelim."*

  **Satırlar ELLE YAZILMIYOR, GERÇEK KAPILARDAN geçiyor** (`test-orders.ts`in aynı kuralı): sefer
  `startCourierDay` ile açılıyor, kutu `openBox`/`sealBox` ile kapanıyor, araca `loadBox` ile
  biniyor, kapı `confirmDoorDelivery`/`markUndelivered` ile sonuçlanıyor, sefer `closeCourierDay`
  ile kapanıyor. Elle yazılmış bir satır kuralların hiçbirinden geçmez ve ekranda üretimde asla
  oluşamayacak bir hâl gösterirdi.

  **`db:reset` GEREKTİRMEZ:** blok kendi guard'ını `delivery_run` tablosuna bakarak koyuyor ve o
  tablo boş. Yani mevcut veritabanında `pnpm db:seed` tek başına koşar, sahneyi kurar, öteki
  bölümlere dokunmaz (hepsi kendi "tablo dolu mu" guard'ında atlanır).

  ── SAHNE: BİR KURYE, İKİ SEFER, DÖRT HÂL ───────────────────────────────────
  Kullanıcının soruları buydu — *"bir araç birden fazla rotayı yükleyip sefere çıkıp da geri
  döndüğünde bu kapanışlar rota rota mı yapılıyor?"* ve *"bazı ürünler müşteriden dönerken bazıları
  da arabaya ekstra koyulan ama satılmayan ürünler olabilir."* Sahne ikisini de gösteriyor:

    · SEFER A — sürüldü ve KAPANDI. Üç durak: biri teslim edildi, biri kapıda REDDEDİLDİ (mal
      döner → D6'nın akıbet bölümü), birine ULAŞILAMADI (kutu araçta kalır, kabul edilmez).
    · SEFER B — araçta BEKLİYOR, kutuları yüklü ama yola çıkmadı. D6'da "başka seferin yükü".
    · SERBEST ÜRÜN — araca iki varyant alındı, satılmadı. D6'nın "say ve devret" bölümü.

  **KURYESİZ DÖNÜŞ bu blokta YOK ve bilerek yok:** kuryesi olmayan bir dönüş kargo yolundan gelir
  ve o yol ~~beslemede kapalı (01.09 kararı)~~ **HİÇ YAZILMAMIŞ** (düzeltildi 05.09, ölçüldü):
  taşıyıcının iadesi gönderiye yazılıyor ama siparişi kıpırdatmıyor — bu testle çivili bilinçli bir
  karar — ve depoya dönen koliyi karşılayan bir kapı hiç yok. Yani sahne kurulamıyor çünkü besleme
  kapalı değil, üretim yolu yok. Uydurma bir yoldan `returned` yazmak, üretimde oluşamayacak bir
  hâl kurmak olurdu. Ekranın o kümesi kendi birim testinde sınanıyor
  (`courier-return-screen.test.tsx`). Açığın kendisi `design/BACKLOG.md §4`te.

  İki sefer de AYNI GÜN ve aynı araçta: kural veride (`assert_vehicle_single_courier`) ve sahne o
  kuralın içinde duruyor — para iki kez (sefer başına), mal bir kez (araç bir kez boşalır).

  ── KAPIDA PARA: 05.09'DA GİRDİ, ÇÜNKÜ ARTIK ÖLÇÜLÜ ──────────────────────────
  Bu blok 04.09'da bilerek parasızdı ve gerekçesi şuydu: *"uydurma bir kasa farkı, ölçülmemiş bir
  sayıyı gerçek gibi okuturdu."* İtiraz UYDURMA sayıyaydı, paranın kendisine değil — ve artık
  uydurma bir sayı yok: durak zaten NAKİT bir sipariş (`paymentMethod: 'cash'`) ve kapıda gerçekten
  tahsil edilecek bir tutarı var. Kurye o tutarı topluyor, kapanışta EKSİK teslim ediyor; fark
  hesaplanan bir sonuç, yazılan bir varsayım değil.

  Neden gerekti: PARA bölümünün TEK bildirim türü `run_close_mismatch` ve o da yalnız FARK varken
  doğuyor. Hiçbir sahnede fark olmadığı için bölüm her kurulumda boş açılıyordu — ekran doğru
  çalışıyor ama gösterecek olayı hiç olmuyordu (kullanıcı bulgusu 05.09: *"sadece yönetimle
  alakalı bildirimler var"*).

  Fark KURYENİN ELİNDE eksilen paradır, kasanın değil: teslim edilen tutar tam, kapanışta beyan
  edilen eksik. Gerçek hayatta bunun adı sayım farkıdır ve tam da bu yüzden bir zil çalar.
*/

/** Sahnenin kurye anahtarı — `people.ts`teki `kurye` satırı (Marc Lemoine, kapsamı {str, van}). */
const KURYE_EPOSTA = 'kurye@lezzetanatolia.fr';

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
    İKİ ROTA, AYNI GÜN — ve gün TAKVİMDEN çözülüyor, uydurulmuyor.

    Rota+gün başına TEK sefer kuralı (`delivery_run_key`) var, yani iki sefer iki AYRI rota
    olmalı; ikisi de aynı gün koşmalı ki araçta yan yana dursunlar. Beslemede bu koşulu Batı ve
    Doğu hatları taşıyor (ikisi de salı+cuma). Gün BUGÜNDEN GERİYE aranıyor: dönen mal rampada
    duruyor demek, seferin çoktan sürülmüş olması demek — ileri bir tarih "gelecekte dönmüş" bir
    sipariş üretirdi.
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

  /* Kapı tahsilatının gireceği hesap — para sahnesinin açtığı KASA. `maybeSingle` bilerek: hesap
     yoksa (para sahnesi koşmamışsa) tahsilat atlanır ve kapanış farksız kapanır; sahne yine kurulur,
     yalnız PARA zili doğmaz. Hesabı burada YARATMIYORUZ — para defterinin sahibi `money.ts`. */
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

  /* KAPANIŞ EKSİK BEYANLA: kurye 2,50 € eksik teslim ediyor. Fark hesaplanan bir sonuçtur
     (beklenen = kapıda yazılan tahsilat, sayılan = beyan) ve `notifyRunCloseMismatch` onu gerçek
     üreticiden çalıyor — PARA bölümünün tek türü ancak böyle doğar. Eksik tutar sahnenin sabiti;
     tahsilat sıfırsa (kasa hesabı yok) fark da sıfır kalır ve zil haklı olarak susar. */
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
 * İki rotanın ORTAK koşu günü — bugünden GERİYE doğru aranır.
 *
 * Geriye, çünkü dönen mal rampada duruyorsa sefer çoktan sürülmüştür; ileri bir tarih "gelecekte
 * dönmüş" bir sipariş üretirdi. Bulunamazsa sessiz geçilmez: iki rotanın hiç ortak günü yoksa
 * sahne kurulamaz ve bu bir VERİ hatasıdır, atlanacak bir hâl değil.
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
 * Araç deposunun ARACI (`warehouse.vehicle_id`, 21.249) — seferin `vehicleId`si bu olmak ZORUNDA.
 *
 * Kuryenin araç deposu artık kapsamdan değil SEFERİN ARACINDAN çözülüyor: sefere araç yazılmazsa
 * `vehicleWarehouseOf` `null` döner, araca alınan serbest ürün D6'da hiç görünmez ve sahne
 * sessizce yarım kalır — tam olarak sınanmak istenen bölüm çalışmaz.
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
