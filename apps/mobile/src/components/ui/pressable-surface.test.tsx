import { customerColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';

import { appMetrics } from '../../theme/metrics';
import { hapticCommit, hapticSelect } from '../../lib/haptics/haptics';
import { PressableSurface, pressFeedbackStyles } from './pressable-surface';

/* Titreşim TAKLİT: gerçek `expo-haptics` yerel modüldür ve testte yok. Ölçülen şey donanım değil
   KURAL — hangi dokunuşun hangi niyeti ateşlediği. */
jest.mock('../../lib/haptics/haptics', () => ({
  hapticSelect: jest.fn(),
  hapticCommit: jest.fn(),
}));

// Token Kararlari #8'in kanıtı: hangi yüzey basıldığında NE yapıyor. Web'in `cursor-pointer` +
// hover kuralının RN karşılığı budur — kural tek yerde durur ve burada ölçülür.
describe('PressableSurface', () => {
  const setup = (props: Partial<ComponentProps<typeof PressableSurface>> = {}) =>
    render(
      <PressableSurface onPress={jest.fn()} feedback="scale" testID="surface" {...props}>
        <Text>içerik</Text>
      </PressableSurface>,
    );

  it('basıldığında çağırır, engelliyken çağırmaz', async () => {
    const onPress = jest.fn();
    await setup({ onPress });
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);

    const blocked = jest.fn();
    await setup({ onPress: blocked, disabled: true });
    await fireEvent.press(screen.getAllByRole('button')[0]);
    expect(blocked).not.toHaveBeenCalled();
  });

  it('beş geri bildirim de ölçüsünü TEMADAN alır', () => {
    expect(pressFeedbackStyles.shadow).toEqual({
      transform: [
        { translateX: appMetrics.press.translate },
        { translateY: appMetrics.press.translate },
      ],
    });
    expect(pressFeedbackStyles.scale).toEqual({ transform: [{ scale: appMetrics.press.scale }] });
    expect(pressFeedbackStyles['scale-small']).toEqual({
      transform: [{ scale: appMetrics.press.scaleSmall }],
    });
    expect(pressFeedbackStyles.opacity).toEqual({ opacity: appMetrics.press.opacity });
    expect(pressFeedbackStyles.tint).toEqual({ backgroundColor: customerColors['sand-200'] });
  });

  it('küçük öğe dokunma payı alır, büyük öğe almaz', async () => {
    await setup({ compact: true });
    expect(screen.getByRole('button').props.hitSlop).toBe(appMetrics.touchSlop);

    await setup();
    expect(screen.getAllByRole('button')[0].props.hitSlop).toBeUndefined();
  });

  it('engelli ve seçili durumları a11y’ye taşır; seçili verilmezse bayrak hiç açılmaz', async () => {
    await setup({ selected: true });
    expect(screen.getByRole('button')).toBeSelected();

    await setup({ disabled: true });
    expect(screen.getAllByRole('button')[0]).toBeDisabled();

    await setup();
    expect(screen.getAllByRole('button')[0].props.accessibilityState.selected).toBeUndefined();
  });

  it('rol çağıranca değiştirilebilir (süzgeç/sekme yüzeyleri için)', async () => {
    await setup({ accessibilityRole: 'tab', accessibilityLabel: 'Vitrin' });

    expect(screen.getByRole('tab', { name: 'Vitrin' })).toBeOnTheScreen();
  });

  /*
    TİTREŞİM KURALI (kullanıcı kararı 02.09: "eylem titresin, gezinme sessiz").

    Kural kitte durduğu için sessizce kaybolabilir: bir muafiyet fazladan konursa uygulama
    titremez, eksik konursa gezinirken titrer — ikisi de hata vermez. Bekçi burada.
  */
  describe('titreşim', () => {
    beforeEach(() => {
      (hapticSelect as jest.Mock).mockClear();
      (hapticCommit as jest.Mock).mockClear();
    });

    it('dokunuş VARSAYILAN olarak hafif tık verir — yeni ekran kendiliğinden doğru davranır', async () => {
      const onPress = jest.fn();
      await setup({ onPress });

      fireEvent.press(screen.getByTestId('surface'));

      expect(hapticSelect).toHaveBeenCalledTimes(1);
      // Titreşim eylemin YERİNE geçmez: çağıranın işleyicisi yine koşar.
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('UZUN BASMA daha güçlü tık verir — kazara olmayan hareket', async () => {
      const onLongPress = jest.fn();
      await setup({ onLongPress });

      fireEvent(screen.getByTestId('surface'), 'longPress');

      expect(hapticCommit).toHaveBeenCalledTimes(1);
      expect(hapticSelect).not.toHaveBeenCalled();
      expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('`haptic={false}` GEZİNME yüzeyini susturur — çip, sekme, metin eylemi', async () => {
      const onPress = jest.fn();
      await setup({ haptic: false, onPress });

      fireEvent.press(screen.getByTestId('surface'));

      expect(hapticSelect).not.toHaveBeenCalled();
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('uzun basma yoksa kanca da kurulmaz — olmayan hareket titremez', async () => {
      await setup({});

      fireEvent(screen.getByTestId('surface'), 'longPress');

      expect(hapticCommit).not.toHaveBeenCalled();
    });
  });
});
