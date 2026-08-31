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

/*
  SAHTE AĞ YOLA GÖRE AYIRIYOR — tek cevap dönmek artık yanlış olurdu.

  Ekran iki uç okuyor: okutma (`POST /handover`) ve rampada bekleyen kutu sayısı
  (`GET /handover/pending`). İkincisi ilkinin ÖNEKİNİ paylaşıyor (`/warehouse/handover…`), yani
  gevşek bir eşleşme sayaç cevabını okutmaya, okutma cevabını sayaca verirdi.
*/
const net: { handover?: unknown; pending?: unknown } = {};
fetchMock.mockImplementation((url) =>
  Promise.resolve(ok(String(url).includes('/handover/pending') ? net.pending : net.handover)),
);

/** O turda giden okutma çağrıları — sayaç tazelemesi karışmasın diye yol TAM eşleşiyor. */
function okutmaCagrilari() {
  return fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/warehouse/handover'));
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockClear();
  resetWarehouseStatus();
  net.handover = undefined;
  net.pending = { boxes: 3 };
});

/** Okutucuyu açıp simülasyon çipiyle bir kod gönderir — cihazsız ortamın tek yolu. */
async function okut(label: string) {
  await fireEvent.press(screen.getByTestId('warehouse-handover-scan'));
  /* Çekmece bir kare sonra çizilir: `visible` prop'u kütüphanenin `present()`ine çevriliyor ve o
       bir durum değişimi. Cihazda görünmez, testte `fireEvent`ler aynı karede koştuğu için görünür. */
  await waitFor(() => expect(screen.getByLabelText(label)).toBeOnTheScreen());
  await fireEvent.press(screen.getByLabelText(label));
}

describe('kargo devri', () => {
  /*
    EKRANIN KURALI DÜĞMENİN ALTINDA, HER ZAMAN (v3:1686). "Hangi siparişi vereceğini seçmiyorsun"
    bu ekranın tasarım kararıdır — ekran bir LİSTE değil bir OKUTUCUDUR. Eskiden bu cümle yalnız
    geçmiş boşken görünüyordu; ilk okutmadan sonra kaybolan bir kural, ikinci kutuda unutulur.

    Boş geçmiş de artık bir BLOK: "Bugün kutu verilmedi" + kaç kutu verildiğinin bu listeden
    okunduğu. Tek satırlık gri bir ipucu, listenin başlığı ile karışıyordu.
  */
  it('ekranın kuralı ve OKUTMA GEÇMİŞİ başlığı boşken de durur', async () => {
    await render(<HandoverScreen />);

    expect(screen.getByTestId('warehouse-handover-list')).toHaveTextContent(/Hangi siparişi vereceğini seçmiyorsun/);
    expect(screen.getByTestId('warehouse-handover-list')).toHaveTextContent(/OKUTMA GEÇMİŞİ/);
    expect(screen.getByTestId('warehouse-handover-empty')).toHaveTextContent(/Bugün kutu verilmedi/);
  });

  it('okutulan kutu sunucuya gider ve SAYAÇ cümlesi yazılır', async () => {
    net.handover = { status: 'ok', boxNo: 2, referenceNo: 'LZA-26-3M8C', handedBoxes: 2, boxCount: 3, shipmentHandedOver: false };
    await render(<HandoverScreen />);

    await okut('Toplama');

    await waitFor(() => expect(screen.getByText(/Kutu 2 verildi — 2\/3/)).toBeOnTheScreen());
    // Gövde SUNUCUYA gidiyor: hangi kolonda aranacağını telefon bilmiyor, kod olduğu gibi gidiyor.
    expect(okutmaCagrilari()).toHaveLength(1);
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

  /*
    RAMPADAKİ SAYI (§8.6) — okutmadan ÖNCE cevabı olan tek soru.

    Bugüne kadar "kaç kaldı" ancak ilk okutmadan sonra ve yalnız O gönderi için biliniyordu;
    rampada üç ayrı siparişin kutuları varken "bitti mi" sorusunun cevabı hiçbir yerde yoktu.
  */
  it('rampada bekleyen kutu sayısı okutmadan ÖNCE yazılır', async () => {
    net.pending = { boxes: 4 };
    await render(<HandoverScreen />);

    await waitFor(() => expect(screen.getByTestId('warehouse-handover-pending')).toHaveTextContent(/4 kutu taşıyıcıyı bekliyor/));
  });

  it('sayı her okutmadan sonra SUNUCUDAN tazelenir — yerelde eksiltilmiyor', async () => {
    net.pending = { boxes: 2 };
    net.handover = { status: 'ok', boxNo: 1, referenceNo: 'LZA-26-3M8C', handedBoxes: 1, boxCount: 2, shipmentHandedOver: false };
    await render(<HandoverScreen />);
    await waitFor(() => expect(screen.getByTestId('warehouse-handover-pending')).toHaveTextContent(/2 kutu/));

    // Sunucu artık BİR kutu diyor: aynı depodaki ikinci telefon da okutmuş olabilir ve yerel bir
    // eksiltme o gerçeği kaçırırdı.
    net.pending = { boxes: 1 };
    await okut('Toplama');

    await waitFor(() => expect(screen.getByTestId('warehouse-handover-pending')).toHaveTextContent(/1 kutu taşıyıcıyı bekliyor/));
  });

  it('sıfır ile OKUNAMADI ayrı cümleler — "rampa boş" yanlış bir izdir', async () => {
    net.pending = { boxes: 0 };
    await render(<HandoverScreen />);
    await waitFor(() => expect(screen.getByTestId('warehouse-handover-pending')).toHaveTextContent(/Rampa boş/));

    // Bozuk cevap: sayı OKUNAMADI. Sıfıra düşürmek depocuyu kutuların yanından uzaklaştırırdı.
    net.pending = { bozuk: true };
    await render(<HandoverScreen />);
    await waitFor(() => expect(screen.getAllByTestId('warehouse-handover-pending').at(-1)).toHaveTextContent(/okunamadı/));
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
