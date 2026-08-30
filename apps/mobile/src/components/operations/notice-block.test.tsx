import { customerAppColors, customerColors, operationsAppColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { OperationsNoticeBlock } from './notice-block';

describe('OperationsNoticeBlock', () => {
  it('boş varyantı KESİKLİ KUM çerçeve çizer — "olabilirdi, bugün yok"', async () => {
    await render(<OperationsNoticeBlock variant="empty" title="Bildirim yok" testID="block" />);

    expect(screen.getByTestId('block')).toHaveStyle({
      borderStyle: 'dashed',
      backgroundColor: operationsAppColors.panel,
      // v3 ölçümü `sand-300`; v2'nin bir kademe koyu `sand-500`ü değil.
      borderColor: customerAppColors['sand-300'],
    });
    expect(screen.getByRole('header', { name: 'Bildirim yok' })).toBeOnTheScreen();
  });

  it('hata varyantı DÜZ KIRMIZI çerçeve çizer ve KIRMIZI konuşur — "vardı, gösteremedik"', async () => {
    await render(
      <OperationsNoticeBlock variant="error" title="Yüklenemedi" description="Sunucuya ulaşılamadı." testID="block" />,
    );

    expect(screen.getByTestId('block')).not.toHaveStyle({ borderStyle: 'dashed' });
    expect(screen.getByTestId('block')).toHaveStyle({ borderColor: operationsAppColors['error-line'] });
    /* v3'te başlık DA gövde DE kırmızı: gri bir açıklama kutunun sesini yumuşatıyordu. */
    expect(screen.getByRole('header', { name: 'Yüklenemedi' })).toHaveStyle({ color: customerAppColors.error });
    expect(screen.getByTestId('block-description')).toHaveStyle({ color: customerAppColors.error });
    expect(screen.getByTestId('block-description')).not.toHaveStyle({ color: customerColors.muted });
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

  it('CTA kutunun DIŞINDA ve koyu (v3) — testID hâlâ KUTUYU işaret eder', async () => {
    await render(
      <OperationsNoticeBlock
        variant="error"
        title="Yüklenemedi"
        retry={{ label: 'Tekrar dene', onPress: jest.fn() }}
        testID="block"
      />,
    );

    /* Sarmalayıcı adsız: `block` yine kutunun kendisidir (kenarlığı ondan okunur). Sarmalayıcıya
       testID verilseydi bloğu yoklayan çağıranlar sessizce boş bir kabı ölçmeye başlardı. */
    expect(screen.getByTestId('block')).toHaveStyle({ borderColor: operationsAppColors['error-line'] });
    expect(screen.getByTestId('block-retry')).toHaveStyle({ backgroundColor: customerColors.ink });
  });

  it('eylemsiz blokta düğme HİÇ çizilmez (ölü etkileşim yok)', async () => {
    await render(<OperationsNoticeBlock variant="error" title="Yüklenemedi" testID="block" />);

    expect(screen.queryByTestId('block-retry')).toBeNull();
  });
});
