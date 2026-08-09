import { customerAppColors, customerAppText } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { BottomSheet } from './bottom-sheet';
import { mapTokens } from '../../theme/parse';

const appText = mapTokens(customerAppText);

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

    await fireEvent.press(screen.getByTestId('sheet-scrim', { includeHiddenElements: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Android'in geri hareketi de kapatır — çizili değil ama platformun sözü", async () => {
    const onClose = jest.fn();
    await render(
      <BottomSheet visible title="Sırala" onClose={onClose} testID="sheet">
        <Text>içerik</Text>
      </BottomSheet>,
    );

    await fireEvent(screen.getByTestId('sheet'), 'requestClose');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('örtü ve başlık kademesi TEMADAN gelir (ham değer yok)', async () => {
    await render(
      <BottomSheet visible title="Sırala" onClose={jest.fn()} testID="sheet">
        <Text>içerik</Text>
      </BottomSheet>,
    );

    expect(screen.getByTestId('sheet-scrim', { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: customerAppColors.scrim,
    });
    expect(screen.getByRole('header')).toHaveStyle({
      fontSize: appText['sheet-title'],
    });
  });
});
