import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsStepperGroup } from './stepper-group';

/*
  Ölçülen şeyler: iki yönün de çağırana doğru sayıyı vermesi, TABANIN ALTINA inilememesi ve
  TAVANIN ÜSTÜNE çıkılamaması, ekran okuyucunun düğmeleri adıyla bulması, ortadaki sayının
  dokunuşu — İKİ HÂLİYLE — ve BOŞ hâlin sıfırdan ayrı durması.

  ── "SAYI DOKUNULABİLİR DEĞİLDİR" KURALI 02.09'DA KALKTI (kullanıcı kararı) ──
  Burada *"ortadaki sayı bir DÜĞME DEĞİL: dokunulabilir olsaydı cihaz klavyesi açılır ve sayacın
  var olma sebebi (klavyesiz sayım) ortadan kalkardı"* yazıyordu. Gerekçenin dayandığı varsayım
  YANLIŞTI: sayıya basmak klavye açmıyor, kitin kendi ADET ÇEKMECESİNİ açıyor. Yani klavyesiz
  sayım bozulmuyor, hızlanıyor.

  Dokunuş İSTEĞE BAĞLI (`onPressValue`): verilmeyen çağıranlarda sayı düz metin kalır — çekmece
  içindeki sayaçlarda açılacak bir şey yok ve her sayıyı düğmeye çevirmek, dokunulunca hiçbir şey
  yapmayan bir yüzey üretirdi. İki hâl de aşağıda çivili.

  ── BOŞ ≠ SIFIR (02.09, tek adet deseni) ────────────────────────────────────
  Eski metin alanı "saymadım"ı boş dizeyle taşıyordu; sayaç `null` ile taşır. Boşta eksi söner,
  artı tabanın bir üstüne çıkar ve ekran okuyucu rakam yerine boşluk işaretini duyar.
*/

describe('OperationsStepperGroup', () => {
  it('artırma ve azaltma çağırana KOMŞU sayıyı verir', async () => {
    const onChange = jest.fn();
    await render(<OperationsStepperGroup value={3} onChange={onChange} label="Koli — 12 paket" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Koli — 12 paket — artır' }));
    expect(onChange).toHaveBeenLastCalledWith(4);

    await fireEvent.press(screen.getByRole('button', { name: 'Koli — 12 paket — azalt' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  /* Tabanda azaltma ENGELLİ, sessizce yutulmuş değil: engelli düğme kendi rengiyle "burası son"
     der; dokunulup hiçbir şey olmaması "bozuk" gibi okunurdu. */
  it('tabanda azaltma çağırana ULAŞMAZ', async () => {
    const onChange = jest.fn();
    await render(<OperationsStepperGroup value={0} onChange={onChange} label="Tek paket" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tek paket — azalt' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  /* Tavan KİTTE: üç çağıran aynı kırpmayı kendi `onChange`inde yapıyordu ve artı sönmüyordu —
     dokunulup hiçbir şey olmayan bir `+`, bozuk bir `+`dır. */
  it('tavanda artırma çağırana ULAŞMAZ', async () => {
    const onChange = jest.fn();
    await render(<OperationsStepperGroup value={4} max={4} onChange={onChange} label="Düşülen" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Düşülen — artır' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('BOŞ hâl sıfır değildir: işaret yazar, eksi söner, artı tabanın bir üstüne çıkar', async () => {
    const onChange = jest.fn();
    await render(<OperationsStepperGroup value={null} onChange={onChange} label="Gelen" testID="sayac" />);

    expect(screen.getByTestId('sayac-value')).toHaveTextContent('—');
    expect(screen.getByLabelText('Gelen: —')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Gelen — azalt' }));
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Gelen — artır' }));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  /* `onPressValue` VERİLMEZSE sayı düz metindir — çekmece içindeki sayaçlar böyle ve dokunulunca
     hiçbir şey yapmayan bir düğme, bozuk bir düğmedir. */
  it('dokunuş verilmezse ortadaki sayı düğme DEĞİLDİR', async () => {
    await render(<OperationsStepperGroup value={7} onChange={jest.fn()} label="Tek paket" testID="sayac" />);

    expect(screen.getByTestId('sayac-value')).toHaveTextContent('7');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  /* Verilirse sayı ÜÇÜNCÜ düğmedir ve adı sayıyı da söyler ("Tek paket: 7") — ekran okuyucu
     kullanıcısı neye basacağını bilmeli. */
  it('dokunuş verilirse sayı da bir düğmedir ve çağırana haber verir', async () => {
    const onPressValue = jest.fn();
    await render(
      <OperationsStepperGroup
        value={7}
        onChange={jest.fn()}
        onPressValue={onPressValue}
        valueHint="adet çekmecesini açar"
        label="Tek paket"
        testID="sayac"
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(3);
    await fireEvent.press(screen.getByRole('button', { name: 'Tek paket: 7' }));
    expect(onPressValue).toHaveBeenCalledTimes(1);
  });
});
