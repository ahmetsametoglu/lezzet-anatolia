import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  AddressService,
  DeliveryRunService,
  DeliveryZoneService,
  OrderService,
  ProductService,
  UserProfileService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData } from '@lezzet/database/testing';
import { ensureStopOrder } from './stop-order';

/**
 * **Durak sırasının veriye bağlanışı** (11.9) — motorun kendisi değil, motoru gerçek satırlara
 * bağlayan kapı.
 *
 * Motor `packages/domain-core/src/delivery/route-order.test.ts`te 25 testle sınanıyor ve orası saf:
 * nokta girer, sıra çıkar. Burada sınanan şey ARADAKİ HER ŞEY — noktanın hangi kaynaktan geldiği,
 * hangi inceliğin yazıldığı, sıranın ne zaman yeniden hesaplandığı ve elle konmuş bir sıranın
 * ezilip ezilmediği. İkisi ayrı sorular: motor kusursuz çalışıp yanlış noktalarla beslenirse
 * ortaya kusursuz hesaplanmış bir saçmalık çıkar ve hiçbir birim testi bunu göremez.
 *
 * ── EN DEĞERLİ İDDİA: U SENARYOSU GERÇEK SATIRLARLA ─────────────────────────
 * Kullanıcının tarif ettiği hâl: *"bir hatta gidersin, paralel yoldan dönersin; depona en
 * yakınlardan birini EN SON teslim edersin ve en mantıklı rota budur."* Bu bir kural olarak
 * yazılmadı — kapalı turun (dönüş bacağı dâhil) toplamını en aza indiren amaç fonksiyonundan
 * KENDİLİĞİNDEN çıkıyor. Aşağıdaki ilk test bunu veritabanından okunan siparişlerle ölçüyor.
 */
const db = serviceDb();
const orders = new OrderService(db);
const runs = new DeliveryRunService(db);

const stamp = Date.now();
const today = new Date().toISOString().slice(0, 10);

/** Turun çıpası — Strasbourg deposu. İki hat da bunun KUZEYİNDE. */
const DEPO = { lat: 48.578, lng: 7.742 };
/**
 * İki paralel hat; enlemler ortak, boylamlar 1,2 km ayrı. Hat üstündeki komşu duraklar ~2,2 km
 * uzakta — yani **karşı hattaki durak, kendi hattındaki komşudan yakın.** Açgözlü "en yakın komşu"
 * bu geometride hatlar arasında zikzak çizer; kapalı turu gören arama U kurar. Aynı geometri
 * motorun kendi testinde de kullanılıyor: iki katman aynı iddiayı iki ayrı yerden ölçüyor.
 */
const ENLEMLER = [48.6, 48.62, 48.64, 48.66] as const;
const BATI_BOYLAM = 7.745;
const DOGU_BOYLAM = 7.761;

let warehouseId: string;
let pointlessWarehouseId: string;
let zoneId: string;
let pointlessZoneId: string;
let customerId: string;
let courierId: string;
let addressId: string;
let productId: string;
let categoryId: string;
let variantId: string;
const createdProfiles: string[] = [];

