import { render, screen } from '@testing-library/react-native';

// Cihaz dili SABİTLENİR: metin iddiaları makinenin diline bağlanmasın (kit testlerinin deseni).
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));

import type { PointsRules } from '@/lib/api/points';
import { PointsEarnList } from './points-earn-list';

/*
  PUAN KAZANMA YOLLARI — "bugün alındı" işareti (MB-54 · kullanıcı kararı 11.08).

  ── ÇİVİLENEN ASIL KARAR: BİLMEMEK OLUMSUZ DEĞİLDİR ─────────────────────────
  Bileşeni ÜÇ yüzey kullanıyor ve biri onboarding — orayı gören kişi henüz MİSAFİR: hesabı yok,
  "bugün aldın mı" diye bir hâli de yok. `visitClaimedToday` bu yüzden İSTEĞE BAĞLI ve verilmediğinde
  durum HİÇ çizilmiyor. Zorunlu yapılsaydı misafire uydurma bir `false` gösterilirdi — yani
  "alamadığı" değil, "alamayacağı" bir şey için eksik işareti (CLAUDE §1).

  ── VE İŞARET YALNIZ ZİYARET SATIRINDA ──────────────────────────────────────
  Öteki yolların "bugünlük" bir hakkı yok: getiren ödülü başkasının siparişini bekler, yorum
  teslim edilmiş bir siparişe yazılır. İşareti kümeye yaymak olmayan bir ritmi ima ederdi.

  ── İKONUN KENDİSİ DE BİR KARAR ─────────────────────────────────────────────
  Ziyaretin kimlik ikonu bir süre ONAY İŞARETİYDİ ve durum eklenince çakıştı: aynı satırda iki tik,
  ikisi de durum bildirmez. İkon "tekrar eden"e (`refresh`) çevrildi, tik DURUMA serbest kaldı.

  **RNTL v14 ASENKRON:** `render` de beklenmezse `screen` kurulmaz ve iddia *"render function has
  not been called"* diye anlaşılmaz biçimde düşer (ölçüldü 25.08, beş test birden).
*/

/** Kazanma yolları — sunucudan gelen kümeyle aynı şekil. */
const rules: PointsRules = {
  redeem: { minimumPoints: 500, valueCents: 500 },
  centValue: 1,
  neighborMaxUses: 3,
  earnWays: [
    { key: 'visit', points: 10 },
    { key: 'review', points: 20 },
  ],
} as PointsRules;

describe('bugün alındı işareti', () => {
  it('BAYRAK VERİLMEZSE durum hiç çizilmez — onboarding misafire yanlış bir şey söylemesin', async () => {
    await render(<PointsEarnList rules={rules} />);

    // Ziyaret satırı var ama "bugün alındı" cümlesi yok: kural metni ("günde bir") duruyor.
    expect(screen.getByTestId('points-earn-visit')).toBeTruthy();
    expect(screen.queryByText(/bugün alındı/i)).toBeNull();
  });

  it('`false` ile durum yine çizilmez — eksik işaret göstermek de bir iddiadır', async () => {
    // Kırılgan dal: `!visitClaimedToday` gibi bir yazım burada bir "alınmadı" rozeti basardı ve
    // ekran, henüz uygulamayı açmamış müşteriye eksiklik gibi görünen bir işaret gösterirdi.
    await render(<PointsEarnList rules={rules} visitClaimedToday={false} />);

    expect(screen.queryByText(/bugün alındı/i)).toBeNull();
  });

  it('BUGÜN ALINDIYSA sıklık metni OLAYA döner', async () => {
    await render(<PointsEarnList rules={rules} visitClaimedToday />);

    expect(screen.getByText(/bugün alındı/i)).toBeTruthy();
  });

  it('İŞARET YALNIZ ZİYARET SATIRINDA — öteki yollara sızmaz', async () => {
    await render(<PointsEarnList rules={rules} visitClaimedToday />);

    /* İDDİA METİN DEĞİL, İŞARETİN KENDİSİ. Metne bakan ilk hâli SABOTAJI GEÇTİ: sıklık metni
       `'claimedToday' in copy` ile korunuyor (öteki yolların sözlüğünde o anahtar yok), yani
       işareti kümeye yayan bir yazım metinde hiç görünmüyordu — yalnız ikonda görünüyordu.
       Ölçüldü 25.08; iddia ikona çevrildi ve sabotaj artık yakalanıyor. */
    expect(screen.getByTestId('points-earn-visit-claimed')).toBeTruthy();
    expect(screen.queryByTestId('points-earn-review-claimed')).toBeNull();
  });

  it('ziyaret satırı, bayrak ne olursa olsun ÇİZİLİR — durum satırı gizlemez', async () => {
    // "Alındı" bir bitiş değil; müşteri yarın yine gelecek ve yolu görmeye devam etmeli.
    await render(<PointsEarnList rules={rules} visitClaimedToday />);

    expect(screen.getByTestId('points-earn-visit')).toBeTruthy();
  });
});
