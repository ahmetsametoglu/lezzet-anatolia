import { customerAppColors, customerColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Note } from './note';
import { PrimaryButton } from './primary-button';

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

  it('eylem yuvası kutunun İÇİNDE çizilir ve a11y kapsamına yutulmaz', async () => {
    await render(
      <Note
        description="Bu adrese aracımız gitmiyor"
        tone="warm"
        action={<PrimaryButton label="Buraya da gelin" onPress={jest.fn()} testID="note-cta" />}
        testID="note"
      />,
    );

    // Düğme kutunun içinde ama kendi dokunma hedefi olarak duruyor (metin bloğu onu kapsamıyor).
    expect(screen.getByTestId('note-cta')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('note-cta'));
  });

  it('yuvasız kullanım hiç değişmedi — eylem verilmezse çizilmez', async () => {
    await render(<Note description="Puanınız: 240" tone="warm" testID="note" />);

    expect(screen.getByTestId('note')).toBeOnTheScreen();
    expect(screen.queryByTestId('note-cta')).toBeNull();
  });

  it('hata dışındaki tonlar alert rolü ÜRETMEZ', async () => {
    await render(<Note description="Bilgi" tone="warm" />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
