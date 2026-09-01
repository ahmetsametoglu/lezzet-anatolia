import { customerAppText } from '@lezzet/design-tokens';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BackHandler, Text } from 'react-native';

import { BottomSheet } from './bottom-sheet';
import { customerStops } from '../../theme/unistyles';

// Çeviri temanın kullandığının aynısı: px→dp + müşteri yüzeyinin bir kademesi (18.08).
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

    /* Kanca artık `Modal.onRequestClose` DEĞİL, `BackHandler` — kütüphane geri tuşunu dinlemiyor
       (kaynağı okundu 01.09) ve söz KİTTE tutuluyor. RN'in jest sahtesi `mockPressBack` sunmuyor,
       o yüzden kaydı yakalayıp elle tetikliyoruz. */
    const back = onBack.mock.calls.at(-1)?.[1] as (() => boolean) | undefined;
    expect(back).toBeDefined();
    await act(async () => {
      back?.();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
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
