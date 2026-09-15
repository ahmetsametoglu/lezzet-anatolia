import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMessageChime } from './use-message-chime.hook';

/*
  YENİ MESAJ SESİ (15.35) — çivilenen davranışlar, beşi de kullanıcının sorduğu sorulardan:
  1. Yönetici değilse hiç okuma yok (kuyruk ucu yönetici kapısında; okuma 403 alırdı).
  2. Açılıştaki ilk ölçüm SES ÇALDIRMAZ — bekleyen eski mesajlar "yeni" değil.
  3. Zil çaldı ama gelen mesaj yok (ajan taslağı, bizim cevabımız) → ses yok.
  4. Arka planda ses yok ve taban ilerlemez; öne dönüşte arada gelen mesaj BİR KEZ çalar.
  5. Art arda mesajda bekleme süresi içinde ikinci ses yok.
  Sesin gerçekten çalması yerel bir yetenek (`testing/expo-audio.mock.ts` künyesi) — burada ölçülen, çalma
  KARARI.
*/

const mockFetchInbox = jest.fn();
jest.mock('@/lib/api/social', () => ({
  fetchSocialInbox: (...args: unknown[]) => mockFetchInbox(...args),
}));

let mockBroadcast: (() => void) | null = null;
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    channel: () => {
      const kanal = {
        on: (_type: string, _filter: unknown, callback: () => void) => {
          mockBroadcast = callback;
          return kanal;
        },
        subscribe: () => kanal,
      };
      return kanal;
    },
    removeChannel: jest.fn(),
  }),
}));

// Kalıcı bir çalar: sahtenin varsayılanı her çağrıda yeni nesne verir, "kaç kez çaldı" sayılamazdı.
const mockPlay = jest.fn();
const mockSeekTo = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: mockPlay, seekTo: mockSeekTo }),
}));

const mockHaptic = jest.fn();
jest.mock('@lezzet/mobile-kit/src/lib/haptics/haptics', () => ({
  hapticSuccess: () => mockHaptic(),
}));

const T0 = '2026-09-15T08:00:00.000Z';
const T1 = '2026-09-15T08:00:05.000Z';
const T2 = '2026-09-15T08:00:06.000Z';

function inbox(lastInboundAt: string | null) {
  return {
    data: {
      rows: lastInboundAt ? [{ lastInboundAt }] : [],
      nextCursor: null,
      counts: { awaitingReply: 1, handledByAi: 0 },
      channel: 'ops:conversations:t',
    },
    error: null,
    status: 200,
    retryAfterSec: null,
  };
}

let appStateListener: ((state: AppStateStatus) => void) | null = null;

// RN'nin jest sahtesinde `currentState` bir FONKSİYON (ölçüldü: `jest.replaceProperty` "is a function" diye
// reddetti); gerçek modülde bir dize. Kancanın okuduğu değer doğrudan kurulur, paket sonunda geri konur.
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
function setAppState(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true, writable: true });
}

afterAll(() => {
  if (originalAppState) Object.defineProperty(AppState, 'currentState', originalAppState);
});

beforeEach(() => {
  mockFetchInbox.mockReset();
  mockPlay.mockClear();
  mockHaptic.mockClear();
  mockBroadcast = null;
  appStateListener = null;
  setAppState('active');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Açılış ölçümü bitip zil kanalı kurulana kadar bekler. */
async function mounted(enabled = true) {
  const view = await renderHook(() => useMessageChime(enabled));
  if (enabled) await waitFor(() => expect(mockBroadcast).not.toBeNull());
  return view;
}

async function ring(lastInboundAt: string | null) {
  mockFetchInbox.mockResolvedValueOnce(inbox(lastInboundAt));
  await act(async () => {
    mockBroadcast?.();
  });
}

describe('useMessageChime — uygulama açıkken yeni mesaj sesi', () => {
  it('yönetici değilse kuyruğu hiç okumaz', async () => {
    await mounted(false);
    expect(mockFetchInbox).not.toHaveBeenCalled();
  });

  it('açılıştaki ilk ölçüm çalmaz; yeni gelen mesajda bir kez tını + titreşim, yalnız ilk satır istenir', async () => {
    mockFetchInbox.mockResolvedValueOnce(inbox(T0));
    await mounted();
    expect(mockPlay).not.toHaveBeenCalled();

    await ring(T1);
    await waitFor(() => expect(mockPlay).toHaveBeenCalledTimes(1));
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(mockFetchInbox).toHaveBeenLastCalledWith({ limit: 1 });
  });

  it('zil çaldı ama müşteriden mesaj gelmedi (taslak, bizim cevabımız) — ses yok', async () => {
    mockFetchInbox.mockResolvedValueOnce(inbox(T0));
    await mounted();

    await ring(T0);
    await waitFor(() => expect(mockFetchInbox).toHaveBeenCalledTimes(2));
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('arka planda ses yok ve taban ilerlemez; öne dönüşte arada gelen mesaj bir kez çalar', async () => {
    mockFetchInbox.mockResolvedValueOnce(inbox(T0));
    await mounted();

    setAppState('background');
    await ring(T1);
    await waitFor(() => expect(mockFetchInbox).toHaveBeenCalledTimes(2));
    expect(mockPlay).not.toHaveBeenCalled();

    setAppState('active');
    mockFetchInbox.mockResolvedValueOnce(inbox(T1));
    await act(async () => {
      appStateListener?.('active');
    });
    await waitFor(() => expect(mockPlay).toHaveBeenCalledTimes(1));
  });

  it('art arda mesajda bekleme süresi içinde ikinci ses yok', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    mockFetchInbox.mockResolvedValueOnce(inbox(T0));
    await mounted();

    await ring(T1);
    await waitFor(() => expect(mockPlay).toHaveBeenCalledTimes(1));
    await ring(T2);
    await waitFor(() => expect(mockFetchInbox).toHaveBeenCalledTimes(3));
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });
});
