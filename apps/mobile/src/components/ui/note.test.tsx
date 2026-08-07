import { customerAppColors, customerColors } from '@lezzet/design-tokens';
import { render, screen } from '@testing-library/react-native';

import { Note } from './note';

describe('Note', () => {
  it('açıklamayı gösterir, başlık isteğe bağlıdır', async () => {
    await render(<Note description="60 € üzeri kargo ücretsiz" />);

    expect(screen.getByText('60 € üzeri kargo ücretsiz')).toBeOnTheScreen();
  });

  it('zeytin tonu olumlu aileden beslenir', async () => {
    await render(<Note description="Kapınıza ücretsiz teslim" testID="note" />);

    expect(screen.getByTestId('note')).toHaveStyle({ backgroundColor: customerColors['olive-bg'] });
    expect(screen.getByText('Kapınıza ücretsiz teslim')).toHaveStyle({ color: customerColors['olive-dark'] });
  });

  it('terracotta tonu fırsat/uyarı ailesinden beslenir', async () => {
    await render(<Note description="Asgari sepet 25 €" tone="terracotta" testID="note" />);

    expect(screen.getByTestId('note')).toHaveStyle({ backgroundColor: customerColors['terracotta-bg'] });
  });

  it('hata tonu UYGULAMANIN kendi hata ailesini kullanır ve alert rolüyle duyurulur', async () => {
    await render(<Note title="Ödeme alınamadı" description="Kartınız reddedildi" tone="error" testID="note" />);

    expect(screen.getByTestId('note')).toHaveStyle({ backgroundColor: customerAppColors['error-bg'] });
    expect(screen.getByText('Kartınız reddedildi')).toHaveStyle({ color: customerAppColors.error });
    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });

  it('sıcak ton uygulamanın yeni kum kademesini kullanır ve çerçevesizdir', async () => {
    await render(<Note description="Puanınız: 240" tone="warm" testID="note" />);

    expect(screen.getByTestId('note')).toHaveStyle({
      backgroundColor: customerAppColors['sand-150'],
      borderColor: 'transparent',
    });
  });

  it('hata dışındaki tonlar alert rolü ÜRETMEZ', async () => {
    await render(<Note description="Bilgi" tone="warm" />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
