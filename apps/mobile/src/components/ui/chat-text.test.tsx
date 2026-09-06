import { render, screen } from '@testing-library/react-native';

import { appFont } from '@/theme/fonts';
import { ChatText } from './chat-text';

/*
  SOHBET METNİ ÇİZİCİSİ — ayrıştırıcı `domain-core`de ve kendi testleri orada; buradaki iddialar
  ÇİZİMİN kendisine ait: hangi parça hangi AİLEYE düşüyor, madde listesi satır satır mı çiziliyor,
  ve işaretsiz metin fazladan bir kutu doğuruyor mu.

  AİLE ADI ÇİVİLENİYOR, `fontWeight` DEĞİL — bu dosyanın sınadığı asıl kural bu (`theme/fonts`
  künyesi): RN'de özel ailede `fontWeight`/`fontStyle` ya yok sayılır ya sahte kesit üretir, yani
  vurgu ancak aile değişerek doğar. Testi aileye bağlamak, bir gün biri `fontWeight: 'bold'`
  yazdığında kırılmasını sağlıyor.
*/

/** Çizilen metnin stilini tek nesneye indirger — RN stil dizisi verebiliyor. */
function styleOf(node: { props: { style?: unknown } }): Record<string, unknown> {
  const raw = node.props.style;
  const list = Array.isArray(raw) ? raw : [raw];
  return Object.assign({}, ...list.filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null));
}

describe('ChatText', () => {
  it('işaretsiz metin olduğu gibi çizilir', async () => {
    await render(<ChatText testID="t">Yarın 09:00da kapınızdayız.</ChatText>);
    expect(screen.getByTestId('t')).toHaveTextContent('Yarın 09:00da kapınızdayız.');
  });

  it('kalın parça KALIN AİLEYE geçer, işaretler metinde kalmaz', async () => {
    await render(<ChatText testID="t">İki tepsi *Su Böreği* yarın.</ChatText>);

    const kalin = screen.getByText('Su Böreği');
    expect(styleOf(kalin).fontFamily).toBe(appFont.body[700]);
    expect(screen.getByTestId('t')).toHaveTextContent('İki tepsi Su Böreği yarın.');
  });

  it('koyu baloncukta kalın kesit 600 olur — 700 o puntoda zeminden taşıyor', async () => {
    await render(
      <ChatText testID="t" boldWeight={600}>
        *Tamam*
      </ChatText>,
    );
    expect(styleOf(screen.getByText('Tamam')).fontFamily).toBe(appFont.body[600]);
  });

  it('italik parça İTALİK AİLEYE geçer', async () => {
    await render(<ChatText testID="t">Bu _yalnız_ bir öneri.</ChatText>);
    expect(styleOf(screen.getByText('yalnız')).fontFamily).toBe(appFont.bodyItalic[400]);
  });

  /* Ayrıştırıcı iç içe işaretleri TEK parçada birleştiriyor (`-71`in sözleşmesi); çizici bu
     yüzden dört aile ihtimalinden seçiyor, iç içe `Text` kurmuyor. */
  it('kalın+italik BİRLEŞİK kesite düşer, iki ayrı katmana değil', async () => {
    await render(<ChatText testID="t">*_ikisi birden_*</ChatText>);
    expect(styleOf(screen.getByText('ikisi birden')).fontFamily).toBe(appFont.bodyItalic[700]);
  });

  it('üstü çizili parça AİLESİNİ KAYBETMEZ, yalnız çizgi kazanır', async () => {
    await render(<ChatText testID="t">~eski fiyat~ yeni fiyat</ChatText>);

    const style = styleOf(screen.getByText('eski fiyat'));
    expect(style.textDecorationLine).toBe('line-through');
    // Yalnız çizili parçada aile yazılMAZ: çağıranın ailesi mirasla gelmeli.
    expect(style.fontFamily).toBeUndefined();
  });

  it('madde listesi satır satır çizilir ve işaret metnin İÇİNDE değildir', async () => {
    await render(<ChatText testID="t">{'Üç boy var:\n• 500 g\n• 1 kg'}</ChatText>);

    // Madde metni kendi başına bulunabiliyorsa işaret ayrı bir sütunda demektir.
    expect(screen.getByText('500 g')).toBeOnTheScreen();
    expect(screen.getByText('1 kg')).toBeOnTheScreen();
    expect(screen.getAllByText('•')).toHaveLength(2);
  });

  /* Çarpma ve yıldızlı madde ayrıştırıcının güvencesi; burada yalnız ÇİZİCİNİN o güvenceyi
     bozmadığı sınanıyor — metin aynen görünmeli. */
  it('çarpma işareti vurgu sanılmaz', async () => {
    await render(<ChatText testID="t">9*90 g paket</ChatText>);
    expect(screen.getByTestId('t')).toHaveTextContent('9*90 g paket');
  });
});
