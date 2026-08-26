import { fireEvent } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import { renderShell } from '@/testing/render-shell';

import { meFixture } from '@/screens/operations/me-fixture';

/*
  OPERASYON KABUĞU SMOKE TESTİ — rota dosyaları GERÇEK (`./src/app` diskten taranır), yani kapı +
  sekme grubu + rol süzmesi birlikte ayağa kalkıyor. Süzme KURALININ doğruluğu ayrı ve saf olarak
  ölçülüyor (`lib/operations/sections.test.ts`); burada ölçülen, o kuralın kabuğa DOĞRU bağlandığı.

  Dosya `src/app/` İÇİNE konamaz: expo-router o klasördeki her `.tsx`i ROTA sayar (kabuk testinin
  kendi künyesi — `app-shell.test.tsx`).

  `/me` TAKLİT `fetch`le (katalog emsali); supabase istemcisi modül olarak taklit ediliyor çünkü
  gerçeği `EXPO_PUBLIC_SUPABASE_*` ister ve testin konusu oturum tesisatı değil, KAPI.
*/

// Cihaz dili sabitlenir: yönlendirme sonrası MÜŞTERİ kabuğunun etiketleri makinenin diline
// bağlanmasın (operasyon yüzeyi zaten tek dilli).
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

// İlk-açılış kapısı tamamlanmış sayılır (modül-yanı mock — gerekçesi mock dosyasının başlığında):
// yetkisiz/oturumsuz hâller müşteri köküne düşer ve bayraksız ortamda kapı orayı da onboarding'e
// çevirirdi; bu testin konusu operasyon kapısı, onboarding değil.
jest.mock('@/lib/onboarding/onboarding-store');

// `mock` öneki ZORUNLU: `jest.mock` fabrikası dosyanın en üstüne kaldırılıyor ve Babel yalnız bu
// önekli değişkenlere kapanış izni veriyor (katalog testinin künyesi).
const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
      // Vitrin `useMe` ile oturumu dinler (21.14c); kapı testinde değişim olayı doğmaz.
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function meResponse(roles: Parameters<typeof meFixture>[0]): Response {
  return {
    status: 200,
    headers: { get: () => null },
    json: async () => ({ data: meFixture(roles), error: null }),
  } as unknown as Response;
}

/** Bildirim akışının zarfı (14.13) — adres-ayrımlı mock'un bildirim yarısı. */
function notificationsResponse(notifications: unknown[]): Response {
  return {
    status: 200,
    headers: { get: () => null },
    json: async () => ({ data: { notifications, nextCursor: null, unread: notifications.length }, error: null }),
  } as unknown as Response;
}

/** Ağ hiç kurulamadı — `fetch` yalnız bu durumda fırlatır. */
function networkDown(): Promise<Response> {
  return Promise.reject(new Error('ağ yok'));
}


beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('operasyon kabuğu — kapı', () => {
  it('yalnız müşteri rolü operasyona GİREMEZ: müşteri kabuğuna yönlendirilir', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(meResponse(['customer'])));

    const { app } = await renderShell('/courier');

    expect(app).toHavePathname('/');
    // Müşteri kabuğu gerçekten açıldı (yalnız adres değişmedi): dört müşteri sekmesi ekranda.
    expect(await screen.findByRole('tab', { name: 'Vitrin', selected: true })).toBeOnTheScreen();
    expect(screen.queryByTestId('operations-section-courier')).toBeNull();
  });

  it('oturum yoksa (401) da müşteri kabuğuna düşer — "oturumsuz kullanım = müşteri"', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        status: 401,
        headers: { get: () => null },
        json: async () => ({ data: null, error: 'unauthorized' }),
      } as unknown as Response),
    );

    const { app } = await renderShell('/courier');

    expect(app).toHavePathname('/');
  });

  it('rol OKUNAMAZSA "yetkin yok" DENMEZ: hata bloğu çıkar ve tekrar denenince kabuk açılır', async () => {
    fetchMock.mockImplementation(networkDown);

    await renderShell('/courier');

    expect(await screen.findByTestId('operations-gate-error')).toBeOnTheScreen();
    // Kullanıcı müşteri kabuğuna DÜŞÜRÜLMEDİ — yetki hakkında bir iddiada bulunulmadı.
    expect(screen.queryByRole('tab', { name: 'Vitrin' })).toBeNull();

    fetchMock.mockImplementation(() => Promise.resolve(meResponse(['courier'])));
    await fireEvent.press(screen.getByTestId('operations-gate-error-retry'));

    expect(await screen.findByTestId('operations-section-courier')).toBeOnTheScreen();
  });
});

