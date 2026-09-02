import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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

    await fireEvent.press(screen.getByLabelText('Paket'));

    expect(onScan).toHaveBeenCalledTimes(1);
    // Kod havuzdan geldiği gibi HAM gider — bileşen çözmez, süslemez, kırpmaz.
    expect(onScan).toHaveBeenCalledWith('8691000007919');
  });

  it('çağıran ad çözücü verirse çipin altına ÜRÜN ADI yazılır; çözemediği çip yalın kalır', async () => {
    /* Kullanıcı kararı 02.09: etiket YOLU söyler, ad ise koda o gün hangi ürünün bağlandığını.
       Ad havuza yazılmaz — çözümden gelir; çip erişilebilirlik adıyla yine yoluyla bulunur. */
    const devResolve = jest.fn(async (code: string) => (code === '8691000007919' ? 'Fıstıklı Baklava · 500 g' : null));
    await render(<ScanSheet open title="Ürünü okut" onClose={onClose} onScan={onScan} devResolve={devResolve} testID="scan" />);

    await waitFor(() => expect(screen.getByTestId('scan-dev-chip-name-8691000007919')).toHaveTextContent('Fıstıklı Baklava · 500 g'));
    expect(screen.queryByTestId('scan-dev-chip-name-18691000047516')).toBeNull();
    expect(devResolve).toHaveBeenCalledTimes(5); // havuzun beş çipi, hepsi soruldu

    // Ad çipin işini değiştirmez: yine ham kod, yine tek yol.
    await fireEvent.press(screen.getByLabelText('Paket'));
    expect(onScan).toHaveBeenCalledWith('8691000007919');
  });

  it('kilit okuma başınadır: teslimden sonra ikinci dokunuş İLETİLMEZ', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByLabelText('Koli ×24'));
    await fireEvent.press(screen.getByLabelText('Koli ×24'));
    await fireEvent.press(screen.getByLabelText('Toplama'));

    // İkinci koli VE ardından gelen BAŞKA kod da yutulur — kilit koda değil, teslim edilmemiş
    // okumanın varlığına bakar; çağıran cevabı işleyene kadar yeni okuma yoktur.
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('sayfa yeniden açılınca kilit sıfırlanır — arka arkaya iki koli okutulabilir', async () => {
    const view = await renderSheet();
    await fireEvent.press(screen.getByLabelText('Paket'));

    await view.rerender(<ScanSheet open={false} title="Koli okut" onClose={onClose} onScan={onScan} testID="scan" />);
    await view.rerender(<ScanSheet open title="Koli okut" onClose={onClose} onScan={onScan} testID="scan" />);
    await fireEvent.press(screen.getByLabelText('Paket'));

    expect(onScan).toHaveBeenCalledTimes(2);
  });

  it('izin verilmemişken vizör yerine izin kutusu çizilir; havuz yine durur', async () => {
    await renderSheet();

    expect(screen.getByTestId('scan-permission')).toBeOnTheScreen();
    // Simülasyon kameradan bağımsız: izin/kamera olmadan da akış koşturulabilir olmalı.
    expect(screen.getByTestId('scan-dev-pool')).toBeOnTheScreen();
  });

  it('ÜRETİM derlemesinde havuz ÇİZİLMEZ — depocu sahte kod basamaz', async () => {
    /*
      Havuzun tek güvencesi `__DEV__` dalı ve o dalın sessizce kalkması hiçbir ekranı bozmaz:
      uygulama çalışır, kamera çalışır, YALNIZ release'te de simülasyon çipleri görünür olur.
      Depocu o çiplere basarak kamerayı hiç kullanmadan mal kabul yazabilir — kayıt gerçek,
      okutma sahte. Kimse fark etmez çünkü kırılan bir şey yoktur (`not-barkod-arama-kapisi`).

      Jest'te `__DEV__` bir global; üretimde metro onu `false` sabitine indirger ve ölü dalı
      atar. İkisinde de ölçülen AYNI dal — burada değeri elle çevirip dalın gerçekten değere
      bağlı olduğunu çiviliyoruz.
    */
    const globals = globalThis as unknown as { __DEV__: boolean };
    const gercek = globals.__DEV__;
    globals.__DEV__ = false;

    try {
      await renderSheet();

      expect(screen.queryByTestId('scan-dev-pool')).toBeNull();
      // Çipin kendisi de yok: `queryByTestId` bir kapsayıcıyı ölçer, bu satır teslim yolunu.
      expect(screen.queryByLabelText('Paket')).toBeNull();
    } finally {
      // Değer küresel: geri konmazsa AYNI dosyadaki sonraki testler ve öteki dosyalar
      // (jest her dosyayı ayrı ortamda koşsa da sıra içinde) üretim dalını görürdü.
      globals.__DEV__ = gercek;
    }
  });
});
