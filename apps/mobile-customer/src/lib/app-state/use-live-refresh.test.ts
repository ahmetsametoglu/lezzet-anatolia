import { renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useLiveRefresh } from './use-live-refresh';

/*
  CANLI TAZELEME — çivilenen iki şey: GEÇİŞİN OKUNMASI ve SAYACIN SINIRI.

  Geçiş: `active` durumunu görünce tazelemek yanlıştı — iOS bildirim merkezi aşağı çekilince
  `active → inactive → active` üretiyor ve her sıyırmada bir istek giderdi. Katı `background →
  active` ise ters yönde yanlış: gerçek dönüşte `active`ten hemen önceki hâl `inactive`tir.
  Ölçüt "arka planı görmüş olmak".

  Sayaç: ekranda bekleyen kullanıcı için var ama arka planda susmalı — görünmeyen bir ekran için
  tel açmak olurdu. İkisinin bedeli de sessizdir: ekran doğru görünür, tel gereksiz konuşur.

  Dinleyici FETCH seviyesinde değil `AppState` seviyesinde taklit ediliyor: ölçülen şey ağ değil,
  tetikleyicinin kendisi.
*/

let listener: ((state: AppStateStatus) => void) | null = null;
const remove = jest.fn();

beforeEach(() => {
  listener = null;
  remove.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    listener = handler as (state: AppStateStatus) => void;
    return { remove } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Kancanın başlangıç hâli `AppState.currentState`ten okunuyor — testler onu açıkça kuruyor. */
async function mountWith(initial: AppStateStatus, refresh: () => void) {
  Object.defineProperty(AppState, 'currentState', { value: initial, configurable: true });
  // `renderHook` bu sürümde SÖZ döndürüyor (depodaki bütün çağrılar `await`li) — beklenmezse
  // kanca hiç monte olmaz ve dinleyici kurulmadan iddia edilir.
  return renderHook(() => useLiveRefresh(refresh, { intervalMs: 0 }));
}

describe('öne gelince tazeleme', () => {
  it('arka plandan dönüşte tazeler', async () => {
    const refresh = jest.fn();
    await mountWith('active', refresh);

    listener?.('background');
    listener?.('active');

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('active → inactive → active SIYIRMASI tazelemez — bildirim merkezi bir dönüş değildir', async () => {
    const refresh = jest.fn();
    await mountWith('active', refresh);

    listener?.('inactive');
    listener?.('active');

    /* `inactive` arka plan DEĞİLDİR: uygulama hâlâ öndedir, yalnız bir sistem katmanı üstüne
       binmiştir. Burada tazelemek her sıyırmada bir istek demekti. */
    expect(refresh).not.toHaveBeenCalled();
  });

  it('iOS\'un GERÇEK dönüşünü kaçırmaz: background → inactive → active', async () => {
    const refresh = jest.fn();
    await mountWith('active', refresh);

    // Çıkış ve dönüş; `active`ten hemen önceki hâl `background` DEĞİL, `inactive`. Ölçüt "arka
    // planı gördük mü" olmasaydı bu gerçek dönüş sessizce kaçardı.
    listener?.('inactive');
    listener?.('background');
    listener?.('inactive');
    listener?.('active');

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('bir dönüş BİR kez tazeler — ardından gelen sıyırmalar tetiklemez', async () => {
    const refresh = jest.fn();
    await mountWith('active', refresh);

    listener?.('background');
    listener?.('active');
    listener?.('inactive');
    listener?.('active');

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('montajda TAZELEMEZ — ilk okuma çağıranın kendi efektinin işi', async () => {
    const refresh = jest.fn();
    await mountWith('active', refresh);

    expect(refresh).not.toHaveBeenCalled();
  });

  it('EN SON verilen fonksiyonu çağırır — abonelik her çizimde sökülmez', async () => {
    const ilk = jest.fn();
    const sonraki = jest.fn();
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    const { rerender } = await renderHook(({ fn }: { fn: () => void }) => useLiveRefresh(fn, { intervalMs: 0 }), {
      initialProps: { fn: ilk },
    });

    await rerender({ fn: sonraki });
    listener?.('background');
    listener?.('active');

    expect(ilk).not.toHaveBeenCalled();
    expect(sonraki).toHaveBeenCalledTimes(1);
    // Abonelik BİR kez kuruldu: yeniden çizim onu sökmedi (sökseydi geçiş kaybolabilirdi).
    expect(remove).not.toHaveBeenCalled();
  });

  it('sökülünce aboneliği bırakır', async () => {
    const { unmount } = await mountWith('active', jest.fn());

    await unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  describe('süre', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('ekranda beklerken düzenli tazeler', async () => {
      const refresh = jest.fn();
      Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
      await renderHook(() => useLiveRefresh(refresh, { intervalMs: 1000 }));

      jest.advanceTimersByTime(3000);

      expect(refresh).toHaveBeenCalledTimes(3);
    });

    it('ARKA PLANDA sayaç tıklasa da tazelemez — görünmeyen ekran tel açmaz', async () => {
      const refresh = jest.fn();
      Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
      await renderHook(() => useLiveRefresh(refresh, { intervalMs: 1000 }));

      jest.advanceTimersByTime(3000);

      expect(refresh).not.toHaveBeenCalled();
    });

    it('`intervalMs: 0` süreli tazelemeyi kapatır', async () => {
      const refresh = jest.fn();
      Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
      await renderHook(() => useLiveRefresh(refresh, { intervalMs: 0 }));

      jest.advanceTimersByTime(10_000);

      expect(refresh).not.toHaveBeenCalled();
    });
  });
});
