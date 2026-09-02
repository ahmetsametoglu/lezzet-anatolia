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

  /* CANLI kip (kullanıcı kararı 02.09): adet her tuşta çağırana gider ve onay satırı HİÇ
     çizilmez — çekmeceyi kapatmak yeter. */
  it('canlı kipte her tuş çağırana gider ve onay düğmesi YOKTUR', async () => {
    const onChange = jest.fn();
    await render(
      <OperationsKeypadPanel value="0" unit="adet" hint="" deleteLabel="sil" allowDecimals={false} onChange={onChange} testID="keypad" />,
    );

    await fireEvent.press(screen.getByTestId('keypad-key-1'));
    await fireEvent.press(screen.getByTestId('keypad-key-2'));
    expect(onChange).toHaveBeenLastCalledWith('12');

    await fireEvent.press(screen.getByTestId('keypad-delete'));
    expect(onChange).toHaveBeenLastCalledWith('1');
    expect(screen.queryByTestId('keypad-confirm')).toBeNull();
  });

  /* Tavanı aşan tuş HİÇ işlemez: "partide 4 var" iken 6 yazılmaz, sonra kırpılmaz. */
  it('tavanı aşacak tuş işlemez — değer kırpılmaz, hiç yazılmaz', async () => {
    const onChange = jest.fn();
    await render(
      <OperationsKeypadPanel value="0" unit="adet" hint="" deleteLabel="sil" allowDecimals={false} max={4} onChange={onChange} testID="keypad" />,
    );

    await fireEvent.press(screen.getByTestId('keypad-key-6'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('keypad-value')).toHaveTextContent('0 adet');

    await fireEvent.press(screen.getByTestId('keypad-key-4'));
    expect(onChange).toHaveBeenLastCalledWith('4');
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