describe('operasyon kabuğu — rol sekmeleri', () => {
  it('tek operasyon rolünde sekme çubuğu GİZLİ ve yalnız kendi bölümü açılır', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(meResponse(['customer', 'courier'])));

    const { app } = await renderShell('/courier');

    expect(await screen.findByTestId('operations-section-courier')).toBeOnTheScreen();
    expect(app).toHavePathname('/courier');
    expect(screen.queryByTestId('operations-tabs')).toBeNull();
    expect(screen.getByRole('header', { name: 'Günün Rotası' })).toBeOnTheScreen();
  });

  it('tek rollü kullanıcı BAŞKA bölümün adresine giremez — en yakın kardeşe iner', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(meResponse(['warehouse'])));

    await renderShell('/money');

    expect(await screen.findByTestId('operations-section-warehouse')).toBeOnTheScreen();
    expect(screen.queryByTestId('operations-section-money')).toBeNull();
  });

  it('çok şapkalı kullanıcıda dört sekme, tasarımın sırasıyla', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(meResponse(['accounting', 'courier', 'admin', 'warehouse'])),
    );

    await renderShell('/courier');

    expect(await screen.findByTestId('operations-tabs')).toBeOnTheScreen();
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Kurye',
      'Depo',
      'Yönetim',
      'Para',
    ]);
    expect(screen.getByRole('tab', { name: 'Kurye', selected: true })).toBeOnTheScreen();
  });

  it('iki şapkada YALNIZ o iki sekme çizilir (dördü değil)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(meResponse(['courier', 'accounting'])));

    await renderShell('/courier');

    expect(await screen.findByTestId('operations-tabs')).toBeOnTheScreen();
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual(['Kurye', 'Para']);
  });

  it('sekmeye dokunmak bölümü değiştirir', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(meResponse(['courier', 'admin'])));

    const { app } = await renderShell('/courier');
    await screen.findByTestId('operations-tabs');

    await fireEvent.press(screen.getByRole('tab', { name: 'Yönetim' }));

    expect(app).toHavePathname('/management');
    expect(screen.getByRole('header', { name: 'Karar Kutusu' })).toBeOnTheScreen();
  });
});

describe('operasyon kabuğu — bildirim kapısı', () => {
  it('zil bildirim ekranını açar; yığına girilince sekme çubuğu kaybolur', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(meResponse(['courier', 'admin'])));

    const { app } = await renderShell('/courier');
    await screen.findByTestId('operations-tabs');

    await fireEvent.press(screen.getByTestId('operations-bell'));

    expect(app).toHavePathname('/notifications');
    expect(screen.getByRole('header', { name: 'Bildirimler' })).toBeOnTheScreen();
    // Tasarımın kuralı: çubuk yalnız bölüm KÖKLERİNDE (v2 `tabsVisible: isRoot && …`).
    expect(screen.queryByTestId('operations-tabs')).toBeNull();
  });

  it('bildirim satırına basmak GERÇEKTEN o bölümün adresini açar', async () => {
    /* Fixture dönemi kapandı (14.13): satır artık UÇTAN gelir — mock adrese göre ayrışır. Satır
       gerçek eşlemeden geçer (`document_undeliverable` → yönetim), yani basış yalnız gezinmeyi
       değil kind→bölüm çevirisini de uçtan uca sınar. Rol de ona göre: kurye + admin (yönetim). */
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        String(url).includes('/me/notifications')
          ? notificationsResponse([
              {
                id: '00000000-0000-4000-8000-0000000000b1', // zarf uuid doğrular — takma ad parse'ı düşürür
                kind: 'document_undeliverable',
                targetType: 'order',
                targetId: '00000000-0000-4000-8000-000000000009',
                payload: { referenceNo: 'LA-26-TEST' },
                createdAt: new Date().toISOString(),
                readAt: null,
              },
            ])
          : meResponse(['courier', 'admin']),
      ),
    );

    const { app } = await renderShell('/courier');
    await screen.findByTestId('operations-tabs');
    await fireEvent.press(screen.getByTestId('operations-bell'));

    await fireEvent.press(await screen.findByTestId('operations-notification-00000000-0000-4000-8000-0000000000b1'));

    expect(app).toHavePathname('/management');
    expect(await screen.findByTestId('operations-section-management')).toBeOnTheScreen();
  });

  it('PARA bölümünde zil YOKTUR — tasarım oraya metin eylemi koyuyor (v2:719)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(meResponse(['accounting'])));

    await renderShell('/money');

    expect(await screen.findByTestId('operations-section-money')).toBeOnTheScreen();
    expect(screen.queryByTestId('operations-bell')).toBeNull();
  });
});
