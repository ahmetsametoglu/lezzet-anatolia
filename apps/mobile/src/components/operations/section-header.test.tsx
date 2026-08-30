import { customerColors, customerAppText } from '@lezzet/design-tokens';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { OperationsSectionHeader } from './section-header';

describe('OperationsSectionHeader', () => {
  it('başlık ekran okuyucuya BAŞLIK olarak gider; üstbaşlık ayrı bir satırdır', async () => {
    await render(<OperationsSectionHeader section="courier" eyebrow="KURYE" title="Günün Rotası" />);

    expect(screen.getByRole('header', { name: 'Günün Rotası' })).toBeOnTheScreen();
    expect(screen.getByText('KURYE')).toBeOnTheScreen();
  });

  /*
    v2'de bu testler "üstbaşlık rengi BÖLÜMÜN KİMLİĞİDİR" diyordu ve dördünün AYRI olduğunu
    savunuyordu. v3 o kararı geri aldı (30.08): şablonun dört üstbaşlığı da zeytin. Test o yüzden
    ters yöne çevrildi — artık koruduğu şey "ayrı olsunlar" değil, "AYRIŞMASINLAR". Biri sessizce
    eski kimlik rengine dönerse burada yakalanır.
  */
  /* Dördü AYRI test: tek testte döngüyle denendi ve üçüncü turda "element bulunamadı" verdi —
     `render`/`unmount` aynı test içinde arka arkaya kurulunca ağaç güvenilir çözülmüyor. Her
     bölümün kendi testi olması ayrıca düşüşü de adlandırıyor: hangi bölümün rengi kaydı, test
     adından okunur. */
  it.each([
    ['courier', 'KURYE'],
    ['warehouse', 'DEPO'],
    ['management', 'YÖNETİM'],
    ['money', 'PARA'],
  ] as const)('%s üstbaşlığı zeytin — renk "operasyondayım" der, "hangi bölümdeyim" demez', async (section, eyebrow) => {
    await render(<OperationsSectionHeader section={section} eyebrow={eyebrow} title="Başlık" />);

    expect(screen.getByText(eyebrow)).toHaveStyle({ color: customerColors.olive });
  });

  it('üstbaşlık ölçeğin `eyebrow` durağında yazılır', async () => {
    await render(<OperationsSectionHeader section="management" eyebrow="YÖNETİM" title="Karar Kutusu" />);

    expect(screen.getByText('YÖNETİM')).toHaveStyle({
      fontSize: Number.parseFloat(customerAppText.eyebrow),
    });
  });

  /*
    BAĞLAM SATIRI (v3, 30.08) — başlığın altındaki künye. İki iddia birden korunuyor: verilince
    çizilir, VERİLMEYİNCE HİÇ DOĞMAZ. İkincisi önemli, çünkü boş bir satır çizmek Yönetim
    bölümünde başlığın altında sebepsiz bir boşluk bırakırdı (şablonda orada satır yok).
  */
  it('bağlam satırı verilince çizilir', async () => {
    await render(
      <OperationsSectionHeader
        section="warehouse"
        eyebrow="DEPO"
        title="Depo İşleri"
        context="Deniz Arslan · depo"
        testID="hdr"
      />,
    );

    expect(screen.getByTestId('hdr-context')).toHaveTextContent('Deniz Arslan · depo');
    expect(screen.getByTestId('hdr-context')).toHaveStyle({ color: customerColors.muted });
  });

  it('bağlam satırı VERİLMEZSE hiç doğmaz', async () => {
    await render(<OperationsSectionHeader section="management" eyebrow="YÖNETİM" title="Karar Kutusu" testID="hdr" />);

    expect(screen.queryByTestId('hdr-context')).toBeNull();
  });

  it('sağ yuva ÇAĞIRANIN: Para bölümünde zil yerine başka bir eylem durabilsin', async () => {
    await render(
      <OperationsSectionHeader
        section="money"
        eyebrow="PARA · SALT OKUMA"
        title="Tahsilat İzleme"
        right={<Text>Gün sonu →</Text>}
      />,
    );

    expect(screen.getByText('Gün sonu →')).toBeOnTheScreen();
    /* Terracotta artık üstbaşlıkta DEĞİL; token hâlâ paletin parçası ve para bölümünün başka
       yerlerinde yaşıyor — bu satır yalnız üstbaşlığın ona dönmediğini söylüyor. */
    expect(screen.getByText('PARA · SALT OKUMA')).not.toHaveStyle({ color: customerColors.terracotta });
  });
});
