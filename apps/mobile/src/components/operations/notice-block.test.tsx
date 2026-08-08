import { operationsAppColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsNoticeBlock } from './notice-block';

describe('OperationsNoticeBlock', () => {
  it('boş varyantı KESİKLİ çerçeve çizer — "olabilirdi, bugün yok"', async () => {
    await render(<OperationsNoticeBlock variant="empty" title="Bildirim yok" testID="block" />);

    expect(screen.getByTestId('block')).toHaveStyle({
      borderStyle: 'dashed',
      backgroundColor: operationsAppColors.panel,
    });
    expect(screen.getByRole('header', { name: 'Bildirim yok' })).toBeOnTheScreen();
  });

  it('hata varyantı DÜZ çerçeve çizer — "vardı, gösteremedik"', async () => {
    await render(<OperationsNoticeBlock variant="error" title="Yüklenemedi" testID="block" />);

    expect(screen.getByTestId('block')).not.toHaveStyle({ borderStyle: 'dashed' });
  });

  it('açıklama verilirse çizilir', async () => {
    await render(<OperationsNoticeBlock variant="empty" title="Bildirim yok" description="Yeni iş düşünce." />);

    expect(screen.getByText('Yeni iş düşünce.')).toBeOnTheScreen();
  });

  it('açıklama verilmezse HİÇ çizilmez — boş bir metin düğümü bile', async () => {
    await render(<OperationsNoticeBlock variant="empty" title="Bildirim yok" testID="block" />);

    expect(screen.queryByTestId('block-description')).not.toBeOnTheScreen();
  });

  it('tekrar-dene yalnız verildiğinde çıkar ve basılınca çağırır', async () => {
    const onPress = jest.fn();
    await render(
      <OperationsNoticeBlock
        variant="error"
        title="Yüklenemedi"
        retry={{ label: 'Tekrar dene', onPress }}
        testID="block"
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('eylemsiz blokta düğme HİÇ çizilmez (ölü etkileşim yok)', async () => {
    await render(<OperationsNoticeBlock variant="error" title="Yüklenemedi" testID="block" />);

    expect(screen.queryByTestId('block-retry')).toBeNull();
  });
});
