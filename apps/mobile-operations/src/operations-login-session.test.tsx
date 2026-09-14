import { act, waitFor } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import { meFixture } from '@lezzet/mobile-kit/src/testing/me-fixture';
import { renderShell } from '@lezzet/mobile-kit/src/testing/render-shell';

/*
  GİRİŞTEYKEN AÇILAN OTURUM (21.310 — cihazda ölçüldü 14.09).

  Oturumsuz soğuk açılışta kapı girişe geçip sökülüyor; otomatik giriş oturumu SONRA kurunca ekran girişte
  kalıyordu. Giriş rotası `SIGNED_IN`i dinliyor — YALNIZ onu: cihazda duran bir oturumun açılış ya da
  yenileme olayı girişi kapatsaydı, API'nin reddettiği ama auth sunucusuna ulaşılamadığı için korunan
  oturumda kapı ile giriş arasında döngü kurulurdu.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

type MockSession = { access_token: string } | null;
let mockSession: MockSession = null;
const mockAuthListeners = new Set<(event: string, session: MockSession) => void>();
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      onAuthStateChange: (listener: (event: string, session: MockSession) => void) => {
        mockAuthListeners.add(listener);
        return { data: { subscription: { unsubscribe: () => mockAuthListeners.delete(listener) } } };
      },
    },
  }),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function reply(status: number, body: unknown): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

/** Kapının iki okuması cevaplanır; bölüm ekranlarının okumaları 500 — ekranı etkiler, yönlendirmeyi değil. */
function server(input: Parameters<typeof fetch>[0]): Promise<Response> {
  const path = new URL(String(input)).pathname;
  if (path === '/api/v1/me') return Promise.resolve(reply(200, { data: meFixture(['courier']), error: null }));
  if (path === '/api/v1/operations/scope') {
    return Promise.resolve(reply(200, { data: { warehouses: [], resolvedId: null }, error: null }));
  }
  return Promise.resolve(reply(500, { data: null, error: 'internal' }));
}

function emit(event: string): void {
  mockAuthListeners.forEach((listener) => listener(event, mockSession));
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(server);
  mockAuthListeners.clear();
  mockSession = null;
});

describe('girişteyken açılan oturum (21.310)', () => {
  it('girişteyken oturum AÇILIRSA kapıya dönülür ve ilk bölüm açılır — otomatik girişin geç kalan oturumu', async () => {
    const { app } = await renderShell('/login');
    expect(await screen.findByTestId('login-scroll')).toBeOnTheScreen();

    mockSession = { access_token: 'test-token' };
    await act(async () => emit('SIGNED_IN'));

    await waitFor(() => expect(app).toHavePathname('/courier'));
  });

  it('YALNIZ yeni oturum — cihazda duran oturumun açılış ve yenileme olayı girişi kapatmaz (döngü olmasın)', async () => {
    mockSession = { access_token: 'reddedilen-token' };
    const { app } = await renderShell('/login');
    expect(await screen.findByTestId('login-scroll')).toBeOnTheScreen();

    await act(async () => emit('INITIAL_SESSION'));
    await act(async () => emit('TOKEN_REFRESHED'));

    expect(app).toHavePathname('/login');
  });
});
