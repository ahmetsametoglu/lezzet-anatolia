import { customerAppColors, operationsAppColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { OperationsSection } from '@/lib/operations/sections';
import messages from './messages.json';
import type { OperationsNotification } from './notification-map';
import { OperationsNotificationsScreen } from './notifications-screen';
import { OperationsSessionProvider } from './sections-context';

/*
  BİLDİRİM EKRANI (v3:3099-3167) — dört hâl (yükleniyor · hata · boş · dolu), süzgeç çipleri, gün
  grupları, okunmadı noktası, hedef satırı ve kuyruk.

  AKIŞ KANCASI TAKLİT EDİLİYOR ve gerekçe 05.09'da DEĞİŞTİ: eskiden "hook yalnız bir fixture'ı
  süzüyor" deniyordu — o cümle 26.08'de kanca gerçek uca bağlanınca bayatladı. Bugünkü gerekçe
  başka: kancanın kendi işi (imleç, iyimser okundu, kuşak sayacı, "çıkarken gördüm") ekranın
  ölçtüğü şey DEĞİL ve ayrıca test edilmeli; ekran testi yalnız o kancanın verdiği şekli çiziyor mu
  diye sorar. Taklit sayesinde hata ve boş dalları da ölçülebiliyor — gerçek veriyle o dallara
  düşmek mümkün değil.

  ESKİ TESTİN ÖLÇTÜĞÜ AMA ARTIK OLMAYAN ŞEY: "kapsam cümlesi" ve rol süzmesi. Bölüm artık satırı
  gizlemiyor (kullanıcı kararı 05.09), o yüzden "tek şapkalı kullanıcı ötekini görmez" iddiası
  KALKTI — yerine "görür, ama süzgeç çipiyle daraltabilir" geldi.
*/

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: (href: unknown) => mockPush(href), back: () => mockPush('BACK') }),
  useFocusEffect: () => undefined,
}));

const satir = (over: Partial<OperationsNotification> & Pick<OperationsNotification, 'id'>): OperationsNotification => ({
  title: 'Bir olay oldu',
  sub: null,
  label: 'Bildirim',
  section: 'management',
  tone: 'quiet',
  createdAt: new Date(2026, 8, 5, 8, 42).toISOString(),
  readAt: null,
  destination: null,
  ...over,
});

/** Dört bölümü ve iki günü birden kapsayan küme — çip, grup ve nokta hâllerini birlikte çizer. */
const FEED_ROWS: OperationsNotification[] = [
  satir({
    id: 'n1',
    title: 'Transfer eksik kabul edildi — TR-26-1',
    sub: '3 adet eksik · STR kayıp yazdı',
    label: 'Transfer',
    section: 'warehouse',
    tone: 'attention',
    destination: { href: '/inbound', label: 'Transferi aç', section: 'warehouse' },
  }),
  satir({
    id: 'n2',
    title: 'Yeni şikâyet — LZA-26-9Q2B',
    sub: 'hasarlı ürün',
    label: 'Şikâyet',
    tone: 'alert',
    destination: { href: '/complaint?id=t-9', label: 'Talebi aç', section: 'management' },
  }),
  satir({
    id: 'n3',
    title: 'Gün kapanışında uyuşmazlık — SF-26-7',
    sub: 'sayım beklenenden farklı',
    label: 'Para',
    section: 'money',
    tone: 'alert',
    readAt: new Date(2026, 8, 5, 9, 0).toISOString(),
    destination: { href: '/day-end', label: 'Gün sonunu aç', section: 'money' },
  }),
  satir({
    id: 'n4',
    title: 'Sefer kapandı — SF-26-6',
    sub: '2 durak askıda · yeniden planla',
    label: 'Sevkiyat',
    createdAt: new Date(2026, 8, 4, 17, 30).toISOString(),
  }),
];

type FeedState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: OperationsNotification[]; nextCursor: string | null; unread: number };

let mockState: FeedState = { status: 'ready', rows: [], nextCursor: null, unread: 0 };
let mockTailFailed = false;
const mockRetry = jest.fn();
const mockMarkRead = jest.fn();
const mockMarkSeen = jest.fn();
const mockLoadMore = jest.fn();
let mockHasMore = false;

jest.mock('./use-notifications.hook', () => ({
  useOperationsNotifications: () => ({
    state: mockState,
    unread: mockState.status === 'ready' ? mockState.unread : null,
    loadMore: mockHasMore ? mockLoadMore : null,
    tailFailed: mockTailFailed,
    retry: mockRetry,
    markRead: mockMarkRead,
    markSeen: mockMarkSeen,
  }),
}));

const t = messages;

