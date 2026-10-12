import { screen, waitFor } from '@testing-library/react-native';

import { renderShell } from '@lezzet/mobile-kit/src/testing/render-shell';
import { feedbackInvite } from './feedback-fixture';

/*
  Rota dosyası gerçektir (`./src/app` diskten taranır): bu rotaya uygulama içinden gidilmez, e-postadaki bağlantıdan gelinir, bu yüzden
  adresin var olduğu ve belirteci ekrana taşıdığı ancak burada kanıtlanır. Ağ sahtedir, çünkü belirtecin ekrana ulaştığı istekteki adresten okunur.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

/* Derin bağlantı kurulu bir cihaza gelir, bu yüzden tanıtım "görüldü" sayılır; yoksa kök kapı her rotayı `/onboarding`e çevirir.
   Anlık görüntü sabit nesnedir, çünkü `useSyncExternalStore` her çağrıda yeni nesne görürse sonsuz yeniden çizime girer. */
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
  it('/feedback/<token> daveti açar ve ürün listesiyle başlar', async () => {
    const { app } = await renderShell('/feedback/gecerli-davet');

    expect(app).toHavePathname('/feedback/gecerli-davet');
    await waitFor(() => expect(screen.getByTestId('feedback-list')).toBeOnTheScreen());
  });

  it('bilinmeyen token aynı rotada "bulunamadı" durumunu açar', async () => {
    const { app } = await renderShell('/feedback/eskimis-baglanti');

    expect(app).toHavePathname('/feedback/eskimis-baglanti');
    await waitFor(() => expect(screen.getByTestId('feedback-notfound')).toBeOnTheScreen());
  });
});
