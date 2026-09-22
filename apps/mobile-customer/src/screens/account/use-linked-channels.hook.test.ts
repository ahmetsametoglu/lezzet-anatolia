import { act, renderHook } from '@testing-library/react-native';
import { AppState, Linking, type AppStateStatus } from 'react-native';

import { useLinkedChannels } from './use-linked-channels.hook';

/*
  Kanca kodu mesaja koymazsa müşteri gönderdiği hâlde bağ kurulmaz; dönüşte okumazsa kurulan bağ görünmez; bağ görüldükten sonra da
  okumaya devam ederse her dönüş sunucuya boşuna gider.
*/

const mockFetchChannels = jest.fn();
const mockRequestWhatsappLink = jest.fn();
jest.mock('@/lib/api/channels', () => ({
  fetchChannels: () => mockFetchChannels(),
  requestWhatsappLink: () => mockRequestWhatsappLink(),
}));

const ok = <T>(data: T) => ({ data, error: null, status: 200, retryAfterSec: null });
const withNumbers = (numbers: string[]) =>
  ok({ channels: [{ source: 'whatsapp', linked: numbers.length > 0, since: null, numbers }] });
const whatsappNumbers = (channels: { source: string; numbers: string[] }[] | null) =>
  channels?.find((channel) => channel.source === 'whatsapp')?.numbers;

let listener: ((state: AppStateStatus) => void) | null = null;

beforeEach(() => {
  listener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    listener = handler as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  mockFetchChannels.mockReset();
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
  mockFetchChannels.mockResolvedValueOnce(withNumbers([])).mockResolvedValue(withNumbers(['+33612345678']));
  mockRequestWhatsappLink.mockResolvedValue(ok({ code: 'LA-WA-ABCDEFGHJKMN', expiresAt: new Date(Date.now() + 60_000).toISOString() }));

  const { result } = await renderHook(() => useLinkedChannels(true, 'Bonjour !'));
  await act(async () => {});
  expect(whatsappNumbers(result.current.channels)).toEqual([]);

  await act(async () => {
    await result.current.startWhatsapp();
  });
  const url = String(openURL.mock.calls[0]?.[0]);
  expect(decodeURIComponent(url)).toContain('Bonjour ! LA-WA-ABCDEFGHJKMN');

  await comeBack();
  expect(whatsappNumbers(result.current.channels)).toEqual(['+33612345678']);
  expect(mockFetchChannels).toHaveBeenCalledTimes(2);

  await comeBack();
  expect(mockFetchChannels).toHaveBeenCalledTimes(2);
});

it('bağlama başlatılmadıysa dönüş sunucuya gitmez', async () => {
  mockFetchChannels.mockResolvedValue(withNumbers([]));

  const { result } = await renderHook(() => useLinkedChannels(true, 'Bonjour !'));
  await act(async () => {});
  expect(whatsappNumbers(result.current.channels)).toEqual([]);

  await comeBack();
  expect(mockFetchChannels).toHaveBeenCalledTimes(1);
});
