import { customerColors } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Note } from './note';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';

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

  it('hata tonu hata ailesini kullanır ve alert rolüyle duyurulur', async () => {
    await render(<Note title="Ödeme alınamadı" description="Kartınız reddedildi" tone="error" testID="note" />);

    // Hata ailesinin metni ve zemini telefon görünümüyle tabana çıktı (14.09) — değer aynı, kaynak taban.
    expect(screen.getByTestId('note')).toHaveStyle({ backgroundColor: customerColors['error-bg'] });
    expect(screen.getByText('Kartınız reddedildi')).toHaveStyle({ color: customerColors.error });
    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });

  it('sıcak ton kum skalasının ara kademesini kullanır ve çerçevesizdir', async () => {
    await render(<Note description="Puanınız: 240" tone="warm" testID="note" />);

    expect(screen.getByTestId('note')).toHaveStyle({
      // `sand-150` telefon görünümüyle tabana çıktı (14.09) — değer aynı, kaynak taban.
      backgroundColor: customerColors['sand-150'],
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
    expect(screen.queryByTestId('note-header')).toBeNull();
  });

  /* ÜST YUVA (11.08) — bölge dışı bandın posta kodu hapı için açıldı ve taşıdığı SÖZ SIRADIR:
     buraya konan şey BAŞLIKTAN ÖNCE çizilir. Bir `toBeOnTheScreen` bunu kanıtlamaz (yuva altta da
     olsa geçerdi), o yüzden ağacın çocuk sırasına bakılıyor: kutunun ilk çocuğu üst yuvadır. */
  it('üst yuva kutunun İÇİNDE ve BAŞLIKTAN ÖNCE çizilir', async () => {
    const view = await render(
      <Note
        description="Gönderebildiğimiz ürünler kargoyla gelir."
        title="Bu bölgeye aracımız gitmiyor"
        tone="warm"
        header={<Text testID="note-header">67000 STRASBOURG ▾</Text>}
        testID="note"
      />,
    );

    expect(screen.getByTestId('note-header')).toBeOnTheScreen();

    const box = view.toJSON();
    const first = box !== null && !Array.isArray(box) ? box.children?.[0] : null;
    expect(JSON.stringify(first)).toContain('note-header');
    expect(JSON.stringify(first)).not.toContain('Bu bölgeye aracımız gitmiyor');
  });

  it('hata dışındaki tonlar alert rolü ÜRETMEZ', async () => {
    await render(<Note description="Bilgi" tone="warm" />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
