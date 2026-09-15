import { renderHook } from '@testing-library/react-native';

import { useBellChannel } from './use-bell-channel.hook';

/*
  ORTAK ZİL KAYDI (15.35) — çivilenen tek kusur: aynı kanalı iki kanca dinlerken biri ayrılınca öteki SUSMAMALI.
  Supabase istemcisi aynı adlı kanala ikinci `channel()` çağrısında var olanı döndürüyor; kayıt olmadan kuyruk
  ekranından çıkmak, kökteki yeni mesaj sesinin kanalını da kapatırdı.
*/

const mockChannel = jest.fn();
const mockRemoveChannel = jest.fn();
let mockBroadcast: (() => void) | null = null;

jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    channel: (name: string) => {
      mockChannel(name);
      const kanal = {
        on: (_type: string, _filter: unknown, callback: () => void) => {
          mockBroadcast = callback;
          return kanal;
        },
        subscribe: () => kanal,
      };
      return kanal;
    },
    removeChannel: mockRemoveChannel,
  }),
}));

beforeEach(() => {
  mockChannel.mockClear();
  mockRemoveChannel.mockClear();
  mockBroadcast = null;
});

describe('useBellChannel — kanal başına tek abonelik', () => {
  it('aynı kanalı dinleyen iki kanca TEK abonelik açar ve zil ikisine de ulaşır', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const a = await renderHook(() => useBellChannel('ops:conversations:t', first));
    const b = await renderHook(() => useBellChannel('ops:conversations:t', second));

    expect(mockChannel).toHaveBeenCalledTimes(1);
    mockBroadcast?.();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    await a.unmount();
    await b.unmount();
  });

  it('biri ayrılınca kanal KAPANMAZ, öteki duymaya devam eder; son ayrılan kapatır', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const a = await renderHook(() => useBellChannel('ops:conversations:t', first));
    const b = await renderHook(() => useBellChannel('ops:conversations:t', second));

    await a.unmount();
    expect(mockRemoveChannel).not.toHaveBeenCalled();
    mockBroadcast?.();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    await b.unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('kanal adı henüz yoksa (null) abonelik açılmaz', async () => {
    const view = await renderHook(() => useBellChannel(null, jest.fn()));
    expect(mockChannel).not.toHaveBeenCalled();
    await view.unmount();
  });
});
