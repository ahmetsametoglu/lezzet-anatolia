import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Me } from '@/lib/api/me';
import messages from '@/lib/places/messages.json';
import authErrors from '@/lib/auth/error-messages.json';
import { meFixture } from '@/screens/operations/me-fixture';
import { PlaceNoticeSheet } from './place-notice-sheet';

/*
  "BURAYA DA GELİN" ÇEKMECESİ — GERÇEK akış telden (fetch mock'u): kod isteği → doğrulama →
  oturum → talep kaydı. Hiçbir katman taklit edilmiyor (`lib/auth/otp` ve `lib/api/places` gerçek
  yollarını koşuyor), yani zarf ve şema gerçekten kat ediliyor.

  KRİTİK İDDİA: kayıt çağrısının gövdesinde E-POSTA YOKTUR — oturum kurulduktan sonra adresi
  SUNUCU çözer (künye). Gövdeye adres koymak, başkasının yerine kayıt bırakılabilmesi demekti.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

/* Oturum DURUMLUDUR: doğrulama öncesi yok, `setSession`dan sonra var — kayıt çağrısının Bearer
   ile gittiği ancak böyle ölçülebilir. Ad `mock` ile başlamak ZORUNDA (jest hoisting). */
let mockSession: { access_token: string } | null = null;
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      setSession: async () => {
        mockSession = { access_token: 'access-1' };
        return { error: null };
      },
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

const t = messages.tr.placeNotice;

function reply(status: number, body: unknown): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

const SESSION = {
  session: {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresIn: 3600,
    expiresAt: null,
    tokenType: 'bearer',
  },
};

function meReply(overrides: Partial<Me> = {}): Response {
  return reply(200, { data: meFixture(['customer'], overrides), error: null });
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/** Mutlu yol: kod isteği · doğrulama · künye · kayıt — kayıt cevabı testten gelir. */
function mockFlow(noticeBody: unknown) {
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/auth/otp/request')) return Promise.resolve(reply(200, { data: true, error: null }));
    if (address.includes('/auth/otp/verify')) return Promise.resolve(reply(200, { data: SESSION, error: null }));
    if (address.includes('/api/v1/me')) return Promise.resolve(meReply());
    if (address.includes('/places/notice')) return Promise.resolve(reply(200, { data: noticeBody, error: null }));
    return Promise.resolve(reply(404, { data: null, error: 'not_found' }));
  });
}

/** Kayıt çağrısının gövdesi (JSON çözülmüş) — yoksa `null`. */
function noticeRequestBody(): Record<string, unknown> | null {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/places/notice'));
  const body = call?.[1]?.body;
  return typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : null;
}

const onRecorded = jest.fn();
const onClose = jest.fn();

function renderSheet() {
  return render(
    <PlaceNoticeSheet
      visible
      country="FR"
      postalCode="75001"
      source="app-catalog"
      onClose={onClose}
      onRecorded={onRecorded}
      testID="notice"
    />,
  );
}

/** E-posta adımından kod adımına iner — akış testlerinin ortak girişi. */
async function toCodeStage() {
  await fireEvent.changeText(screen.getByTestId('notice-email'), 'yeni@musteri.fr');
  await fireEvent.press(screen.getByTestId('notice-send'));
  await screen.findByTestId('notice-code');
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  onRecorded.mockReset();
  onClose.mockReset();
  mockSession = null;
});

describe('PlaceNoticeSheet', () => {
  it('biçimsiz e-posta ağa HİÇ çıkmaz', async () => {
    mockFlow({ status: 'ok' });
    await renderSheet();

    await fireEvent.changeText(screen.getByTestId('notice-email'), 'yeni@');
    await fireEvent.press(screen.getByTestId('notice-send'));

    expect(screen.getByText(t.emailInvalid)).toBeOnTheScreen();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('e-posta → kod adımı: adres ekranda, kod alanı açılır', async () => {
    mockFlow({ status: 'ok' });
    await renderSheet();
    await toCodeStage();

    expect(screen.getByText(t.sent.replace('{email}', 'yeni@musteri.fr'))).toBeOnTheScreen();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v1/auth/otp/request');
  });

  it('YANLIŞ kod: ortak auth sözlüğünden cümle, alan temizlenir, akış kod adımında kalır', async () => {
    fetchMock.mockImplementation((url) => {
      const address = String(url);
      if (address.includes('/auth/otp/request')) return Promise.resolve(reply(200, { data: true, error: null }));
      return Promise.resolve(reply(400, { data: null, error: 'invalid_code' }));
    });
    await renderSheet();
    await toCodeStage();

    await fireEvent.changeText(screen.getByTestId('notice-code'), '000000');

    expect(await screen.findByTestId('notice-code-error')).toHaveTextContent(authErrors.tr.invalid_code);
    expect(screen.getByTestId('notice-code')).toHaveProp('value', '');
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it('DOĞRU kod: hesap açılır, talep oturumla kaydedilir ve gövdede e-posta YOKTUR', async () => {
    mockFlow({ status: 'ok' });
    await renderSheet();
    await toCodeStage();

    await fireEvent.changeText(screen.getByTestId('notice-code'), '123456');

    expect(await screen.findByTestId('notice-result')).toHaveTextContent(t.recorded);
    expect(onRecorded).toHaveBeenCalledWith('ok');
    // Oturum cihaza yazıldı (kayıt çağrısı Bearer ile gitti) ve adres gövdeye KONMADI.
    expect(mockSession).not.toBeNull();
    expect(noticeRequestBody()).toEqual({ postalCode: '75001', country: 'FR', source: 'app-catalog' });
  });

  it('`already`: sessiz kalmaz, kendi cümlesini söyler', async () => {
    mockFlow({ status: 'already' });
    await renderSheet();
    await toCodeStage();

    await fireEvent.changeText(screen.getByTestId('notice-code'), '123456');

    expect(await screen.findByTestId('notice-result')).toHaveTextContent(t.alreadyRecorded);
    expect(onRecorded).toHaveBeenCalledWith('already');
  });

  it('`place_unknown`: kayıt ALINMADI denir ve yeniden denenebilir', async () => {
    mockFlow({ status: 'place_unknown' });
    await renderSheet();
    await toCodeStage();

    await fireEvent.changeText(screen.getByTestId('notice-code'), '123456');

    expect(await screen.findByTestId('notice-error')).toHaveTextContent(t.placeUnknown);
    expect(onRecorded).not.toHaveBeenCalled();

    // Tekrar deneme KAYDI yeniden dener (kodu değil): bu kez uç kaydı alır.
    mockFlow({ status: 'ok' });
    await fireEvent.press(screen.getByTestId('notice-retry'));

    await waitFor(() => expect(onRecorded).toHaveBeenCalledWith('ok'));
  });
});
