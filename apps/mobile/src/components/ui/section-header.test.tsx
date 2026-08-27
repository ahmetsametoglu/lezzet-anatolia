import { customerAppText, customerColors, customerText } from '@lezzet/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { emToDp } from '../../theme/parse';
import { customerStops } from '../../theme/unistyles';
import { SectionHeader } from './section-header';

// Beklenenler PAKETTEN türetilir; çeviri de temanın kullandığı çevirinin aynısı (px→dp + kademe).
const appText = customerStops(customerAppText);
const baseText = customerStops(customerText);

describe('SectionHeader', () => {
  it('yalnız üstbaşlıkla kurulabilir (başlık ve bağlantı isteğe bağlı)', async () => {
    await render(<SectionHeader eyebrow="Koleksiyonlar" />);

    // Üstbaşlığı KOMPONENT büyütür (prop künyesi) — çağıran küçük harfle verir.
    expect(screen.getByText('KOLEKSIYONLAR')).toBeOnTheScreen();
    expect(screen.queryByRole('header')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  /* BÜYÜK HARF DİLİN KURALIYLA ÇEVRİLİR, stilin `textTransform`una bırakılmaz: onu Android native
     yapıyor ve CİHAZIN dilini kullanıyor. Türkçe telefonda Fransızca arayüzde ölçüldü (28.08):
     "Panier prêt" → "PANİER PRÊT". Bu test o yönü tutuyor — `upperIn` sökülürse metin uygulamanın
     değil telefonun diline göre büyür ve testte fark edilmez (jest'in yereli sabittir), o yüzden
     iddia HARFİN KENDİSİNE bakıyor: `i` → `I`, Türkçenin `İ`si değil. */
  it('üstbaşlık UYGULAMANIN diliyle büyür — cihazın diliyle değil', async () => {
    await render(<SectionHeader eyebrow="iyi seçim" />);

    expect(screen.getByText('IYI SEÇIM')).toBeOnTheScreen();
    expect(screen.queryByText('İYİ SEÇİM')).toBeNull();
  });

  it('başlık verilince header rolüyle duyurulur', async () => {
    await render(<SectionHeader eyebrow="Vitrindekiler" title="Bu haftanın seçkisi" />);

    expect(screen.getByRole('header')).toHaveTextContent('Bu haftanın seçkisi');
  });

  it('sağ bağlantı basılınca çağırır', async () => {
    const onActionPress = jest.fn();
    await render(<SectionHeader eyebrow="Vitrindekiler" actionLabel="Tüm katalog" onActionPress={onActionPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tüm katalog' }));

    expect(onActionPress).toHaveBeenCalledTimes(1);
  });

  it('üstbaşlık UYGULAMA kademesini kullanır ve em aralığı dp’ye çevrilir', async () => {
    await render(<SectionHeader eyebrow="Hazır paketler" title="Paketler" />);

    expect(screen.getByText('HAZIR PAKETLER')).toHaveStyle({
      fontSize: appText.eyebrow,
      letterSpacing: emToDp(appText['eyebrow--letter-spacing'], appText.eyebrow),
      color: customerColors.terracotta,
    });
    expect(screen.getByRole('header')).toHaveStyle({ fontSize: baseText['h2-sm'] });
  });
});
