import { customerColors, customerText, operationsAppColors } from '@lezzet/design-tokens';
import { render, screen } from '@testing-library/react-native';

import { OperationsSkeletonList } from './skeleton-list';

describe('OperationsSkeletonList', () => {
  it('verilen yükseklikler kadar kutu çizer — yerleşimi ÖLÇÜSÜYLE tutar', async () => {
    await render(<OperationsSkeletonList heights={[74, 74, 74]} label="Kuyruk yükleniyor…" testID="sk" />);

    const boxes = screen.getByTestId('sk').children;

    // Üç kutu + künye satırı.
    expect(boxes).toHaveLength(4);
    expect(boxes[0]).toHaveStyle({ height: 74, backgroundColor: customerColors['sand-50'] });
    expect(boxes[0]).toHaveStyle({ borderColor: operationsAppColors['neutral-bg'] });
  });

  it('opaklık MERDİVENİ aşağı doğru soluyor — liste "buradan uzayacak" der', async () => {
    await render(<OperationsSkeletonList heights={[80, 80, 80]} label="Yükleniyor…" testID="sk" />);

    const boxes = screen.getByTestId('sk').children;

    expect(boxes[0]).toHaveStyle({ opacity: 1 });
    expect(boxes[1]).toHaveStyle({ opacity: 0.7 });
    expect(boxes[2]).toHaveStyle({ opacity: 0.4 });
  });

  it('künye DİPNOT grisinde — listenin içeriği değil, durumu', async () => {
    await render(<OperationsSkeletonList heights={[74]} label="Sevkiyatlar yükleniyor…" />);

    const label = screen.getByText('Sevkiyatlar yükleniyor…');

    expect(label).toHaveStyle({ color: operationsAppColors['tab-inactive'] });
    expect(label).not.toHaveStyle({ color: customerColors.muted });
    expect(label).toHaveStyle({ fontSize: Number.parseFloat(customerText.micro) });
  });
});