/** Sefer başına damgalı referans — `reference_no` benzersiz. */
let runCounter = 0;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  // Depo noktası: rotanın çıpası. `createTestWarehouse` nokta yazmıyor (yazmamalı da — çoğu testin
  // konusu değil), o yüzden burada AYRICA konuyor.
  await new WarehouseService(db).update({ id: warehouseId, lat: DEPO.lat, lng: DEPO.lng });
  // Noktasız depo: `no_origin` reddinin negatif kanıtı. Gerçekten var olan ama çıpası olmayan bir
  // depo olmadan o dal hiç sınanamaz.
  pointlessWarehouseId = (await createTestWarehouse(db)).id;

  const category = await new CategoryService(db).create({ name: { tr: `Sıra testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Sıra testi ürünü ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  const customer = await profiles.insert({ name: 'Sıra Müşterisi', email: `sira-${stamp}@example.test` });
  const courier = await profiles.insert({ name: 'Sıra Kuryesi', email: `sira-kurye-${stamp}@example.test` });
  customerId = customer.id;
  courierId = courier.id;
  createdProfiles.push(customer.id, courier.id);

  /* Koordinatı OLAN adres kaydı — snapshot geri düşüşünün hedefi. Nokta hattın en kuzeyine
     konuyor ki testte "hangi kaynaktan geldi" ayırt edilebilsin. */
  addressId = (
    await new AddressService(db).insert({
      customerId,
      recipient: 'Adres Kaydı',
      phone: '+33600000000',
      line1: '1 rue du Test',
      postalCode: '67000',
      city: 'Strasbourg',
      lat: ENLEMLER[3],
      lng: BATI_BOYLAM,
      geoPrecision: 'housenumber',
      geoSource: 'ban',
      geoAt: new Date().toISOString(),
      geoCheckedAt: new Date().toISOString(),
    })
  ).id;

  zoneId = (
    await new DeliveryZoneService(db).insert({
      name: `Sıra testi rotası ${stamp}`,
      warehouseId,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    })
  ).id;
  pointlessZoneId = (
    await new DeliveryZoneService(db).insert({
      name: `Çıpasız rota ${stamp}`,
      warehouseId: pointlessWarehouseId,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    })
  ).id;
});

beforeEach(async () => {
  // SIRA: sipariş → sefer. `order.delivery_run_id` `set null`, yani ters sıra da yürürdü — ama
  // siparişi bırakıp seferi silmek, bir sonraki testin kümesine sahipsiz durak sızdırırdı.
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'delivery_run', (q) => q.in('delivery_zone_id', [zoneId, pointlessZoneId]));
});

afterAll(async () => {
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'delivery_run', (q) => q.in('delivery_zone_id', [zoneId, pointlessZoneId]));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId, pointlessWarehouseId],
  });
});

/**
 * Sefer satırı — `DeliveryRunService` bilinçli olarak yazma yolu SUNMUYOR (`BaseDbService<…, never,
 * never>`: tek yazan el RPC'lerdir). Testin kurulumu o kuralın istisnası değil, kapsamı dışı:
 * sınanan şey seferin nasıl AÇILDIĞI değil, açılmış bir sefere sıranın nasıl yazıldığı.
 */
async function createRun(opts: { zone?: string; warehouse?: string; date?: string } = {}): Promise<string> {
  runCounter += 1;
  const { data, error } = await db
    .from('delivery_run')
    .insert({
      reference_no: `SF-T${String(stamp).slice(-6)}-${runCounter}`,
      delivery_zone_id: opts.zone ?? zoneId,
      delivery_date: opts.date ?? today,
      warehouse_id: opts.warehouse ?? warehouseId,
      courier_id: courierId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`fikstür: sefer açılamadı — ${error.message}`);
  return data.id as string;
}

interface StopOpts {
  point?: { lat: number; lng: number } | null;
  postalCode?: string;
  /** Snapshot'ta nokta YOKKEN adres kaydından çözülmesi gereken hâl. */
  withAddress?: boolean;
}

/** Sefere bağlı tek kalemlik durak. Snapshot ne taşıyorsa motor onu görür. */
async function addStop(runId: string, opts: StopOpts = {}): Promise<string> {
  const point = opts.point ?? null;
  const { order } = await orders.create(
    {
      warehouseId,
      customerId,
      channel: 'b2c',
      deliveryType: 'route',
      deliveryZoneId: zoneId,
      deliveryDate: today,
      deliveryRunId: runId,
      courierId,
      addressId: opts.withAddress ? addressId : null,
      addressSnapshot: {
        line1: '2 rue du Test',
        city: 'Strasbourg',
        postalCode: opts.postalCode ?? '67000',
        ...(point ? { lat: point.lat, lng: point.lng } : {}),
      },
      paymentMethod: 'cash',
      orderedTotalCents: 1000,
    },
    [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  return order.id;
}

/** İki paralel hattın sekiz durağı — dizinin sırası BİLEREK karışık (girdi sırası sızmasın). */
async function addParallelLines(runId: string): Promise<{ bati: string[]; dogu: string[] }> {
  const bati: string[] = [];
  const dogu: string[] = [];
  for (const lat of ENLEMLER) {
    dogu.push(await addStop(runId, { point: { lat, lng: DOGU_BOYLAM } }));
    bati.push(await addStop(runId, { point: { lat, lng: BATI_BOYLAM } }));
  }
  return { bati, dogu };
}

const stopOrderOf = async (runId: string) => (await runs.getById(runId))!;

describe('durak sırası · U senaryosu gerçek satırlarla', () => {
  it('kapalı tur bir hattı bitirip ötekinden döner; depoya en yakın iki durak turun İKİ UCUNDADIR', async () => {
    const runId = await createRun();
    const { bati, dogu } = await addParallelLines(runId);

    const outcome = await ensureStopOrder(db, { runId });

    expect(outcome).toMatchObject({ status: 'written', stops: 8, unplaced: 0, precision: 'address' });

    const run = await stopOrderOf(runId);
    expect(run.stopOrder).toHaveLength(8);

    /* HAT DEĞİŞİMİ TAM BİR KEZ: git-dön (U) demek budur. Zikzak çizen bir sıra 7 kez değişirdi ve
       ölçüsü de bu — "rota mantıklı görünüyor" bir iddia değil, hat değişim sayısı bir iddiadır. */
    const hatOf = (id: string) => (bati.includes(id) ? 'bati' : 'dogu');
    const degisim = run.stopOrder.filter((id, i) => i > 0 && hatOf(id) !== hatOf(run.stopOrder[i - 1]!)).length;
    expect(degisim).toBe(1);

    /* VE KULLANICININ CÜMLESİ: depoya en yakın duraklardan biri EN SON teslim ediliyor. İki hattın
       en güney durakları (ilk enlem) turun iki ucunda durur — biri ilk, biri son. Ortada
       bulunurlarsa tur kendini kesiyor demektir. */
    const enGuney = [bati[0]!, dogu[0]!];
    expect(enGuney).toContain(run.stopOrder[0]);
    expect(enGuney).toContain(run.stopOrder[7]);
  });

  it('girdi sırası sonucu DEĞİŞTİRMEZ — `createdAt` gizli bir eşitlik bozucu olarak sızmaz', async () => {
    /*
      Duraklar veritabanından `createdAt` sırasında geliyor. Motor o sıraya duyarlı olsaydı aynı
      coğrafya, siparişlerin verilme sırasına göre farklı turlar üretirdi — ve hiçbir ekran bunu
      fark etmezdi. İki seferi ters sırada kurup aynı ŞEKLİ bekliyoruz.
    */
    const ilk = await createRun();
    const { bati: b1 } = await addParallelLines(ilk);
    await ensureStopOrder(db, { runId: ilk });
    const ilkSira = (await stopOrderOf(ilk)).stopOrder.map((id) => (b1.includes(id) ? 'bati' : 'dogu'));

    await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
    await mustDelete(db, 'delivery_run', (q) => q.eq('delivery_zone_id', zoneId));

    const ikinci = await createRun();
    const bati2: string[] = [];
    // TERS kurulum: önce batı hattı, hem de kuzeyden güneye.
    for (const lat of [...ENLEMLER].reverse()) bati2.push(await addStop(ikinci, { point: { lat, lng: BATI_BOYLAM } }));
    for (const lat of [...ENLEMLER].reverse()) await addStop(ikinci, { point: { lat, lng: DOGU_BOYLAM } });
    await ensureStopOrder(db, { runId: ikinci });
    const ikinciSira = (await stopOrderOf(ikinci)).stopOrder.map((id) => (bati2.includes(id) ? 'bati' : 'dogu'));

    // Hangi hattan başlandığı yön kuralının işi; ÖNEMLİ OLAN turun şekli — bir hat bitmeden
    // ötekine geçilmiyor. İki koşuda da tek değişim.
    const degisimSayisi = (dizi: string[]) => dizi.filter((h, i) => i > 0 && h !== dizi[i - 1]).length;
    expect(degisimSayisi(ilkSira)).toBe(1);
    expect(degisimSayisi(ikinciSira)).toBe(1);
  });
});

describe('durak sırası · noktanın kaynağı ve inceliği', () => {
  it('snapshot noktası VARSA incelik `address` yazılır ve ölçü künyeye geçer', async () => {
    const runId = await createRun();
    await addStop(runId, { point: { lat: ENLEMLER[0], lng: BATI_BOYLAM } });
    await addStop(runId, { point: { lat: ENLEMLER[2], lng: DOGU_BOYLAM } });

    await ensureStopOrder(db, { runId, actorId: courierId });

    const run = await stopOrderOf(runId);
    expect(run.stopOrderPrecision).toBe('address');
    // Ölçü VERİYE yazılıyor, yalnız log'a değil: ekrandaki sıraya bakan var, log'a bakan yok.
    expect(run.stopOrderMetric).toBe('haversine');
    expect(run.stopOrderSource).toBe('engine');
    expect(run.stopOrderGeneratedAt).not.toBeNull();
    expect(run.stopOrderBy).toBe(courierId);
  });

  it('snapshot noktasızsa ADRES KAYDINDAN düşülür — eski siparişler posta koduna düşmez', async () => {
    /*
      Koordinat alanı sonradan doğdu: ondan önceki siparişlerin snapshot'ında nokta YOK. Adres kaydı
      hâlâ duruyorsa oradan okumak, o durağı posta kodu merkezine düşürmekten iyidir — ve fark
      ölçülebilir: incelik `address` kalır, `mixed`e düşmez.
    */
    const runId = await createRun();
    await addStop(runId, { point: { lat: ENLEMLER[0], lng: BATI_BOYLAM } });
    await addStop(runId, { withAddress: true });

    const outcome = await ensureStopOrder(db, { runId });

    expect(outcome).toMatchObject({ status: 'written', stops: 2, unplaced: 0, precision: 'address' });
  });

  it('bir durak noktalı bir durak posta koduna düşüyorsa incelik `mixed` — karışım GİZLENMEZ', async () => {
    const runId = await createRun();
    await addStop(runId, { point: { lat: ENLEMLER[0], lng: BATI_BOYLAM } });
    await addStop(runId, { postalCode: '68100' });

    const outcome = await ensureStopOrder(db, { runId });

    // `mixed` kullanıcının "çözünürlük karışık" cevabının doğrudan karşılığı: aynı seferde bir kısım
    // durak kapı düzeyinde, bir kısmı posta kodu düzeyinde. Ekran bunu söylemek zorunda.
    expect(outcome).toMatchObject({ status: 'written', precision: 'mixed' });
    expect((await stopOrderOf(runId)).stopOrderPrecision).toBe('mixed');
  });

  it('noktası HİÇ çözülemeyen durak sıraya girmez ama DÜŞMEZ — `unplaced` sayılır', async () => {
    const runId = await createRun();
    const noktali = await addStop(runId, { point: { lat: ENLEMLER[0], lng: BATI_BOYLAM } });
    const noktali2 = await addStop(runId, { point: { lat: ENLEMLER[3], lng: DOGU_BOYLAM } });
    // Merkezi olmayan bir kod: ne snapshot noktası ne posta kodu merkezi var.
    const kayip = await addStop(runId, { postalCode: '00000' });

    const outcome = await ensureStopOrder(db, { runId });

    expect(outcome).toMatchObject({ status: 'written', stops: 2, unplaced: 1 });
    const run = await stopOrderOf(runId);
    expect(run.stopOrder).toEqual(expect.arrayContaining([noktali, noktali2]));
    // Sırasız durak dizide YOK — ve tam da bu yüzden ekranda `stopSeq: null` görünür. Diziye
    // uydurma bir yerde eklenseydi, ölçülmemiş bir sıra ölçülmüş gibi okunurdu.
    expect(run.stopOrder).not.toContain(kayip);
  });

  it('bütün duraklar AYNI noktaya düşüyorsa sıra uydurulmaz — `indistinguishable`', async () => {
    /*
      Ölçüldü 31.08: GeoNames dökümünde Strasbourg'un üç posta kodu da aynı merkezi taşıyor. Böyle
      bir günde motor keyfî bir sıra üretseydi, ekran onu hesaplanmış bir rota diye gösterirdi.
      Doğru cevap "sıralayamadım" demek ve durakları sırasız bırakmaktır.
    */
    const runId = await createRun();
    await addStop(runId, { postalCode: '67000' });
    await addStop(runId, { postalCode: '67000' });

    const outcome = await ensureStopOrder(db, { runId });

    expect(outcome).toEqual({ status: 'unavailable', reason: 'indistinguishable' });
    expect((await stopOrderOf(runId)).stopOrder).toEqual([]);
  });

  it('deponun noktası yoksa hesap REDDEDİLİR — varsayılan bir merkez uydurulmaz', async () => {
    const runId = await createRun({ zone: pointlessZoneId, warehouse: pointlessWarehouseId });
    await addStop(runId, { point: { lat: ENLEMLER[0], lng: BATI_BOYLAM } });
    await addStop(runId, { point: { lat: ENLEMLER[3], lng: DOGU_BOYLAM } });

    const outcome = await ensureStopOrder(db, { runId });

    // Kapalı turun anlamı çıpasıyla birlikte var: depo bilinmezse "dönüş bacağı" diye bir şey yok
    // ve sıra artık U kurmayı bilmez. Uydurma bir merkez, sessizce yanlış bir tur üretirdi.
    expect(outcome).toEqual({ status: 'unavailable', reason: 'no_origin' });
  });
});

describe('durak sırası · ne zaman yeniden hesaplanır', () => {
  it('küme değişmediyse yeniden hesaplanmaz — `fresh`', async () => {
    const runId = await createRun();
    await addParallelLines(runId);
    await ensureStopOrder(db, { runId });

    const ikinci = await ensureStopOrder(db, { runId });

    // Bayatlık ölçütü ZAMAN değil KÜME: gün ekranı her tazelemede bu kapıdan geçiyor ve aynı
    // durakları gördüğü sürece hiçbir hesap yapmıyor.
    expect(ikinci).toEqual({ status: 'fresh' });
  });

  it('gün ortasında yeni durak eklenirse küme bayatlar; bekleme süresi dolmadan hesap DÖVÜLMEZ', async () => {
    const runId = await createRun();
    await addParallelLines(runId);
    await ensureStopOrder(db, { runId });

    await addStop(runId, { point: { lat: 48.61, lng: BATI_BOYLAM } });
    const hemen = await ensureStopOrder(db, { runId });

    // Küme artık farklı (yani `fresh` DEĞİL) ama damga taze: düşmüş bir sağlayıcı her ekran
    // tazelemesinde yeniden denenmesin diye bekleme süresi devrede.
    expect(hemen).toEqual({ status: 'skipped', reason: 'cooling_down' });
  });

  it('`force` bekleme süresini de aşar ve yeni durak sıraya girer', async () => {
    const runId = await createRun();
    await addParallelLines(runId);
    await ensureStopOrder(db, { runId });

    const yeni = await addStop(runId, { point: { lat: 48.61, lng: BATI_BOYLAM } });
    const zorlanan = await ensureStopOrder(db, { runId, force: true });

    expect(zorlanan).toMatchObject({ status: 'written', stops: 9 });
    expect((await stopOrderOf(runId)).stopOrder).toContain(yeni);
  });
});

describe('durak sırası · elle konmuş sıra ve kapanmış sefer', () => {
  it('elle dizilmiş sırayı motor EZMEZ; `force` ile ezilir ve kaynak `engine`e döner', async () => {
    const runId = await createRun();
    const { bati, dogu } = await addParallelLines(runId);
    // Elle sıra düzeltme YÜZEYİ bugün yok (kullanıcı kararı: önce motor izlenir) — ama kilit
    // veride duruyor ve kilidin çalıştığı ancak buradan ölçülebilir.
    const elle = [...dogu, ...bati];
    const yazildi = await runs.saveStopOrder({
      runId,
      orderIds: elle,
      source: 'manual',
      metric: 'haversine',
      precision: 'address',
      actorId: courierId,
    });
    expect(yazildi.ok).toBe(true);

    expect(await ensureStopOrder(db, { runId })).toEqual({ status: 'kept_manual' });
    expect((await stopOrderOf(runId)).stopOrder).toEqual(elle);

    expect(await ensureStopOrder(db, { runId, force: true })).toMatchObject({ status: 'written' });
    const sonra = await stopOrderOf(runId);
    expect(sonra.stopOrderSource).toBe('engine');
    expect(sonra.stopOrder).not.toEqual(elle);
  });

  it('kapanmış seferin sırası DONAR — geçmişe dönük değişmez', async () => {
    const runId = await createRun();
    await addParallelLines(runId);
    const damga = new Date().toISOString();
    await db.from('delivery_run').update({ departed_at: damga, returned_at: damga }).eq('id', runId);

    const outcome = await ensureStopOrder(db, { runId });

    // "O gün hangi sırayla gidildi" bir tarih sorusudur; sonradan yeniden hesaplanan bir sıra o
    // soruyu cevaplayamaz hâle getirirdi (kapanış fotoğrafının gerekçesiyle aynı).
    expect(outcome).toEqual({ status: 'unavailable', reason: 'write_failed' });
    expect((await stopOrderOf(runId)).stopOrder).toEqual([]);
  });
});

describe('durak sırası · son savunma hattı veridedir', () => {
  it('geçersiz ÖLÇÜ adı veritabanınca reddedilir — TypeScript enum tek kapı değil', async () => {
    /*
      `StopOrderMetric` derleme anında koruyor, ama RPC'ye yazan tek el uygulama değil: bir betik,
      bir migration, elle atılan bir sorgu aynı fonksiyonu çağırabilir. Kural veride durmasaydı
      `stop_order_metric = 'kus-ucusu-galiba'` yazan bir satır sessizce kabul edilir ve ekran onu
      okuyamadığı için ölçüyü HİÇ göstermezdi.
    */
    const runId = await createRun();
    const orderId = await addStop(runId, { point: { lat: ENLEMLER[0], lng: BATI_BOYLAM } });

    const { error } = await db.rpc('set_run_stop_order', {
      p_run_id: runId,
      p_order_ids: [orderId],
      p_source: 'engine',
      p_metric: 'tahmin',
      p_precision: 'address',
      p_actor_id: null,
      p_force: false,
    });

    expect(error?.message ?? '').toMatch(/stop_order_metric/);
    expect((await stopOrderOf(runId)).stopOrder).toEqual([]);
  });
});

describe('durak sırası · hiçbir hâlde fırlatmaz', () => {
  it('olmayan sefer adlı bir atlamadır, istisna değil', async () => {
    const outcome = await ensureStopOrder(db, { runId: '00000000-0000-4000-8000-0000000009ff' });
    expect(outcome).toEqual({ status: 'skipped', reason: 'run_not_found' });
  });

  it('durağı olmayan seferde hesap yapılmaz', async () => {
    const runId = await createRun();
    expect(await ensureStopOrder(db, { runId })).toEqual({ status: 'skipped', reason: 'no_stops' });
  });
});
