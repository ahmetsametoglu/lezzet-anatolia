import { fireEvent, render, screen } from '@testing-library/react-native';

import type { OperationsSection } from '@/lib/operations/sections';
import messages from './messages.json';
import type { OperationsNotification } from './notification-map';
import { OperationsNotificationsScreen } from './notifications-screen';
import { OperationsSessionProvider } from './sections-context';

/*
  BİLDİRİM EKRANI — dolu, boş ve rol-süzülmüş hâller + satır/geri gezinmesi.

  AKIŞ HOOK'U TAKLİT EDİLİYOR (katalog ekranının aksine, bilinçli): oradaki hook GERÇEK MANTIKTIR
  ve taklit edilseydi test hiçbir şey ölçmezdi; buradaki hook bugün yalnız bir FIXTURE'ı süzgeçten
  geçiriyor ve süzgecin kendisi zaten saf olarak test edilmiş (`lib/operations/sections.test.ts`).
  Taklit sayesinde ekranın BOŞ hâli de ölçülebiliyor — fixture'ın dört bölümünde de satır olduğu
  için gerçek veriyle o dal hiç görülemezdi.

  KAPSAM CÜMLESİ TAKLİT EDİLMİYOR: bağlamdaki bölümlerden gerçek kuralla türetiliyor.
*/

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: (href: unknown) => mockPush(href), back: () => mockPush('BACK') }),
}));

/* Fixture dosyası uca bağlanınca SİLİNDİ (kendi künyesinin verdiği söz); ekranın bütün hâllerini
   çizebilmek için satırlar artık testin kendi sabitinde — v2'nin aynı altı satırı. */
const FEED_ROWS: OperationsNotification[] = [
  { id: 'n1', title: 'Yeni sipariş onaylandı — toplama bekliyor', section: 'warehouse', dot: 'warehouse', ago: '2 dk' },
  { id: 'n2', title: 'Rota güncellendi — 1 durak eklendi', section: 'courier', dot: 'courier', ago: '9 dk' },
  { id: 'n3', title: 'Eksik toplama — karar bekliyor', section: 'management', dot: 'attention', ago: '14 dk' },
  { id: 'n4', title: 'Yeni şikâyet — Bozuk', section: 'management', dot: 'alert', ago: '12 dk' },
  { id: 'n5', title: 'Uyuşmazlık göründü — gün sonu', section: 'money', dot: 'alert', ago: '25 dk' },
  { id: 'n6', title: 'Azalan stok tespiti — tetik yakında', section: 'management', dot: 'quiet', ago: '1 sa' },
];

let mockFeed: OperationsNotification[] = [];
const mockMarkAllSeen = jest.fn();
jest.mock('./use-notifications.hook', () => ({
  useOperationsNotifications: () => ({ rows: mockFeed, unread: mockFeed.length, markAllSeen: mockMarkAllSeen }),
}));

const t = messages;

/** Ekran bölümlerini KAPIDAN alır; testte sağlayıcı doğrudan kurulur. */
async function renderScreen(sections: OperationsSection[], feed: OperationsNotification[]) {
  mockFeed = feed;
  await render(
    <OperationsSessionProvider value={{ sections, userName: 'Musa Kaya', userEmail: 'musa@lezzetanatolia.fr' }}>
      <OperationsNotificationsScreen />
    </OperationsSessionProvider>,
  );
}

beforeEach(() => {
  mockPush.mockReset();
});

describe('OperationsNotificationsScreen', () => {
  it('çok şapkalı oturumda kapsam "tüm bölümler" ve satırlar bölüm · süre ile yazılır', async () => {
    await renderScreen(['courier', 'warehouse', 'management', 'money'], FEED_ROWS);

    expect(screen.getByText(t.notifications.scopeAll)).toBeOnTheScreen();
    expect(screen.getByText('Rota güncellendi — 1 durak eklendi')).toBeOnTheScreen();
    // Alt satır cihazda kuruluyor: sözleşme bölüm KİMLİĞİ taşır, etiketi ekran çözer.
    expect(screen.getByText('Kurye · 9 dk')).toBeOnTheScreen();
    expect(screen.getByText('Depo · 2 dk')).toBeOnTheScreen();
  });

  it('tek şapkada kapsam bölümün ADIYLA yazılır — "tüm bölümler" DENMEZ', async () => {
    await renderScreen(['courier'], [FEED_ROWS[1] as OperationsNotification]);

    expect(screen.getByText('yalnız Kurye — rol süzmesi')).toBeOnTheScreen();
    expect(screen.queryByText(t.notifications.scopeAll)).toBeNull();
  });

  it('iki şapkada kapsam iki adı da sayar (eksik kümede "tümü" yalanı yok)', async () => {
    await renderScreen(['courier', 'money'], []);

    expect(screen.getByText('yalnız Kurye · Para — rol süzmesi')).toBeOnTheScreen();
  });

  it('akış boşken boş durum bloğu çıkar', async () => {
    await renderScreen(['courier'], []);

    expect(screen.getByTestId('operations-notifications-empty')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: t.notifications.empty.title })).toBeOnTheScreen();
    expect(screen.getByText(t.notifications.empty.body)).toBeOnTheScreen();
  });

  /* Kural notu iki AYRI testte ölçülüyor: RNTL v14'te aynı test içinde ikinci bir `render`
     öncekini söker ve `screen` tekilini bozar (katalog testinin künyesindeki tuzağın aynısı). */
  it('süzme kuralı notu BOŞ hâlde durur — az şey görülmesinin sebebini o cümle söyler', async () => {
    await renderScreen(['courier'], []);

    expect(screen.getByText(t.notifications.rule)).toBeOnTheScreen();
  });

  it('süzme kuralı notu DOLU hâlde de durur (listenin altında, tasarımda `sc-if` dışında)', async () => {
    await renderScreen(['courier', 'warehouse', 'management', 'money'], FEED_ROWS);

    expect(screen.getByText(t.notifications.rule)).toBeOnTheScreen();
  });

  it('satıra basınca bildirimin BÖLÜMÜ açılır (derin bağ 21.10-21.12’de)', async () => {
    await renderScreen(['money'], [FEED_ROWS[4] as OperationsNotification]);

    await fireEvent.press(screen.getByTestId('operations-notification-n5'));

    expect(mockPush).toHaveBeenCalledWith('/money');
  });

  it('geri düğmesi yığını kapatır', async () => {
    await renderScreen(['courier'], []);

    await fireEvent.press(screen.getByRole('button', { name: t.notifications.back }));

    expect(mockPush).toHaveBeenCalledWith('BACK');
  });
});
