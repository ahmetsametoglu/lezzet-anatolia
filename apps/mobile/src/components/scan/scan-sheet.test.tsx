import { fireEvent, render, screen } from '@testing-library/react-native';

import { ScanSheet } from './scan-sheet';

/*
  TARAMA SAYFASI — sözleşmenin üç güvencesi ölçülür:

  1. TEKRAR-OKUMA KİLİDİ okuma başınadır: teslim edilmiş bir okumanın üstüne ikinci teslim geçmez
     (kamera aynı kodu saniyede onlarca kez bildirir; simülasyon çipine çift dokunmak aynı sınıf).
  2. Kilit SAYFA AÇILIŞINDA sıfırlanır: önceki turun kilidi yeni turu sağır bırakmaz — arka arkaya
     iki koli okutmanın yolu budur.
  3. Simülasyon havuzu kameranın YOLUNDAN geçer: çip `onScan`a ham kodu verir, başka hiçbir şey
     yapmaz — üretim ile geliştirme arasındaki tek fark kodun kaynağıdır (kullanıcı kararı 22.08).

  Kamera jest'te sahte (`jest.setup.ts`): izin verilmemiş hâl çizilir, vizör hiç açılmaz — burada
  ölçülen şey kamera değil, teslim noktasının kendisi. `__DEV__` jest'te true: havuz görünür.
*/

const onScan = jest.fn();
const onClose = jest.fn();

async function renderSheet(open = true) {
  return render(<ScanSheet open={open} title="Koli okut" hint="ipucu" onClose={onClose} onScan={onScan} testID="scan" />);
}

beforeEach(() => {
  onScan.mockReset();
  onClose.mockReset();
});

describe('ScanSheet', () => {
  it('simülasyon çipi ham kodu tek `onScan` yolundan teslim eder', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByLabelText('Paket barkodu'));

    expect(onScan).toHaveBeenCalledTimes(1);
    // Kod havuzdan geldiği gibi HAM gider — bileşen çözmez, süslemez, kırpmaz.
    expect(onScan).toHaveBeenCalledWith('8691000000000');
  });

  it('kilit okuma başınadır: teslimden sonra ikinci dokunuş İLETİLMEZ', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByLabelText('Koli barkodu'));
    await fireEvent.press(screen.getByLabelText('Koli barkodu'));
    await fireEvent.press(screen.getByLabelText('SKU'));

    // İkinci koli VE ardından gelen SKU da yutulur — kilit koda değil, teslim edilmemiş okumanın
    // varlığına bakar; çağıran cevabı işleyene kadar yeni okuma yoktur.
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('sayfa yeniden açılınca kilit sıfırlanır — arka arkaya iki koli okutulabilir', async () => {
    const view = await renderSheet();
    await fireEvent.press(screen.getByLabelText('Paket barkodu'));

    await view.rerender(<ScanSheet open={false} title="Koli okut" onClose={onClose} onScan={onScan} testID="scan" />);
    await view.rerender(<ScanSheet open title="Koli okut" onClose={onClose} onScan={onScan} testID="scan" />);
    await fireEvent.press(screen.getByLabelText('Paket barkodu'));

    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it('izin verilmemişken vizör yerine izin kutusu çizilir; havuz yine durur', async () => {
    await renderSheet();

    expect(screen.getByTestId('scan-permission')).toBeOnTheScreen();
    // Simülasyon kameradan bağımsız: izin/kamera olmadan da akış koşturulabilir olmalı.
    expect(screen.getByTestId('scan-dev-pool')).toBeOnTheScreen();
  });
});
