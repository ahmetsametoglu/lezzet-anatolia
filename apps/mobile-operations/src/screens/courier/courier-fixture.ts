import type {
  CourierDayResponse,
  CourierRoute,
  CourierRunBrief,
  CourierStopContract,
  DayCloseDraftContract,
  StartCourierDayResponse,
} from '@lezzet/types';

/*
  Kurye test verisi: üç ekran testinin ortak satırları, `CourierStop` bir alan kazandığında üç test birden derlemede kırılsın diye tek yerde.
  Satırlar demo rotasından türer: kapıda nakit tahsilatlı B2B durağı, borçsuz B2C durağı, adressiz durak, ulaşılamamış durak.
*/

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * Kapı kasası hesabı: tahsilat senaryosu kuran testin gün cevabına koyduğu kimlik; varsayılan `null`, çünkü kapının kapalı hâli de ölçülür.
 * Sayı kalem kimliklerinin uzayının dışında seçildi: çakışan iki kimlik testi yanlış satırda yeşil gösterirdi.
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
  /* Teslim edilmiş durak tam teslimdir: `outcome: 'delivered'` kalemlerin `fulfilledQty`sini de doldurur, yoksa ekran onu kısmi okur; kısmi teslimi ölçen test kalemleri kendi verir. */
  const delivered = overrides.outcome === 'delivered';
  return {
    orderId: uuid(index),
    referenceNo: `LZA-26-000${index}`,
    customerName: `Müşteri ${index}`,
    /* Varsayılan `null` = alıcı hesabın sahibiyle aynı; ekran o hâlde müşteri adını yazar
       (yaygın hâl). Alıcının AYRI olduğu hâli sınayan test bunu `overrides` ile verir. */
    recipient: null,
    channel: 'b2c',
    /* Varsayılan hazır: fikstürün durakları kutulu ve toplanmış; "hazırlanmadı" hâlini ölçen test bunu `overrides` ile verir. */
    awaitingPreparation: false,
    /* İptal edilmiş durak açıkça kurulur, çünkü iptal varsayılan satırın bir varyantı değil ayrı bir hâldir. */
    cancelled: false,
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
    /* Kutu zorunludur; varsayılan tek kutu araçtadır, çünkü fikstürün kurduğu hâl yoldaki duraktır. */
    boxes: [{ boxNo: 1, code: `KT-26-${String(index).padStart(4, '0')}`, loadedAt: '2026-08-08T07:10:00.000Z' }],
    /* Durağın seferi: liste sefere göre gruplanır; varsayılan fikstürün tek seferidir. */
    runId: uuid(800),
    runLabel: 'Kuzey rotası',
    /* Varsayılan `unknown`: uyarı üretmeyen değer varsayılan olmalı; uyarıyı sınayan test değeri kendi verir. */
    doorCheck: 'unknown',
    /* Varsayılan `null` = sıra bilinmiyor; sıralı günü sınayan test `stopSeq`i kendi verir. */
    stopSeq: null,
    ...overrides,
  };
}

/**
 * Açık sefer künyesi, fikstürün varsayılanı: kurye ekranlarının çoğu bu hâli konuşur ve sefer yoksa durak da yoktur.
 * Rota seçimini ölçen test `courierDay([], { run: null })` geçirir.
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
    /* Seferin günü, fikstürün günüdür. */
    deliveryDate: '2026-08-08',
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
    /* Rotanın günü; seçim ekranı listeyi güne göre gruplar. */
    day: '2026-08-08',
    zoneId: uuid(801),
    zoneName: 'Kuzey rotası',
    warehouseId: uuid(810),
    warehouseName: 'Strasbourg deposu',
    stopCount: 3,
    /* Seçim kartının üç sayısı (v3:17): durak · kutu · tahsilat. Kutu sayısı durak sayısından
       BÜYÜK — gerçek veride de öyle ve eşit yazılırsa "kutu" sütunu hiç sınanmamış olurdu. */
    boxCount: 5,
    /* Geri getirilecek kutu varsayılanı sıfırdır; o hâli sınayan test kendisi verir. */
    returningBoxCount: 0,
    collectionCount: 2,
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
 * Günün seferi: künye ve çıkış deposunun adı; ayrı fikstür, çünkü depo adı yalnız gün yanıtında vardır ve künyeyi bekleyen yere geçirilince derleme durur.
 */
export function courierDayRun(overrides: Partial<NonNullable<CourierDayResponse['run']>> = {}): NonNullable<CourierDayResponse['run']> {
  /* Sıranın künyesi varsayılan `null`: fikstür "sırasız gün" ekranını da besler; ölçü ve inceliği gösteren test onu kendi verir. */
  return { ...courierRunBrief(), warehouseName: 'Strasbourg Merkez', stopOrder: null, ...overrides };
}

export function courierDay(
  stops: CourierStopContract[],
  overrides: Partial<Omit<CourierDayResponse, 'stops'>> = {},
): CourierDayResponse {
  /* `runs` varsayılan olarak sürülen seferi taşır; kapanmış sefer araçta değildir, çünkü `readCourierRuns` onu süzer ve fikstür bunu taklit etmezse ekran yanlış gövdeyi çizer. */
  const run = overrides.run === undefined ? courierDayRun() : overrides.run;
  return {
    date: '2026-08-08',
    run,
    runs: run && !run.closed ? [run] : [],
    doorAccountId: null,
    stops,
    stranded: [],
    ...overrides,
  };
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

/** Kapanmış sefer kaydı: salt okunur ekranın kaynağı. */
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

/**
 * Başlatma cevabı: `POST /courier/day/start` ve `/runs/:id/depart` aynı şekli döndürür; üç çağıranı olduğu için fikstürde durur ki kopyalar eskimesin.
 */
export function startResult(
  overrides: Partial<Extract<StartCourierDayResponse, { status: 'ok' }>> = {},
): StartCourierDayResponse {
  return {
    status: 'ok',
    date: '2026-08-08',
    // Başlatma cevabının künyesi gün seferiyle aynı şekildedir; ekran bu değeri doğrudan günün seferi olarak yazar.
    run: courierDayRun(),
    started: [],
    alreadyOut: [],
    stale: [],
    skipped: [],
    // 23.8: kutulu sipariş okutulmayı bekliyor olabilir — varsayılan "kutusuz gün".
    awaitingBoxes: [],
    ...overrides,
  };
}
