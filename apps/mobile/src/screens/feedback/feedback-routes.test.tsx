import { screen, waitFor } from '@testing-library/react-native';

import { renderShell } from '@/testing/render-shell';
import { feedbackInvite } from './feedback-fixture';

/*
  GERİ BİLDİRİM ROTASININ SMOKE TESTİ — rota dosyası GERÇEK (`./src/app` diskten taranır).
  Doğrulanan ekranın içi değil, derin bağlantı ADRESİNİN var olduğu ve token'ı ekrana taşıdığıdır:
  bu rotaya uygulama içinden gidilmez, mail/bildirim bağlantısından gelinir — adres kanıtsız
  kalsaydı kırık bir mail bağlantısını ilk müşteri bulurdu.

  AĞ MOCK'LANIR: ekran daveti gerçek uçtan okuyor (10.08) — rota testi de o yolu kateder, çünkü
  token'ın ekrana ULAŞTIĞINI ancak istekteki adresle kanıtlayabiliriz.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

/* Onboarding bayrağı "görüldü": derin bağlantı senaryosu ilk açılış DEĞİLDİR — davet maili
   kurulu bir cihaza gelir. Bayrak mock'lanmasa kök kapı her rotayı `/onboarding`e çevirir.
   Anlık görüntü SABİT nesne: `useSyncExternalStore` her çağrıda yeni nesne görürse sonsuz
   yeniden çizime girer (ölçüldü — "Maximum update depth exceeded"). */
jest.mock('@/lib/onboarding/onboarding-store', () => {
  const snapshot = { done: true };
  return {
    getOnboardingSnapshot: () => snapshot,
    subscribeOnboarding: () => () => {},
  };
});

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/** Token'ı adresinden tanıyan kapı: geçerli davet 200, eskimiş olan 404 `invalid_link`. */
function respond(input: RequestInfo | URL): Response {
  const found = String(input).includes('/feedback/gecerli-davet');
  return {
    status: found ? 200 : 404,
    headers: { get: () => null },
    json: async () => (found ? { data: feedbackInvite(), error: null } : { data: null, error: 'invalid_link' }),
  } as unknown as Response;
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((input) => Promise.resolve(respond(input)));
});

describe('geri bildirim rotası', () => {
  it('/feedback/<token> daveti açar ve oy aşamasıyla başlar', async () => {
    const { app } = await renderShell('/feedback/gecerli-davet');

    expect(app).toHavePathname('/feedback/gecerli-davet');
    await waitFor(() => expect(screen.getByTestId('feedback-vote')).toBeOnTheScreen());
  });

  it('bilinmeyen token aynı rotada "bulunamadı" durumunu açar', async () => {
    const { app } = await renderShell('/feedback/eskimis-baglanti');

    expect(app).toHavePathname('/feedback/eskimis-baglanti');
    await waitFor(() => expect(screen.getByTestId('feedback-notfound')).toBeOnTheScreen());
  });
});
