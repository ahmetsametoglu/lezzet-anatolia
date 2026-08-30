import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsSurface } from './surface';

/*
  Yüzeyin ölçülen DAVRANIŞLARI — renk ve yarıçap değil (onlar token, jest stil işlemiyor):
  dokunulabilir mi, dokunulabildiğinde ekran okuyucuya ADIYLA mı görünüyor, yön oku doğru yerde mi.

  Kritik olan ilk madde: aynı komponent hem taşıyıcı kutu hem tıklanır satır. `onPress` verilmemiş
  bir yüzeyin YANLIŞLIKLA düğme rolü alması, ekran okuyucuda sayfayı tıklanabilir öğelerle
  doldururdu — 41 kullanımın çoğu statik kutudur.
*/

describe('OperationsSurface', () => {
  it('onPress YOKSA düğme değildir — statik kutu ekran okuyucuda eylem gibi okunmaz', async () => {
    await render(
      <OperationsSurface testID="kutu">
        <Text>Bugün depoda</Text>
      </OperationsSurface>,
    );

    expect(screen.getByTestId('kutu')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('onPress VARSA dokunuşu iletir ve adıyla görünür', async () => {
    const onPress = jest.fn();
    await render(
      <OperationsSurface onPress={onPress} accessibilityLabel="Mal kabul — 2 sevkiyat bekliyor">
        <Text>Mal kabul</Text>
      </OperationsSurface>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Mal kabul — 2 sevkiyat bekliyor' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('engelliyken çağırana ulaşmaz', async () => {
    const onPress = jest.fn();
    await render(
      <OperationsSurface onPress={onPress} accessibilityLabel="Kargo devri" disabled testID="kutu">
        <Text>Kargo devri</Text>
      </OperationsSurface>,
    );

    await fireEvent.press(screen.getByTestId('kutu'));

    expect(onPress).not.toHaveBeenCalled();
  });

  /* Yön oku İSTENİRSE çizilir: tasarımda statik künye kartlarında hiç yok, tıklanır satırların
     çoğunda var. Varsayılan çizseydi, dokunulmayan bir kutu "buraya gidilir" derdi. */
  it('yön oku varsayılan olarak ÇİZİLMEZ, istenince çizilir', async () => {
    const { rerender } = await render(
      <OperationsSurface>
        <Text>Künye</Text>
      </OperationsSurface>,
    );
    expect(screen.queryByText('›')).toBeNull();

    await rerender(
      <OperationsSurface chevron>
        <Text>Künye</Text>
      </OperationsSurface>,
    );
    expect(screen.getByText('›')).toBeOnTheScreen();
  });

  it('yön oku çizilse de içerik yerinde durur', async () => {
    await render(
      <OperationsSurface chevron onPress={jest.fn()} accessibilityLabel="Yakın-SKT turu">
        <Text>Yakın-SKT turu</Text>
      </OperationsSurface>,
    );

    expect(screen.getByText('Yakın-SKT turu')).toBeOnTheScreen();
    expect(screen.getByText('›')).toBeOnTheScreen();
  });

  /*
    ── KESİKLİ TONLAR ÇERÇEVEYİ SVG'DEN ÇİZER (30.08) ────────────────────────
    RN'in `borderStyle: 'dashed'`i cihazda ~1:10 bir desen çiziyordu (tasarım ~1:1) ve çerçeve
    kesikli değil NOKTALI görünüyordu. Ölçüm ve gerekçe `dashed-frame.tsx` künyesinde.
    Test kalıbı doğrulamıyor (görsel), yalnız DOĞRU TONLARIN çerçeveyi aldığını: bir gün üçüncü
    bir kesikli ton eklenir ve tabloya yazılmazsa, o ton sessizce çerçevesiz kalırdı.
  */
  it('yalnız kesikli tonlar SVG çerçeve alır', async () => {
    /* Çerçeve ekran okuyucudan GİZLİ (dekoratif, dokunulmaz) — sorgunun bunu bilmesi gerek. */
    const frame = () => screen.getByTestId('kutu-frame', { includeHiddenElements: true });
    const { rerender } = await render(
      <OperationsSurface tone="blank" testID="kutu">
        <Text>say →</Text>
      </OperationsSurface>,
    );
    expect(frame()).toBeOnTheScreen();

    await rerender(
      <OperationsSurface tone="invite" testID="kutu">
        <Text>+ Siparişsiz mal geldi</Text>
      </OperationsSurface>,
    );
    expect(frame()).toBeOnTheScreen();

    await rerender(
      <OperationsSurface tone="panel" testID="kutu">
        <Text>Künye</Text>
      </OperationsSurface>,
    );
    expect(screen.queryByTestId('kutu-frame', { includeHiddenElements: true })).toBeNull();
  });
});
