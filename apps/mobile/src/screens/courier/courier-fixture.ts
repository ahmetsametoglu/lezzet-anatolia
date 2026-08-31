import type {
  CourierDayResponse,
  CourierRoute,
  CourierRunBrief,
  CourierStopContract,
  DayCloseDraftContract,
} from '@lezzet/types';

/*
  KURYE TEST VERİSİ — üç ekran testinin ortak satırları.

  TEK YERDE durmasının sebebi sözleşmenin kendisi (katalog fixture'ının aynı gerekçesi): `CourierStop`
  bir alan kazandığında üç test birden derlemede kırılsın ve üçü de güncellensin — ayrı ayrı yazılmış
  yer tutucuların biri mutlaka eskir.

  Satırlar v2'nin demo rotasından türetildi (v2:833-839): kapıda nakit tahsilatlı B2B durağı, borcu
  olmayan B2C durağı, adres kayıtlı olmayan durak, ulaşılamamış durak. Kimlikler UUID biçiminde çünkü
  şema öyle istiyor (`orderId`).
*/

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * **Kapı kasası hesabı** — tahsilat senaryosu kuran testin gün cevabına koyduğu kimlik.
 * Fixture'ın varsayılanı `null` (ayar boş) çünkü kapının kapalı hâli de ölçülüyor.
 * Sayı kalem kimliklerinin (`stopItemId`) uzayının dışında seçildi: çakışan iki kimlik, testi
 * yanlış satırı işaretlerken YEŞİL gösterirdi.
 */
export const DOOR_ACCOUNT_ID = uuid(7000);

/**
 * Durak kaleminin kimliği — testler işaretleyecekleri satırı bu kimlikle bulur (satır anahtarı artık
 * sıra numarası değil, `orderItemId`). İki durağın kalemleri çakışmasın diye durak sırasından türer.
 */
export function stopItemId(stopIndex: number, lineIndex: number): string {
  return uuid((lineIndex + 5) * 100 + stopIndex);
}

/** Kapıda nakit tahsilatlı, iki kalemli, bekleyen B2C durağı — testlerin "normal" satırı. */
export function courierStop(index: number, overrides: Partial<CourierStopContract> = {}): CourierStopContract {
  /*
    TESLİM EDİLMİŞ DURAK TAM TESLİMDİR (30.08). `fulfilledQty` varsayılanı 0 ve bekleyen durakta bu
    doğru — mal kapıya gitmedi. Ama `{ outcome: 'delivered' }` override'ı kalemlere DOKUNMUYORDU ve
    ortaya üretimde doğamayacak bir satır çıkıyordu: teslim edilmiş, ama hiçbir adedi bırakılmamış
    durak. Ekran onu haklı olarak KISMİ okuyordu (kısmi ölçütü tam olarak `fulfilledQty < qty`) ve
    "teslim edildi" bekleyen testler kırmızıya döndü — fikstür yanlış bir gerçeklik kuruyordu.

    Kısmi teslimi ölçen test kalemleri KENDİ veriyor (`items` override'ı); burada kurulan yalnız
    varsayılanın tutarlılığı.
  */
  const delivered = overrides.outcome === 'delivered';
  return {
    orderId: uuid(index),
    referenceNo: `LZA-26-000${index}`,
    customerName: `Müşteri ${index}`,
    /* Varsayılan `null` = alıcı hesabın sahibiyle aynı; ekran o hâlde müşteri adını yazar
       (yaygın hâl). Alıcının AYRI olduğu hâli sınayan test bunu `overrides` ile verir. */
    recipient: null,
    channel: 'b2c',
    address: `Grand Rue ${index}`,
    phone: '+33600000001',
    whatsAppLink: 'https://wa.me/33600000001',
    /* `collectedAtDoorCents` varsayılanı `null`: bekleyen durakta kapıda para HENÜZ alınmadı.
       Sonuçlanmış durağı kuran test onu `overrides` ile verir — bekleyen bir durağa tahsil edilmiş
       para yazmak, üretimde doğamayacak bir hâl olurdu. */
    payment: { dueAmountCents: 4200, expectedMethod: 'cash', collectedAtDoorCents: null },
    itemCount: 2,
    contentSummary: '2 × Fıstıklı Baklava, 1 × Mantı',
    // Kalem satırları KİMLİKLİ (21.10d): kısmi iade `orderItemId` ile gönderilir; fixture'ın
    // kimliği durak kimliğinden türetilir ki iki durağın kalemleri çakışmasın.
    // `fulfilledQty` bekleyen durakta 0 — mal daha kapıya gitmedi (kolonun kendi varsayılanı).
    items: [
      /* Fiyatlar durağın borcuyla (4200) TUTARLI: 2×1400 + 1×1400 = 4200. Kısmi iade testinin
         beklediği düşüş bu sayılardan doğuyor — uydurma bir fiyat, ekranın hesabını ölçülemez
         yapardı. */
      {
        orderItemId: stopItemId(index, 0),
        name: 'Fıstıklı Baklava',
        qty: 2,
        fulfilledQty: delivered ? 2 : 0,
        unitPriceCents: 1400,
        lineDiscountAmountCents: 0,
      },
      {
        orderItemId: stopItemId(index, 1),
        name: 'Mantı',
        qty: 1,
        fulfilledQty: delivered ? 1 : 0,
        unitPriceCents: 1400,
        lineDiscountAmountCents: 0,
      },
    ],
    outcome: 'pending',
    /* Sonuçlanmamış durağın sonuçlanma anı, sebebi ve kanıtı da yoktur — üçü birlikte `pending`
       hâlin tanımı. Sonuçlanmış durağı kuran test üçünü `outcome` ile birlikte verir. */
    settledAt: null,
    outcomeNote: null,
    hasProof: false,
    attempts: 0,
    // 23.8: durak kutuları da taşıyor — varsayılan "kutusuz akış" (eski yol).
    boxes: [],
    /* Varsayılan `null` = SIRA BİLİNMİYOR (11.9). Bilerek sırasız: bugüne dek ekran dizi indeksini
       rota sırasıymış gibi gösteriyordu ve o sıra siparişin verilme sırasıydı. Sıralı günü sınayan
       test `stopSeq`i kendi verir. */
    stopSeq: null,
    ...overrides,
  };
}

