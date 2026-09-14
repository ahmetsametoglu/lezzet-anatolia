import { customerColors, operationsAppColors } from '@lezzet/design-tokens';
import { render, screen } from '@testing-library/react-native';

import { OperationsProgressBar } from './progress-bar';

/*
  İLERLEME ÇUBUĞU — iki şey ölçülüyor, ikisi de cihazda yanlış okunan bir sayı üretmişti.

  1. ORAN KIRPILIYOR: veri tutarsızlığı (toplanan > toplam) çubuğu kutusunun dışına taşırmasın.
  2. KOYU KARTIN İZİ AYRI (30.08): iz açık zemin için seçilmişti (`neutral-bg`) ve koyu kartın
     üstünde zeminden AÇIK kalıyordu — çubuk boşken bile DOLU görünüyordu. Kuryenin günü üç
     duraktan biri bitmişken "neredeyse tamam" diye okunuyordu.
*/

describe('OperationsProgressBar', () => {
  it('iz VARSAYILAN olarak açık zeminin izi', async () => {
    await render(<OperationsProgressBar value={0.5} testID="bar" />);

    expect(screen.getByTestId('bar')).toHaveStyle({ backgroundColor: operationsAppColors['neutral-bg'] });
  });

  it('KOYU kartta iz koyulaşır — açık iz çubuğu dolu gösteriyordu', async () => {
    await render(<OperationsProgressBar value={0.5} onInk testID="bar" />);

    expect(screen.getByTestId('bar')).toHaveStyle({ backgroundColor: operationsAppColors['on-ink-line'] });
    expect(screen.getByTestId('bar')).not.toHaveStyle({ backgroundColor: operationsAppColors['neutral-bg'] });
  });

  it('dolgu varsayılan ZEYTİN; renk çağırandan gelir (depo satırı durumunu taşır)', async () => {
    await render(<OperationsProgressBar value={0.5} testID="bar" />);

    expect(screen.getByTestId('bar').children[0]).toHaveStyle({ backgroundColor: customerColors.olive });
  });

  it('oran 0–1 aralığına KIRPILIR — bozuk veri çubuğu kutusunun dışına taşırmaz', async () => {
    await render(<OperationsProgressBar value={2.4} testID="bar" />);

    expect(screen.getByTestId('bar').children[0]).toHaveStyle({ width: '100%' });
  });

  it('sayı değilse çubuk BOŞ çizilir — NaN bir oran değildir', async () => {
    await render(<OperationsProgressBar value={Number.NaN} testID="bar" />);

    expect(screen.getByTestId('bar').children[0]).toHaveStyle({ width: '0%' });
  });
});
