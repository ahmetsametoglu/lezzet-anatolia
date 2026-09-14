import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsScanQtySheet } from './scan-qty-sheet';

/*
  Çekmecenin sözleri:
  · başlık ad ve boyu BİRLEŞTİRİR (çağıran iki alan verir, tek cümle okunur),
  · bağlam sayıları verildiği gibi çizilir; verilmezse kart HİÇ çizilmez (boş bir kutu, olmayan
    bir bilgiyi varmış gibi gösterir),
  · onay düğmesi kapalıyken çağırana ulaşmaz — adet 0'ken kutuya bir şey konmamalı.
*/

const base = {
  visible: true,
  name: 'Fıstıklı Baklava',
  variantLabel: '1250 g',
  value: 4,
  qtyCaption: 'bu kutuya konuyor',
  confirmLabel: 'Kutuya koy',
  onChange: jest.fn(),
  onConfirm: jest.fn(),
  onClose: jest.fn(),
};

describe('OperationsScanQtySheet', () => {
  it('adı ve boyu tek başlıkta okur, künyeyi altına yazar', async () => {
    await render(
      <OperationsScanQtySheet {...base} caption="KURU DEPO A3 · P-0688 · SKT 12.09.26" testID="adet-sheet" />,
    );

    expect(screen.getByText('Fıstıklı Baklava · 1250 g')).toBeTruthy();
    expect(screen.getByText('KURU DEPO A3 · P-0688 · SKT 12.09.26')).toBeTruthy();
  });

  it('bağlam sayılarını verildiği gibi çizer', async () => {
    await render(
      <OperationsScanQtySheet
        {...base}
        stats={[
          { value: '4', label: 'istenen' },
          { value: '2', label: 'kalan', tone: 'warn' },
        ]}
        testID="adet-sheet"
      />,
    );

    expect(screen.getByText('istenen')).toBeTruthy();
    expect(screen.getByText('kalan')).toBeTruthy();
  });

  it('sayı verilmezse bağlam kartı HİÇ çizilmez', async () => {
    await render(<OperationsScanQtySheet {...base} testID="adet-sheet" />);

    expect(screen.queryByText('istenen')).toBeNull();
  });

  it('onayı çağırana iletir', async () => {
    const onConfirm = jest.fn();
    await render(<OperationsScanQtySheet {...base} onConfirm={onConfirm} testID="adet-sheet" />);

    await fireEvent.press(screen.getByTestId('adet-sheet-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  /* RAKAMA BASINCA TUŞ TAKIMI ADIMI (kullanıcı kararı 02.09) — sözleri verilirse. Canlı yazar,
     "Tamam" sayaca döner. Sözleri verilmeyen çağıranda rakam düz metindir (kurye kendi turunda). */
  it('tuş takımı sözleri verilirse rakam adımı açar; her tuş çağırana canlı gider', async () => {
    const onChange = jest.fn();
    await render(
      <OperationsScanQtySheet
        {...base}
        onChange={onChange}
        max={9}
        keypad={{ unit: 'adet', hint: 'bu kutuya konuyor', deleteLabel: 'sil', backLabel: 'Tamam', valueHint: 'tuş takımını açar' }}
        testID="adet-sheet"
      />,
    );

    await fireEvent.press(screen.getByTestId('adet-sheet-qty-value-hit'));
    await fireEvent.press(screen.getByTestId('adet-sheet-keypad-key-7'));
    expect(onChange).toHaveBeenLastCalledWith(7);
    expect(screen.queryByTestId('adet-sheet-keypad-confirm')).toBeNull();

    await fireEvent.press(screen.getByTestId('adet-sheet-keypad-back'));
    expect(screen.getByTestId('adet-sheet-qty-value')).toBeTruthy();
  });

  it('tuş takımı sözleri verilmezse rakam düğme DEĞİLDİR', async () => {
    await render(<OperationsScanQtySheet {...base} testID="adet-sheet" />);

    expect(screen.queryByTestId('adet-sheet-qty-value-hit')).toBeNull();
  });

  it('kapalı onay çağırana ULAŞMAZ — boş kutuya kalem yazılmaz', async () => {
    const onConfirm = jest.fn();
    await render(
      <OperationsScanQtySheet {...base} value={0} confirmDisabled onConfirm={onConfirm} testID="adet-sheet" />,
    );

    await fireEvent.press(screen.getByTestId('adet-sheet-confirm'));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
