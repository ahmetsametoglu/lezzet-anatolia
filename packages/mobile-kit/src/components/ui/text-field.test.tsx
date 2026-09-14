import { customerAppColors, customerAppRadius, customerColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { TextField } from './text-field';

const noop = () => {};

describe('TextField', () => {
  it('yazılan metni yukarı bildirir ve a11y adını prop’tan alır', async () => {
    const onChangeText = jest.fn();
    await render(
      <TextField value="" onChangeText={onChangeText} accessibilityLabel="Posta kodu" placeholder="67000" />,
    );

    const input = screen.getByLabelText('Posta kodu');
    await fireEvent.changeText(input, '67100');

    expect(onChangeText).toHaveBeenCalledWith('67100');
  });

  it('sayısal alan sayı klavyesini ister', async () => {
    await render(<TextField value="" onChangeText={noop} accessibilityLabel="SIRET" numeric testID="f" />);

    expect(screen.getByTestId('f').props.keyboardType).toBe('number-pad');
  });

  it('çok satırlı alan asgari yüksekliğe geçer', async () => {
    await render(<TextField value="" onChangeText={noop} accessibilityLabel="Mesaj" multiline testID="f" />);

    expect(screen.getByTestId('f').props.multiline).toBe(true);
  });

  it('sonda düğme yuvasını render eder', async () => {
    await render(
      <TextField value="" onChangeText={noop} accessibilityLabel="SIRET" trailing={<Text>Bul</Text>} />,
    );

    expect(screen.getByText('Bul')).toBeOnTheScreen();
  });

  it('hata varken çerçeve ve mesaj hata renklerine döner (mesaj a11y ipucu olur)', async () => {
    await render(
      <TextField value="ABC" onChangeText={noop} accessibilityLabel="Kupon" errorText="Kod geçersiz" testID="f" />,
    );

    expect(screen.getByTestId('f')).toHaveStyle({ borderColor: customerColors['terracotta-line'] });
    expect(screen.getByText('Kod geçersiz')).toHaveStyle({ color: customerAppColors.error });
    expect(screen.getByLabelText('Kupon').props.accessibilityHint).toBe('Kod geçersiz');
  });

  it('köşe kademesi ve zemin temadan gelir', async () => {
    await render(<TextField value="" onChangeText={noop} accessibilityLabel="Ad" shape="pill" testID="f" />);

    expect(screen.getByTestId('f')).toHaveStyle({
      borderRadius: Number.parseFloat(customerAppRadius.pill),
      backgroundColor: customerColors.card,
      borderColor: customerColors['sand-400'],
    });
  });

  it('salt okunur alan devre dışı durumunu bildirir', async () => {
    await render(<TextField value="x" onChangeText={noop} accessibilityLabel="Şirket" editable={false} testID="f" />);

    expect(screen.getByTestId('f').props.editable).toBe(false);
    expect(screen.getByTestId('f')).toHaveStyle({ backgroundColor: customerColors['sand-50'] });
  });
});
