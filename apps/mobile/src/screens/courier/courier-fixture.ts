import type { CourierDayResponse, CourierStopContract, DayCloseDraftContract } from '@lezzet/types';

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

/** Kapıda nakit tahsilatlı, iki kalemli, bekleyen B2C durağı — testlerin "normal" satırı. */
export function courierStop(index: number, overrides: Partial<CourierStopContract> = {}): CourierStopContract {
  return {
    orderId: uuid(index),
    referenceNo: `LZA-26-000${index}`,
    customerName: `Müşteri ${index}`,
    channel: 'b2c',
    address: `Grand Rue ${index}`,
    phone: '+33600000001',
    whatsAppLink: 'https://wa.me/33600000001',
    payment: { dueAmountCents: 4200, expectedMethod: 'cash' },
    itemCount: 2,
    contentSummary: '2 × Fıstıklı Baklava, 1 × Mantı',
    // Kalem satırları KİMLİKLİ (21.10d): kısmi iade `orderItemId` ile gönderilir; fixture'ın
    // kimliği durak kimliğinden türetilir ki iki durağın kalemleri çakışmasın.
    items: [
      { orderItemId: uuid(500 + index), name: 'Fıstıklı Baklava', qty: 2 },
      { orderItemId: uuid(600 + index), name: 'Mantı', qty: 1 },
    ],
    outcome: 'pending',
    attempts: 0,
    ...overrides,
  };
}

export function courierDay(stops: CourierStopContract[], date = '2026-08-08'): CourierDayResponse {
  // Kasa hesabı GÜN başına (21.10d): null = ayar boş → ekran tahsilat kapısını kapalı gösterir;
  // tahsilat senaryosu kuran test kendi uuid'ini geçirir.
  return { date, stops, doorAccountId: null };
}

export function dayCloseDraft(overrides: Partial<DayCloseDraftContract> = {}): DayCloseDraftContract {
  return {
    date: '2026-08-08',
    closed: null,
    delivered: [],
    pending: [],
    returned: [],
    expected: { cashCents: 0, cardCents: 0, chequeCents: 0 },
    ...overrides,
  };
}

/** Kapanmış gün kaydı — salt-okunur ekranın kaynağı. */
export function closedDayRecord(
  overrides: Partial<NonNullable<DayCloseDraftContract['closed']>> = {},
): NonNullable<DayCloseDraftContract['closed']> {
  return {
    id: uuid(900),
    courierId: uuid(901),
    date: '2026-08-08',
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
