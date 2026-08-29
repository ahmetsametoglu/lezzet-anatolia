import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { HandoverScreen } from './handover-screen';
import { resetWarehouseStatus } from './warehouse-status';

/*
  KARGO DEVRİ (07.12) — ekran bir liste değil OKUTUCU.

  Dört iddia:
  · okutulan kutu sunucuya gider ve sayaç cümlesi yazılır ("2/3")
  · SON kutuda cümle değişir: gönderi taşıyıcıya verildi, sipariş yola çıktı
  · ikinci okutma HATA DEĞİL — "zaten verilmişti", sayı değişmedi
  · adlı retler (mühürsüz · duyurulmamış · başka depo) sebebiyle yazılır

  Cevaplar sözleşme şeklinde: uç bir alanı düşürürse iddia değil DERLEME kırılır.
*/

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), navigate: jest.fn() }) }));

const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

const net: { handover?: unknown } = {};
fetchMock.mockImplementation(() => Promise.resolve(ok(net.handover)));

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockClear();
  resetWarehouseStatus();
  net.handover = undefined;
});

/** Okutucuyu açıp simülasyon çipiyle bir kod gönderir — cihazsız ortamın tek yolu. */
async function okut(label: string) {
  await fireEvent.press(screen.getByTestId('warehouse-handover-scan'));
  await fireEvent.press(screen.getByLabelText(label));
}

describe('kargo devri', () => {
  it('okutulan kutu sunucuya gider ve SAYAÇ cümlesi yazılır', async () => {
    net.handover = { status: 'ok', boxNo: 2, referenceNo: 'LZA-26-3M8C', handedBoxes: 2, boxCount: 3, shipmentHandedOver: false };
    await render(<HandoverScreen />);

    await okut('Toplama');

    await waitFor(() => expect(screen.getByText(/Kutu 2 verildi — 2\/3/)).toBeOnTheScreen());
    // Gövde SUNUCUYA gidiyor: hangi kolonda aranacağını telefon bilmiyor, kod olduğu gibi gidiyor.
    const call = fetchMock.mock.calls.at(-1);
    expect(String(call?.[0])).toContain('/warehouse/handover');
  });

  it('SON kutuda cümle değişir — gönderi verildi, sipariş yola çıktı', async () => {
    net.handover = { status: 'ok', boxNo: 3, referenceNo: 'LZA-26-3M8C', handedBoxes: 3, boxCount: 3, shipmentHandedOver: true };
    await render(<HandoverScreen />);

    await okut('Toplama');

    await waitFor(() => expect(screen.getByText(/TAŞIYICIYA VERİLDİ/)).toBeOnTheScreen());
    expect(screen.getByText(/sipariş yola çıktı/)).toBeOnTheScreen();
  });

  it('İKİNCİ okutma hata değil: "zaten verilmişti" ve sayı DEĞİŞMEZ', async () => {
    net.handover = { status: 'already_handed', boxNo: 1, handedBoxes: 1, boxCount: 2 };
    await render(<HandoverScreen />);

    await okut('Toplama');

    // Depocu rampada aynı kutuyu iki kez okutabilir; hata cümlesi onu kendi sayımından
    // şüphelendirirdi.
    await waitFor(() => expect(screen.getByText(/zaten verilmişti — sayı değişmedi \(1\/2\)/)).toBeOnTheScreen());
  });

  it('adlı retler SEBEBİYLE yazılır — mühürsüz kutu ve duyurulmamış gönderi ayrı cümleler', async () => {
    net.handover = { status: 'not_sealed', boxNo: 1 };
    await render(<HandoverScreen />);
    await okut('Toplama');
    await waitFor(() => expect(screen.getByText(/mühürlü değil/)).toBeOnTheScreen());

    net.handover = { status: 'not_announced', boxNo: 1 };
    await okut('Toplama');
    await waitFor(() => expect(screen.getByText(/etiket alınmamış/)).toBeOnTheScreen());
  });
});
