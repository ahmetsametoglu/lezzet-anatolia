import { customerAppColors, customerColors } from '@lezzet/design-tokens';
import { render, screen } from '@testing-library/react-native';

import { StockMark } from './stock-mark';

/*
  YER İŞARETİNİN TONLARI (21.20'nin test borcunun son parçası).

  Çivilenen karar: **üç ton üç AYRI şey söyler ve renk çiftleri karışmaz.** Kararın kendisi
  `lib/places/place-view.ts`te ve orada testli; burada sınanan, o kararın EKRANA doğru renkle
  çıkması — ikisi ayrı yerlerde ve biri bozulunca öteki susar.

  Neden önemli: `pending` ("bugün yok, gelecek") bilerek yaprak tonuna KATILMADI — olumlu bir
  rozet rengiyle söylenirse müşteri onu satın alınabilirlik sanır (komponent künyesi). Ton
  eşlemesi sessizce kayarsa ekran yanlış haberi doğru renkle verir; hiçbir yer hata vermez.
*/

describe('StockMark', () => {
  it('`blocked` HATA çiftini taşır — "bu adrese gitmiyor" kapalı bir kapıdır', async () => {
    await render(<StockMark label="Bu adrese gönderemiyoruz" tone="blocked" testID="mark" />);

    expect(screen.getByTestId('mark')).toHaveStyle({ backgroundColor: customerAppColors['error-bg'] });
    expect(screen.getByText('Bu adrese gönderemiyoruz')).toHaveStyle({ color: customerAppColors.error });
  });

  it('`pending` BEKLEME çiftini taşır — iyi haber rengine KATILMAZ', async () => {
    await render(<StockMark label="Bölgenizde şu an yok" tone="pending" testID="mark" />);

    const badge = screen.getByTestId('mark');
    expect(badge).toHaveStyle({ backgroundColor: customerAppColors['closed-bg'] });
    // Asıl iddia: bekleme, "gelecek" diyen olumlu tonun ta kendisi OLMAMALI.
    expect(badge).not.toHaveStyle({ backgroundColor: customerColors['olive-bg'] });
  });

  it('`info` yaprak çiftini taşır — ürün gelecek, yalnız yolu farklı', async () => {
    await render(<StockMark label="Kargoyla gelir" tone="info" testID="mark" />);

    expect(screen.getByTestId('mark')).toHaveStyle({ backgroundColor: customerColors['olive-bg'] });
    expect(screen.getByText('Kargoyla gelir')).toHaveStyle({ color: customerColors['olive-dark'] });
  });

  it('cümle İKİ SATIRDA kesilir — rozet kartın fotoğrafını yutmaz', async () => {
    await render(<StockMark label="Çok uzun bir yer cümlesi" tone="blocked" testID="mark" />);

    expect(screen.getByText('Çok uzun bir yer cümlesi').props.numberOfLines).toBe(2);
  });
});