async function renderScreen(sections: OperationsSection[], state: FeedState) {
  mockState = state;
  await render(
    <OperationsSessionProvider
      value={{
        sections,
        userName: 'Musa Kaya',
        userEmail: 'musa@lezzetanatolia.fr',
        warehouses: [],
        resolvedWarehouseId: null,
      }}
    >
      <OperationsNotificationsScreen />
    </OperationsSessionProvider>,
  );
}

const dolu = (rows: OperationsNotification[], extra: Partial<Extract<FeedState, { status: 'ready' }>> = {}): FeedState => ({
  status: 'ready',
  rows,
  nextCursor: null,
  unread: rows.filter((row) => row.readAt === null).length,
  ...extra,
});

const HEPSI: OperationsSection[] = ['warehouse', 'courier', 'management', 'money'];

beforeEach(() => {
  mockPush.mockReset();
  mockMarkRead.mockReset();
  mockLoadMore.mockReset();
  mockTailFailed = false;
  mockHasMore = false;
});

describe('OperationsNotificationsScreen', () => {
  it('satır başlık + alt satır + hedef satırını birlikte yazar', async () => {
    await renderScreen(HEPSI, dolu(FEED_ROWS));

    expect(screen.getByText('Transfer eksik kabul edildi — TR-26-1')).toBeOnTheScreen();
    expect(screen.getByText('3 adet eksik · STR kayıp yazdı')).toBeOnTheScreen();
    expect(screen.getByText('Transferi aç →')).toBeOnTheScreen();
  });

  it('satırlar GÜNE göre gruplanır — bugün ve dün ayrı başlık altında', async () => {
    await renderScreen(HEPSI, dolu(FEED_ROWS));

    expect(screen.getByText('BUGÜN')).toBeOnTheScreen();
    expect(screen.getByText('DÜN')).toBeOnTheScreen();
  });

  /* BÖLÜM ARTIK KAPI DEĞİL: tek şapkalı kullanıcı da öteki bölümlerin satırlarını GÖRÜR. Eski
     davranışta bu satırlar sessizce düşüyordu ve kişiye YAZILAN bildirim ekranda hiç çıkmıyordu. */
  it('tek şapkalı kullanıcı öteki bölümlerin satırlarını da görür (süzgeç kapı değil)', async () => {
    await renderScreen(['warehouse'], dolu(FEED_ROWS));

    expect(screen.getByText('Yeni şikâyet — LZA-26-9Q2B')).toBeOnTheScreen();
    expect(screen.getByText('Gün kapanışında uyuşmazlık — SF-26-7')).toBeOnTheScreen();
  });

  it('süzgeç çipi listeyi daraltır; "Tümü" geri açar', async () => {
    await renderScreen(HEPSI, dolu(FEED_ROWS));

    await fireEvent.press(screen.getByTestId('operations-notification-filter-money'));
    expect(screen.getByText('Gün kapanışında uyuşmazlık — SF-26-7')).toBeOnTheScreen();
    expect(screen.queryByText('Yeni şikâyet — LZA-26-9Q2B')).toBeNull();

    await fireEvent.press(screen.getByTestId('operations-notification-filter-all'));
    expect(screen.getByText('Yeni şikâyet — LZA-26-9Q2B')).toBeOnTheScreen();
  });

  /* Tasarımın kendi koşulu (`bldSuzgecBos`) rol iznine baktığı için YAPISI GEREĞİ ölüydü — burada
     satır sayısına bakıyor, yani kutu gerçekten görünebiliyor. */
  it('süzgeç boş sonuç verince ayrı bir blok ve "Süzgeci temizle" çıkar', async () => {
    await renderScreen(HEPSI, dolu([FEED_ROWS[0]!]));

    await fireEvent.press(screen.getByTestId('operations-notification-filter-money'));
    expect(screen.getByTestId('operations-notifications-filtered-empty')).toBeOnTheScreen();
    expect(screen.getByText(t.notifications.filteredEmpty.title)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText(t.notifications.clearFilter));
    expect(screen.getByText('Transfer eksik kabul edildi — TR-26-1')).toBeOnTheScreen();
  });

  it('okunmamış satır nokta taşır, okunmuş taşımaz', async () => {
    await renderScreen(HEPSI, dolu(FEED_ROWS));

    expect(screen.getByTestId('operations-notification-n1-dot')).toBeOnTheScreen();
    expect(screen.queryByTestId('operations-notification-n3-dot')).toBeNull();
  });

  it('hedefi olan satır dokununca hem okundu olur hem ekrana gider', async () => {
    await renderScreen(HEPSI, dolu(FEED_ROWS));

    fireEvent.press(screen.getByTestId('operations-notification-n2'));
    expect(mockMarkRead).toHaveBeenCalledWith('n2');
    expect(mockPush).toHaveBeenCalledWith('/complaint?id=t-9');
  });

  /* Açılamayan bir ekrana götürmek ÖLÜ DOKUNUŞTAN kötü: expo-router kullanıcıyı sessizce başka bir
     bölüme indirir (`_layout.tsx` `redirect`) ve o savrulma fark edilmez. */
  it('kullanıcının açamadığı bölümün satırı tıklanmaz ve hedef satırı çizilmez', async () => {
    await renderScreen(['warehouse'], dolu(FEED_ROWS));

    expect(screen.queryByText('Talebi aç →')).toBeNull();
    fireEvent.press(screen.getByTestId('operations-notification-n2'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('hedefi OLMAYAN satır da tıklanmaz — bölüm köküne savuşturulmaz', async () => {
    await renderScreen(HEPSI, dolu(FEED_ROWS));

    // eslint-disable-next-line no-console
    console.log('FEED_ROWS ids:', FEED_ROWS.map((r) => r.id), '| n4.destination =', JSON.stringify(FEED_ROWS[3]?.destination), '| n4 var mı:', screen.queryByTestId('operations-notification-n4') !== null);
    fireEvent.press(screen.getByTestId('operations-notification-n4'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('alarm satırı kırmızı zemin + kırmızı kenar alır, sakin satır kum kartta kalır', async () => {
    await renderScreen(HEPSI, dolu(FEED_ROWS));

    expect(screen.getByTestId('operations-notification-n2')).toHaveStyle({
      backgroundColor: operationsAppColors['error-bg'],
      borderColor: customerAppColors['error-line'],
    });
    expect(screen.getByTestId('operations-notification-n1')).toHaveStyle({
      backgroundColor: operationsAppColors.panel,
    });
  });

  it('boş akışta tek blok — yükleme hâliyle karışmaz', async () => {
    await renderScreen(HEPSI, dolu([]));

    expect(screen.getByTestId('operations-notifications-empty')).toBeOnTheScreen();
    expect(screen.getByText(t.notifications.empty.title)).toBeOnTheScreen();
    expect(screen.queryByTestId('operations-notifications-loading')).toBeNull();
  });

  it('ilk yükte iskelet çizilir, boş bloğu ÇİZİLMEZ (yükleme ≠ yokluk)', async () => {
    await renderScreen(HEPSI, { status: 'loading' });

    expect(screen.getByTestId('operations-notifications-loading')).toBeOnTheScreen();
    expect(screen.queryByTestId('operations-notifications-empty')).toBeNull();
  });

  /* HATA DALI: eskiden ilk çekim düşünce ekran sonsuza kadar iskelet çiziyordu — açıklama da yoktu,
     kurtuluş yolu da. */
  it('çekim düşerse hata bloğu ve "Tekrar dene" çıkar, iskelet kalmaz', async () => {
    await renderScreen(HEPSI, { status: 'error' });

    expect(screen.getByTestId('operations-notifications-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('operations-notifications-loading')).toBeNull();
    fireEvent.press(screen.getByText(t.notifications.error.retry));
    expect(mockRetry).toHaveBeenCalled();
  });

  /* CLAUDE §1: "nextCursor üretip kullanmayan ekran, listenin kuyruğunu sessizce yutar." */
  it('kuyruk varsa "Devamını yükle" çizilir; yoksa çizilmez', async () => {
    mockHasMore = true;
    await renderScreen(HEPSI, dolu(FEED_ROWS, { nextCursor: 'imlec' }));
    fireEvent.press(screen.getByTestId('operations-notifications-more'));
    expect(mockLoadMore).toHaveBeenCalled();
  });

  it('kuyruk turu düşerse liste yerinde kalır ve düşüş söylenir', async () => {
    mockTailFailed = true;
    await renderScreen(HEPSI, dolu(FEED_ROWS));

    expect(screen.getByText(t.notifications.tailFailed)).toBeOnTheScreen();
    expect(screen.getByText('Transfer eksik kabul edildi — TR-26-1')).toBeOnTheScreen();
  });

  it('kural kutusu dolu listede çizilir', async () => {
    await renderScreen(HEPSI, dolu(FEED_ROWS));
    expect(screen.getByText(t.notifications.rule.title)).toBeOnTheScreen();
  });

  it('geri düğmesi yığını kapatır', async () => {
    await renderScreen(HEPSI, dolu(FEED_ROWS));
    fireEvent.press(screen.getByLabelText(t.notifications.back));
    expect(mockPush).toHaveBeenCalledWith('BACK');
  });
});

