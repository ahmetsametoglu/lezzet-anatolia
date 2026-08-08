import { fireEvent, render, screen } from '@testing-library/react-native';

import type { OperationsSection } from '@/lib/operations/sections';
import messages from './messages.json';
import { NOTIFICATION_FIXTURE, type OperationsNotification } from './notifications-fixture';
import { OperationsNotificationsScreen } from './notifications-screen';
import { OperationsSectionsProvider } from './sections-context';

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

let mockFeed: OperationsNotification[] = [];
jest.mock('./use-notifications.hook', () => ({ useOperationsNotifications: () => mockFeed }));

const t = messages;

/** Ekran bölümlerini KAPIDAN alır; testte sağlayıcı doğrudan kurulur. */
async function renderScreen(sections: OperationsSection[], feed: OperationsNotification[]) {
  mockFeed = feed;
  await render(
    <OperationsSectionsProvider value={sections}>
      <OperationsNotificationsScreen />
    </OperationsSectionsProvider>,
  );
}

beforeEach(() => {
  mockPush.mockReset();
});

describe('OperationsNotificationsScreen', () => {
  it('çok şapkalı oturumda kapsam "tüm bölümler" ve satırlar bölüm · süre ile yazılır', async () => {
    await renderScreen(['courier', 'warehouse', 'management', 'money'], NOTIFICATION_FIXTURE);

    expect(screen.getByText(t.notifications.scopeAll)).toBeOnTheScreen();
    expect(screen.getByText('Rota güncellendi — 1 durak eklendi')).toBeOnTheScreen();
    // Alt satır cihazda kuruluyor: sözleşme bölüm KİMLİĞİ taşır, etiketi ekran çözer.
    expect(screen.getByText('Kurye · 9 dk')).toBeOnTheScreen();
    expect(screen.getByText('Depo · 2 dk')).toBeOnTheScreen();
  });

  it('tek şapkada kapsam bölümün ADIYLA yazılır — "tüm bölümler" DENMEZ', async () => {
    await renderScreen(['courier'], [NOTIFICATION_FIXTURE[1] as OperationsNotification]);

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
    await renderScreen(['courier', 'warehouse', 'management', 'money'], NOTIFICATION_FIXTURE);

    expect(screen.getByText(t.notifications.rule)).toBeOnTheScreen();
  });

  it('satıra basınca bildirimin BÖLÜMÜ açılır (derin bağ 21.10-21.12’de)', async () => {
    await renderScreen(['money'], [NOTIFICATION_FIXTURE[4] as OperationsNotification]);

    await fireEvent.press(screen.getByTestId('operations-notification-n5'));

    expect(mockPush).toHaveBeenCalledWith('/money');
  });

  it('geri düğmesi yığını kapatır', async () => {
    await renderScreen(['courier'], []);

    await fireEvent.press(screen.getByRole('button', { name: t.notifications.back }));

    expect(mockPush).toHaveBeenCalledWith('BACK');
  });
});
