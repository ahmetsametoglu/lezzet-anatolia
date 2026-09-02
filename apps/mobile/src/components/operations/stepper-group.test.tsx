import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsStepperGroup } from './stepper-group';

/*
  Ölçülen şeyler: iki yönün de çağırana doğru sayıyı vermesi, TABANIN ALTINA inilememesi, ekran
  okuyucunun düğmeleri adıyla bulması, ve ortadaki sayının dokunuşu — İKİ HÂLİYLE.

  ── "SAYI DOKUNULABİLİR DEĞİLDİR" KURALI 02.09'DA KALKTI (kullanıcı kararı) ──
  Burada *"ortadaki sayı bir DÜĞME DEĞİL: dokunulabilir olsaydı cihaz klavyesi açılır ve sayacın
  var olma sebebi (klavyesiz sayım) ortadan kalkardı"* yazıyordu. Gerekçenin dayandığı varsayım
  YANLIŞTI: sayıya basmak klavye açmıyor, kitin kendi ADET ÇEKMECESİNİ açıyor
  (`OperationsScanQtySheet` — aynı sayaç, büyük hâliyle). Yani klavyesiz sayım bozulmuyor.

  Kullanıcının gerekçesi rampanın kendisi: 12 adet koyacak kurye artı düğmesine on iki kez
  basıyor. Sayı zaten ekranın ortasında ve parmağın düştüğü yer.

  Dokunuş İSTEĞE BAĞLI (`onPressValue`): verilmeyen çağıranlarda sayı düz metin kalır — yirmiye
  yakın çağıranın çoğunda açılacak bir şey yok ve her sayıyı düğmeye çevirmek, dokunulunca hiçbir
  şey yapmayan bir yüzey üretirdi. İki hâl de aşağıda çivili.
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

  /* `onPressValue` VERİLMEZSE sayı düz metindir — çağıranların çoğu böyle ve dokunulunca hiçbir
     şey yapmayan bir düğme, bozuk bir düğmedir. */
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
