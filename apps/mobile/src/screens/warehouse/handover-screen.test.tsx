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
/**
 * Rampa cevabı — sayı ve liste AYNI gerçeği söyler (kapı da öyle: tek tur, tek süzgeç).
 * `göster` verilirse liste kırpılmış olur; ekranın "ilk N listelendi" cümlesi böyle sınanır.
 */
function rampa(boxes: number, goster = boxes) {
  return {
    boxes,
    waiting: Array.from({ length: goster }, (_, i) => ({
      boxId: `00000000-0000-4000-8000-00000000000${i + 1}`,
      code: `KT-26-A${i + 1}`,
      boxNo: i + 1,
      boxCount: Math.max(boxes, 1),
      referenceNo: 'LZA-26-3M8C',
    })),
  };
}

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
  net.pending = rampa(3);
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

    /* SATIR İKİ KATMAN (çizime çekildi 05.09): kalın başlık sayacı, ince alt satır siparişi ve
       kalanı söyler. Eskiden ikisi tek cümlede birleşikti. */
    await waitFor(() => expect(screen.getByText('Kutu verildi · 2/3')).toBeOnTheScreen());
    expect(screen.getByText('LZA-26-3M8C · bir kutu daha bekliyor')).toBeOnTheScreen();
    // Gövde SUNUCUYA gidiyor: hangi kolonda aranacağını telefon bilmiyor, kod olduğu gibi gidiyor.
    expect(okutmaCagrilari()).toHaveLength(1);
  });

  it('SON kutuda cümle değişir — gönderi verildi, sipariş yola çıktı', async () => {
    net.handover = { status: 'ok', boxNo: 3, referenceNo: 'LZA-26-3M8C', handedBoxes: 3, boxCount: 3, shipmentHandedOver: true };
    await render(<HandoverScreen />);

    await okut('Toplama');

    /* Ekranın var olma sebebi olan an KENDİ TONUNU taşır (çizim: yeşil zemin + tik). Eskiden
       "kutu verildi" ile aynı kartı alıyordu, yani tek gerçek olay görsel yüzünü kaybediyordu. */
    await waitFor(() => expect(screen.getByText('Son kutuyla sipariş YOLA ÇIKTI')).toBeOnTheScreen());
    expect(screen.getByText('LZA-26-3M8C · gönderi 3/3 kutu verildi')).toBeOnTheScreen();
  });

  it('İKİNCİ okutma hata değil: "zaten verilmişti" ve sayı DEĞİŞMEZ', async () => {
    net.handover = { status: 'already_handed', boxNo: 1, handedBoxes: 1, boxCount: 2 };
    await render(<HandoverScreen />);

    await okut('Toplama');

    // Depocu rampada aynı kutuyu iki kez okutabilir; hata cümlesi onu kendi sayımından
    // şüphelendirirdi.
    await waitFor(() => expect(screen.getByText('Zaten verilmişti')).toBeOnTheScreen());
    expect(screen.getByText(/ikinci okutma yok sayıldı/)).toBeOnTheScreen();
  });

  /*
    RAMPADAKİ SAYI (§8.6) — okutmadan ÖNCE cevabı olan tek soru.

    Bugüne kadar "kaç kaldı" ancak ilk okutmadan sonra ve yalnız O gönderi için biliniyordu;
    rampada üç ayrı siparişin kutuları varken "bitti mi" sorusunun cevabı hiçbir yerde yoktu.
  */
  it('rampada bekleyen kutu sayısı okutmadan ÖNCE yazılır', async () => {
    net.pending = rampa(4);
    await render(<HandoverScreen />);

    // SAYI BAŞLIĞIN KUYRUĞUNDA (05.09): ayrı bir cümle olarak yazılınca bölümün boş hâliyle aynı
    // şeyi iki kez söylüyordu ve boş ekran üç ayrı yerde "boş" diyordu.
    await waitFor(() => expect(screen.getByTestId('warehouse-handover-pending')).toHaveTextContent(/RAMPADA BEKLEYEN · 4 kutu/));
  });

  it('sayı her okutmadan sonra SUNUCUDAN tazelenir — yerelde eksiltilmiyor', async () => {
    net.pending = rampa(2);
    net.handover = { status: 'ok', boxNo: 1, referenceNo: 'LZA-26-3M8C', handedBoxes: 1, boxCount: 2, shipmentHandedOver: false };
    await render(<HandoverScreen />);
    await waitFor(() => expect(screen.getByTestId('warehouse-handover-pending')).toHaveTextContent(/2 kutu/));

    // Sunucu artık BİR kutu diyor: aynı depodaki ikinci telefon da okutmuş olabilir ve yerel bir
    // eksiltme o gerçeği kaçırırdı.
    net.pending = rampa(1);
    await okut('Toplama');

    await waitFor(() => expect(screen.getByTestId('warehouse-handover-pending')).toHaveTextContent(/RAMPADA BEKLEYEN · 1 kutu/));
  });

  /*
    SIFIR ile OKUNAMADI AYRI ŞEYLER ve ayrımı boş ekran kararı da taşıyor: sayı okunamadıysa ekran
    "boş" DEMEZ — bilmediğini söyler ve bölümleri çizmeye devam eder. "Bilmiyorum"u "boş" saymak,
    depocuyu dolu bir rampadan uzaklaştırırdı.
  */
  it('sayı OKUNAMADIYSA ekran "boş" demez, bilmediğini söyler', async () => {
    net.pending = { bozuk: true };
    await render(<HandoverScreen />);

    await waitFor(() => expect(screen.getByTestId('warehouse-handover-pending')).toHaveTextContent(/RAMPADA BEKLEYEN · okunamadı/));
    // Boş ekran bloğu ÇIKMAZ: bilinmeyen bir rampa boş sayılmaz.
    expect(screen.queryByTestId('warehouse-handover-idle')).toBeNull();
  });

  /*
    ── RAMPA BÖLÜMÜ (kullanıcı kararı 05.09) ───────────────────────────────────────────────────
    Ekranın kuralı "liste değil OKUTUCU" ve bu bölüm onunla çelişmiyor: SEÇİM değil ENVANTER.
    Satırlar dokunulamaz — bir eylem açan hiçbir öğe yok. Sayaç zaten "3 kutu bekliyor" diyordu;
    bölüm o cümleyi somutlaştırıyor.
  */
  it('rampada bekleyen kutular LİSTELENİR — satır dokunulamaz, seçim yok', async () => {
    net.pending = rampa(2);
    await render(<HandoverScreen />);

    await waitFor(() => expect(screen.getByTestId('warehouse-handover-ramp-KT-26-A1')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-handover-ramp-KT-26-A1')).toHaveTextContent(/LZA-26-3M8C · kutu 1\/2/);
    // Kutu kodu künyede: taşıyıcının etiketine METİN olarak yazılı, depocu kutunun üstünde okuyor.
    expect(screen.getByTestId('warehouse-handover-ramp-KT-26-A1')).toHaveTextContent(/KT-26-A1/);
    expect(screen.getByTestId('warehouse-handover-ramp-KT-26-A2')).toBeOnTheScreen();
  });

  /*
    BOŞ EKRAN TEK CÜMLE (kullanıcı bulgusu 05.09) — rampa boşken ve hiç okutma yokken ekran aynı
    şeyi ÜÇ kez söylüyordu (üstte "rampa boş", ortada "bekleyen kutu yok", altta "bugün kutu
    verilmedi"). İlk kez giren "burası ne" diye soruyordu.
  */
  it('rampa boş VE hiç okutma yoksa TEK blok çıkar, üç ayrı boş cümle değil', async () => {
    net.pending = rampa(0);
    await render(<HandoverScreen />);

    await waitFor(() => expect(screen.getByTestId('warehouse-handover-idle')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-handover-idle')).toHaveTextContent(/Rampa boş — okutulacak kutu kalmadı/);
    // Öteki iki boş blok ve rampa başlığı ÇİZİLMEZ.
    expect(screen.queryByTestId('warehouse-handover-empty')).toBeNull();
    expect(screen.queryByTestId('warehouse-handover-pending')).toBeNull();
  });

  /* Rampa boşalmış ama BUGÜN okutma yapılmışsa bölümler durur: "boşaldı" bilgisi başlığın
     kuyruğunda okunur ve geçmiş yerinde kalır. */
  it('rampa boşaldıysa ama okutma yapıldıysa bölümler DURUR — başlık "boş" der', async () => {
    net.pending = rampa(1);
    net.handover = { status: 'ok', boxNo: 1, referenceNo: 'LZA-26-3M8C', handedBoxes: 1, boxCount: 1, shipmentHandedOver: true };
    await render(<HandoverScreen />);
    net.pending = rampa(0);
    await okut('Toplama');

    await waitFor(() => expect(screen.getByTestId('warehouse-handover-pending')).toHaveTextContent(/RAMPADA BEKLEYEN · boş/));
    expect(screen.queryByTestId('warehouse-handover-idle')).toBeNull();
    expect(screen.getByText('Son kutuyla sipariş YOLA ÇIKTI')).toBeOnTheScreen();
  });

  /* TAVAN SESSİZ DEĞİL: gerçek toplam sayaçtan geliyor. Kırpılmış bir listeyi tam sanmak,
     rampayı olduğundan boş sanmaktır. */
  it('liste kırpılmışsa ekran bunu SÖYLER — sessiz tavan yok', async () => {
    net.pending = rampa(9, 2);
    await render(<HandoverScreen />);

    await waitFor(() => expect(screen.getByTestId('warehouse-handover-ramp-more')).toBeOnTheScreen());
    expect(screen.getByTestId('warehouse-handover-ramp-more')).toHaveTextContent(/İlk 2 kutu listelendi — rampada 9 kutu var/);
  });

  /*
    KAPSAM DIŞI KUTU HATA DEĞİL, YÖNLENDİRMEDİR (çizime çekildi 05.09). Kod onu kırmızı yazıyordu;
    çizim nötr çiziyor ve haklı: depocu yanlış bir şey yapmadı, kutuyu doğru yığına koyacak.
    "Zaten verilmişti" de aynı sınıf — bir tekrar, bir arıza değil.
  */
  it('kapsam dışı kutu ve ikinci okutma SESSİZ tonda — hata ailesinde değil', async () => {
    net.handover = { status: 'out_of_scope', referenceNo: 'LZA-26-KEHL1' };
    await render(<HandoverScreen />);
    await okut('Toplama');

    await waitFor(() => expect(screen.getByText('Başka deponun kutusu — geri koy')).toBeOnTheScreen());
    expect(screen.getByText('LZA-26-KEHL1 · buradan verilemez')).toBeOnTheScreen();
  });

  /* SAAT SATIRDA (çizim: 14:20 · 14:19 · 14:17) — depocu "hangi kutuyu ne zaman verdim"i
     listeden okuyor. Kapı zaman döndürmüyor; bu cihazın ölçtüğü an, uydurma değil. */
  it('her okutma satırı SAATİNİ taşır', async () => {
    net.handover = { status: 'ok', boxNo: 1, referenceNo: 'LZA-26-3M8C', handedBoxes: 1, boxCount: 2, shipmentHandedOver: false };
    await render(<HandoverScreen />);
    await okut('Toplama');

    await waitFor(() => expect(screen.getByText('Kutu verildi · 1/2')).toBeOnTheScreen());
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeOnTheScreen();
  });

  it('adlı retler SEBEBİYLE yazılır — mühürsüz kutu ve duyurulmamış gönderi ayrı cümleler', async () => {
    net.handover = { status: 'not_sealed', boxNo: 1 };
    await render(<HandoverScreen />);
    await okut('Toplama');
    await waitFor(() => expect(screen.getByText(/Mühürlü değil/)).toBeOnTheScreen());

    net.handover = { status: 'not_announced', boxNo: 1 };
    await okut('Toplama');
    await waitFor(() => expect(screen.getByText('Etiket alınmamış')).toBeOnTheScreen());
  });
});