/**
 * **Açık sefer künyesi** (18.08) — "kurye rotayı almış, yolda" hâli. Fixture'ın VARSAYILAN hâli bu
 * çünkü kurye ekranlarının çoğu o hâli konuşuyor: sefer yoksa durak da yoktur (siparişin kuryesi
 * seferin kuryesinden gelir), yani sefersiz bir gün cevabında liste zaten boş olurdu.
 * Rota seçimi ölçen test `courierDay([], { run: null })` geçirir.
 */
export function courierRunBrief(overrides: Partial<CourierRunBrief> = {}): CourierRunBrief {
  return {
    runId: uuid(800),
    referenceNo: 'SF-26-ABCDEF',
    zoneId: uuid(801),
    zoneName: 'Kuzey rotası',
    // Varsayılan ARAÇSIZ sefer: araç kaydı zorunlu değil ve testlerin çoğu aracı konuşmuyor.
    // Adı ölçen test `courierRunBrief({ vehicleId, vehicleLabel })` ile ikisini birlikte verir —
    // kimliksiz bir ad ya da adsız bir kimlik, üretimde doğamayacak bir hâl olurdu.
    vehicleId: null,
    vehicleLabel: null,
    departedAt: '2026-08-08T07:30:00.000Z',
    returnedAt: null,
    closed: false,
    ...overrides,
  };
}

/**
 * Seçim listesindeki rota. `run` doluysa rota o gün BAŞLATILMIŞTIR ve ikinci kez açılamaz (K3) —
 * ekran onu pasif gösterip kimin sürdüğünü yazar.
 */
export function courierRoute(overrides: Partial<CourierRoute> = {}): CourierRoute {
  return {
    zoneId: uuid(801),
    zoneName: 'Kuzey rotası',
    warehouseId: uuid(810),
    warehouseName: 'Strasbourg deposu',
    stopCount: 3,
    run: null,
    ...overrides,
  };
}

/** Başkasının sürdüğü rotanın künyesi — kartın "bugün X sürüyor" satırının kaynağı. */
export function takenRouteRun(overrides: Partial<CourierRoute['run']> = {}): NonNullable<CourierRoute['run']> {
  return {
    ...courierRunBrief(),
    courierId: uuid(820),
    courierName: 'Musa Kaya',
    vehicleLabel: null,
    ...overrides,
  };
}

/**
 * Günün cevabı. Kasa hesabı GÜN başına (21.10d) ve varsayılanı `null` — ayar boşken ekran tahsilat
 * kapısını kapalı gösteriyor ve o hâl de ölçülüyor; tahsilat senaryosu kuran test
 * `{ doorAccountId: DOOR_ACCOUNT_ID }` geçirir.
 */
/**
 * **Günün seferi** = künye + ÇIKIŞ DEPOSUNUN adı (30.08 · uyuşmazlık #12).
 *
 * Depo adı yalnız gün yanıtında var: rota seçim listesinde o değer rota düzeyinde duruyor ve
 * seferi olmayan rotada da bulunması gerekiyor. Ayrı fikstür, ayrı tip — künyeyi bekleyen bir
 * yere gün seferini geçirmek derlemede durur.
 */
export function courierDayRun(overrides: Partial<NonNullable<CourierDayResponse['run']>> = {}): NonNullable<CourierDayResponse['run']> {
  return { ...courierRunBrief(), warehouseName: 'Strasbourg Merkez', ...overrides };
}

export function courierDay(
  stops: CourierStopContract[],
  overrides: Partial<Omit<CourierDayResponse, 'stops'>> = {},
): CourierDayResponse {
  return { date: '2026-08-08', run: courierDayRun(), doorAccountId: null, stops, ...overrides };
}

export function dayCloseDraft(overrides: Partial<DayCloseDraftContract> = {}): DayCloseDraftContract {
  return {
    date: '2026-08-08',
    run: courierRunBrief(),
    closed: null,
    delivered: [],
    pending: [],
    returned: [],
    expected: { cashCents: 0, cardCents: 0, chequeCents: 0 },
    ...overrides,
  };
}

/** Kapanmış SEFER kaydı — salt-okunur ekranın kaynağı (18.08: anahtar kurye×gün değil sefer). */
export function closedDayRecord(
  overrides: Partial<NonNullable<DayCloseDraftContract['closed']>> = {},
): NonNullable<DayCloseDraftContract['closed']> {
  return {
    id: uuid(900),
    deliveryRunId: uuid(800),
    expectedCashCents: 4200,
    expectedCardCents: 0,
    expectedChequeCents: 0,
    countedCashCents: 4000,
    countedCardCents: 0,
    countedChequeCents: 0,
    deliveredOrders: [uuid(1)],
    returnedOrders: [],
    pendingOrders: [],
    note: 'Krutenau kolisi araçta kaldı',
    closedBy: uuid(901),
    closedAt: '2026-08-08T18:00:00.000Z',
    reconciled: false,
    ...overrides,
  };
}
