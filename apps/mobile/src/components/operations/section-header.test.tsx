import { customerColors, customerAppText, operationsAppColors } from '@lezzet/design-tokens';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { OperationsSectionHeader } from './section-header';

describe('OperationsSectionHeader', () => {
  it('başlık ekran okuyucuya BAŞLIK olarak gider; üstbaşlık ayrı bir satırdır', async () => {
    await render(<OperationsSectionHeader section="courier" eyebrow="KURYE" title="Günün Rotası" />);

    expect(screen.getByRole('header', { name: 'Günün Rotası' })).toBeOnTheScreen();
    expect(screen.getByText('KURYE')).toBeOnTheScreen();
  });

  it('üstbaşlık rengi BÖLÜMÜN KİMLİĞİDİR — dördü de tasarımdan ölçülmüş ayrı değerler', async () => {
    await render(<OperationsSectionHeader section="warehouse" eyebrow="DEPO" title="Depo İşleri" />);

    // Depo kahvesi kendi durağı (`warehouse`); `honey` DEĞİL — o "bekliyor" demek.
    expect(screen.getByText('DEPO')).toHaveStyle({ color: operationsAppColors.warehouse });
  });

  it('yönetim mürekkep, para terracotta üstbaşlık taşır', async () => {
    await render(<OperationsSectionHeader section="management" eyebrow="YÖNETİM" title="Karar Kutusu" />);

    expect(screen.getByText('YÖNETİM')).toHaveStyle({
      color: customerColors.ink,
      fontSize: Number.parseFloat(customerAppText.eyebrow),
    });
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
    expect(screen.getByText('PARA · SALT OKUMA')).toHaveStyle({ color: customerColors.terracotta });
  });
});
