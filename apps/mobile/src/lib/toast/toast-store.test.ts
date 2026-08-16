import { act, renderHook } from '@testing-library/react-native';

import { toastSuccess, useToastMessage } from './toast-store';

/*
  TOAST DEPOSU — v3 `toastM` sözleşmesinin kanıtı: mesaj 2400 ms görünür, art arda basımda
  YENİ mesaj eskinin sayacını sıfırlar (ilk mesajın artığı ikincinin süresini yemez).
  Depo modül-durumlu; testler kendi bastıklarını süre akıtarak temizler. `act` çağrıları
  async: RNTL 13 eşzamanlı render'ında dış-depo güncellemesi ancak akış boşalınca yansır.
*/

jest.useFakeTimers();

describe('toast-store', () => {
  afterEach(async () => {
    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('basılan mesaj görünür ve 2400 ms sonra kendiliğinden düşer', async () => {
    const { result } = await renderHook(() => useToastMessage());
    expect(result.current).toBeNull();

    await act(async () => toastSuccess('Sepete eklendi ✓'));
    expect(result.current).toBe('Sepete eklendi ✓');

    await act(async () => {
      jest.advanceTimersByTime(2399);
    });
    expect(result.current).toBe('Sepete eklendi ✓');
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBeNull();
  });

  it('yeni mesaj eskinin sayacını SIFIRLAR — ikinci mesaj tam süresini yaşar', async () => {
    const { result } = await renderHook(() => useToastMessage());

    await act(async () => toastSuccess('İlk'));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    await act(async () => toastSuccess('İkinci'));

    // İlk mesajın artığı (400 ms) ikinciyi düşürmez.
    await act(async () => {
      jest.advanceTimersByTime(2399);
    });
    expect(result.current).toBe('İkinci');
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBeNull();
  });
});
