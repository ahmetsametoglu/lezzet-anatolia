import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsQtyField } from './qty-field';

/*
  ADET KUTUSU TESTİ — komponentin sözleşmesi: metni AYNEN taşır (ayrıştırmaz), ekran okuyucuya adını
  verir ve işaretli alanda eksi yazılabilen klavyeyi açar.

  "Boş ile sıfır ayrımı" burada SINANMAZ ve sınanmamalı: o kural çağıranın (`parseQty`) ve onun
  kendi testinin işi — komponent metni yorumlarsa ayrım iki yerde yaşamaya başlar.
*/

describe('operasyon adet kutusu', () => {
  it('metni aynen taşır ve değişikliği HAM dize olarak bildirir', async () => {
    const onChangeText = jest.fn();
    await render(
      <OperationsQtyField value="4" onChangeText={onChangeText} accessibilityLabel="Gelen adet" testID="qty" />,
    );

    expect(screen.getByTestId('qty').props.value).toBe('4');

    await fireEvent.changeText(screen.getByTestId('qty'), '12');
    expect(onChangeText).toHaveBeenCalledWith('12');
  });

  it('varsayılan klavye eksi TAŞIMAZ; `signed` alanda taşır', async () => {
    await render(<OperationsQtyField value="" onChangeText={jest.fn()} accessibilityLabel="Adet" testID="plain" />);
    expect(screen.getByTestId('plain').props.keyboardType).toBe('number-pad');

    await render(
      <OperationsQtyField value="" onChangeText={jest.fn()} accessibilityLabel="Adet" signed testID="signed" />,
    );
    expect(screen.getByTestId('signed').props.keyboardType).toBe('numbers-and-punctuation');
  });

  it('ekran okuyucu adı ZORUNLUDUR — yer tutucu onun yerine geçmez', async () => {
    await render(
      <OperationsQtyField
        value=""
        onChangeText={jest.fn()}
        accessibilityLabel="Mantı · 500 g için gelen adet"
        placeholder="—"
        testID="labelled"
      />,
    );

    expect(screen.getByLabelText('Mantı · 500 g için gelen adet')).toBeOnTheScreen();
    expect(screen.getByTestId('labelled').props.placeholder).toBe('—');
  });

  /*
    BİRİM BAŞLIĞI (v3 · 30.08) — kart üç sayı taşıyabiliyor (beklenen · sayılan · koli çarpanı) ve
    çerçeveli kutudaki çıplak rakam hangisi olduğunu söylemiyordu. Ölçülen iki davranış: başlık
    İSTENİRSE çizilir (v2 ekranlarının hiçbirinde yok, varsayılan çizerse dört ekran birden
    değişirdi) ve girdinin ekran okuyucu adını EZMEZ.
  */
  /* Sorgular `includeHiddenElements` ile: başlık ekran okuyucudan BİLEREK gizli
     (`accessibilityElementsHidden`) ve RNTL varsayılan olarak gizli öğeleri atlıyor. Yani bayrak
     olmadan bu iki test "çizilmiyor" ile "gizli" arasındaki farkı göremez — ilki kusur, ikincisi
     kararın kendisi. */
  const hidden = { includeHiddenElements: true } as const;

  it('birim başlığı istenmedikçe ÇİZİLMEZ', async () => {
    await render(
      <OperationsQtyField value="12" onChangeText={jest.fn()} accessibilityLabel="Gelen adet" />,
    );

    expect(screen.queryByText('ADET', hidden)).toBeNull();
  });

  it('birim başlığı verilince çizilir ama girdinin ADINI ezmez', async () => {
    await render(
      <OperationsQtyField
        value="12"
        onChangeText={jest.fn()}
        accessibilityLabel="Karışık Baklava · 225 g için gelen adet"
        caption="ADET"
        testID="captioned"
      />,
    );

    expect(screen.getByText('ADET', hidden)).toBeOnTheScreen();
    // …ve ekran okuyucuya GÖRÜNMEZ: adı zaten girdinin üstünde, "ADET" ayrıca okunsaydı aynı
    // bilgi iki kez söylenirdi.
    expect(screen.queryByText('ADET')).toBeNull();
    // Girdi hâlâ KENDİ adıyla bulunur: başlık kutunun içine girdi, adın önüne geçmedi.
    expect(screen.getByLabelText('Karışık Baklava · 225 g için gelen adet')).toBeOnTheScreen();
    expect(screen.getByTestId('captioned').props.value).toBe('12');
  });
});
