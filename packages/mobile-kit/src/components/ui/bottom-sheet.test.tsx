import { customerAppText } from '@lezzet/design-tokens';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import type React from 'react';
import { BackHandler, Keyboard, Text } from 'react-native';

import { BottomSheet } from './bottom-sheet';
import { customerStops } from '../../theme/unistyles';

// Çeviri temanın kullandığının aynısı: px→dp ve müşteri yüzeyinin bir kademesi.
const appText = customerStops(customerAppText);

describe('BottomSheet', () => {
  it('kapalıyken içeriğini HİÇ çizmez', async () => {
    await render(
      <BottomSheet visible={false} title="Sırala & filtrele" onClose={jest.fn()}>
        <Text>Önerilen</Text>
      </BottomSheet>,
    );

    expect(screen.queryByText('Önerilen')).toBeNull();
  });

  it('açıkken başlığı header rolüyle duyurur ve yuvayı çizer', async () => {
    await render(
      <BottomSheet visible title="Sırala & filtrele" onClose={jest.fn()}>
        <Text>Önerilen</Text>
      </BottomSheet>,
    );

    expect(screen.getByRole('header')).toHaveTextContent('Sırala & filtrele');
    expect(screen.getByText('Önerilen')).toBeOnTheScreen();
  });

  it('örtüye dokunmak kapatır', async () => {
    const onClose = jest.fn();
    await render(
      <BottomSheet visible title="Sırala" onClose={onClose} testID="sheet">
        <Text>içerik</Text>
      </BottomSheet>,
    );

    await fireEvent(screen.getByTestId('gorhom-self-dismiss'), 'touchEnd');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onClosed kapanış TAMAMLANINCA çağrılır — örtü dokunuşu tek başına yetmez (21.121)', async () => {
    const onClose = jest.fn();
    const onClosed = jest.fn();
    const sheet = (visible: boolean) => (
      <BottomSheet visible={visible} title="Sırala" onClose={onClose} onClosed={onClosed} testID="sheet">
        <Text>içerik</Text>
      </BottomSheet>
    );
    const { rerender } = await render(sheet(true));

    // Örtü yalnız NİYETİ çağırır — görünürlük hâlâ çağıranın elindedir, söküm başlamamıştır.
    await fireEvent(screen.getByTestId('gorhom-self-dismiss'), 'touchEnd');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();

    // Çağıran görünürlüğü düşürünce kapanış animasyonu koşar; onClosed sökümün ARDINDAN bir
    // kare ertelemeyle gelir — çekmeceden kök değiştiren eylemler (personel→müşteri köprüsü)
    // yönlendirmeyi ona bağlar, basışa değil: basış anında replace cihazda 4/4 Fabric
    // çökmesiydi (bileşendeki künye).
    await rerender(sheet(false));
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
  });

  it("Android'in geri hareketi de kapatır — çizili değil ama platformun sözü", async () => {
    const onClose = jest.fn();
    const onBack = jest.spyOn(BackHandler, 'addEventListener');
    await render(
      <BottomSheet visible title="Sırala" onClose={onClose} testID="sheet">
        <Text>içerik</Text>
      </BottomSheet>,
    );

    /* Kütüphane geri tuşunu dinlemediği için söz kitte `BackHandler` ile tutuluyor; jest sahtesi geri tuşu sunmadığından kayıt elle tetiklenir. */
    const back = onBack.mock.calls.at(-1)?.[1] as (() => boolean) | undefined;
    expect(back).toBeDefined();
    await act(async () => {
      back?.();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Ekran değişince kapanmasaydı çekmece kök portalda kalıp bildirimle açılan yeni ekranı örterdi; bu test o hâlde kırmızıya döner.
  it('çekmecenin ekranı arka plana geçince kapanma istenir', async () => {
    const onClose = jest.fn();
    const listeners = new Map<string, () => void>();
    const navigation = {
      addListener: jest.fn((event: string, listener: () => void) => {
        listeners.set(event, listener);
        return () => listeners.delete(event);
      }),
    } as unknown as React.ContextType<typeof NavigationContext>;
    await render(
      <NavigationContext value={navigation}>
        <BottomSheet visible title="Écrivez-nous" onClose={onClose}>
          <Text>içerik</Text>
        </BottomSheet>
      </NavigationContext>,
    );

    await act(async () => {
      listeners.get('blur')?.();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('açılan çekmece klavyeyi kapatır — o klavye ARKADAKİ ekranın kutusunundur (07.09)', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const sheet = (visible: boolean) => (
      <BottomSheet visible={visible} title="Aksiyonlar" onClose={jest.fn()}>
        <Text>içerik</Text>
      </BottomSheet>
    );
    const { rerender } = await render(sheet(false));

    // Kapalı çekmece klavyeye DOKUNMAZ: ekranın kutusu kendi işini görüyor olabilir.
    expect(dismiss).not.toHaveBeenCalled();

    await rerender(sheet(true));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('örtü ve başlık kademesi TEMADAN gelir (ham değer yok)', async () => {
    await render(
      <BottomSheet visible title="Sırala" onClose={jest.fn()} testID="sheet">
        <Text>içerik</Text>
      </BottomSheet>,
    );
    expect(screen.getByRole('header')).toHaveStyle({
      fontSize: appText['sheet-title'],
    });
  });
});
