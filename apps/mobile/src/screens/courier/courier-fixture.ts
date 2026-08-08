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
      { orderItemId: stopItemId(index, 0), name: 'Fıstıklı Baklava', qty: 2 },
      { orderItemId: stopItemId(index, 1), name: 'Mantı', qty: 1 },
    ],
    outcome: 'pending',
    attempts: 0,
    ...overrides,
  };
}

/**
 * Günün cevabı. Kasa hesabı GÜN başına (21.10d) ve varsayılanı `null` — ayar boşken ekran tahsilat
 * kapısını kapalı gösteriyor ve o hâl de ölçülüyor; tahsilat senaryosu kuran test
 * `{ doorAccountId: DOOR_ACCOUNT_ID }` geçirir.
 */
export function courierDay(
  stops: CourierStopContract[],
  overrides: Partial<Omit<CourierDayResponse, 'stops'>> = {},
): CourierDayResponse {
  return { date: '2026-08-08', doorAccountId: null, stops, ...overrides };
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
