import { act, renderHook } from '@testing-library/react-native';
import { AppState, Linking, type AppStateStatus } from 'react-native';

import { useWhatsappLink } from './use-whatsapp-link.hook';

/*
  Kanca kodu mesaja koymazsa müşteri gönderdiği hâlde bağ kurulmaz; dönüşte okumazsa kurulan bağ görünmez; bağ görüldükten sonra da
  okumaya devam ederse her dönüş sunucuya boşuna gider.
*/

const mockFetchWhatsapp = jest.fn();
const mockRequestWhatsappLink = jest.fn();
jest.mock('@/lib/api/whatsapp', () => ({
  fetchWhatsapp: () => mockFetchWhatsapp(),
  requestWhatsappLink: () => mockRequestWhatsappLink(),
}));

const ok = <T>(data: T) => ({ data, error: null, status: 200, retryAfterSec: null });

let listener: ((state: AppStateStatus) => void) | null = null;

beforeEach(() => {
  listener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    listener = handler as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  mockFetchWhatsapp.mockReset();
  mockRequestWhatsappLink.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function comeBack() {
  await act(async () => {
    listener?.('background');
    listener?.('active');
  });
}

it('kodu hazır mesajla açar, dönüşte bağı okur ve bağ görülünce okumayı bırakır', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  mockFetchWhatsapp.mockResolvedValueOnce(ok({ numbers: [] })).mockResolvedValue(ok({ numbers: ['+33612345678'] }));
  mockRequestWhatsappLink.mockResolvedValue(ok({ code: 'LA-WA-ABCDEFGHJKMN', expiresAt: new Date(Date.now() + 60_000).toISOString() }));

  const { result } = await renderHook(() => useWhatsappLink(true, 'Bonjour !'));
  await act(async () => {});
  expect(result.current.numbers).toEqual([]);

  await act(async () => {
    await result.current.start();
  });
  const url = String(openURL.mock.calls[0]?.[0]);
  expect(decodeURIComponent(url)).toContain('Bonjour ! LA-WA-ABCDEFGHJKMN');

  await comeBack();
  expect(result.current.numbers).toEqual(['+33612345678']);
  expect(mockFetchWhatsapp).toHaveBeenCalledTimes(2);

  await comeBack();
  expect(mockFetchWhatsapp).toHaveBeenCalledTimes(2);
});

it('bağlama başlatılmadıysa dönüş sunucuya gitmez', async () => {
  mockFetchWhatsapp.mockResolvedValue(ok({ numbers: [] }));

  const { result } = await renderHook(() => useWhatsappLink(true, 'Bonjour !'));
  await act(async () => {});
  expect(result.current.numbers).toEqual([]);

  await comeBack();
  expect(mockFetchWhatsapp).toHaveBeenCalledTimes(1);
});
