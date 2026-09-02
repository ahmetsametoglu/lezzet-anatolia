import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsKeypadPanel } from './keypad-panel';

/*
  TUŞ TAKIMI GÖVDESİ — iki iddia, ikisi de ölçülmüş arızalardan doğdu.

  1. **Izgara KABI ÖLÇEREK bölünür.** Genişlik `flexBasis: '30%'` ile yazılmıştı ve adet
     çekmecesinin içinde on bir tuşun hepsi tek satıra ince şeritler hâlinde dizildi (cihazda
     görüldü 02.09). Aynı arıza komşu ızgarada da ölçülmüştü. Bu test yüzdeye dönüşü kırar.
  2. **Virgül ondalıksız alanda HİÇ çizilmez.** Engelli bir tuş "burada bir şey var ama olmuyor"
     der; olmayan bir tuş "öyle bir şey yok" der — yarım paket diye bir şey olmadığı için doğrusu
     ikincisi.
*/

const COPY = {
  unit: 'adet',
  confirmLabel: 'Yaz',
  hint: 'Yazdığın sayı TOPLAM olur.',
  deleteLabel: 'Son rakamı sil',
};

function renderPanel(overrides: { allowDecimals?: boolean; onConfirm?: (text: string) => void } = {}) {
  return render(
    <OperationsKeypadPanel
      value=""
      {...COPY}
      allowDecimals={overrides.allowDecimals ?? false}
      onConfirm={overrides.onConfirm ?? jest.fn()}
      testID="keypad"
    />,
  );
}

/** Kabın ölçüldüğü an — gerçekte yerleşim motorundan gelir, testte elle sürülür. */
async function measureGrid(width: number) {
  await fireEvent(screen.getByTestId('keypad-key-1').parent!, 'layout', {
    nativeEvent: { layout: { width, height: 200, x: 0, y: 0 } },
  });
}

describe('OperationsKeypadPanel', () => {
  it('tuş genişliği ÖLÇÜLEN kaptan gelir — yüzde taban değil', async () => {
    await renderPanel();
    await measureGrid(300);

    // (300 − iki boşluk) / 3 sütun. Boşluk kitin `space.md`si (8).
    const style = screen.getByTestId('keypad-key-1').props.style as Array<{ width?: number } | null>;
    const widths = style.flat().filter((entry): entry is { width: number } => entry?.width !== undefined);
    expect(widths[0]?.width).toBeCloseTo((300 - 16) / 3);
  });

  it('ÖLÇÜM GELMEDEN tuş çizilir — ilk kare boş kalmaz', async () => {
    await renderPanel();

    expect(screen.getByTestId('keypad-key-9')).toBeTruthy();
  });

  it('ondalıksız alanda virgül tuşu YOKTUR', async () => {
    await renderPanel({ allowDecimals: false });

    expect(screen.queryByTestId('keypad-key-,')).toBeNull();
    expect(screen.getByTestId('keypad-key-00')).toBeTruthy();
  });

  it('değer ancak ONAYLANINCA çıkar — her tuşta değil', async () => {
    const onConfirm = jest.fn();
    await renderPanel({ onConfirm });

    await fireEvent.press(screen.getByTestId('keypad-key-4'));
    await fireEvent.press(screen.getByTestId('keypad-key-0'));
    expect(onConfirm).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('keypad-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('40');
  });
});
