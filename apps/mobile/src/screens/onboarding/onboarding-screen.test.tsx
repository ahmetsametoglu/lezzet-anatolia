import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { setAppLocale } from '@/lib/i18n/app-locale';
import { OnboardingScreen } from './onboarding-screen';

/*
  ONBOARDING — depo mock'lu (görev kısıtı): sınanan şey akışın kendisi — adım geçişleri, dil
  seçiminin ANINDA arayüze yansıması, maske, yer cevabının cümlesi ve çıkışta ne saklandığı.

  ALTI ADIM: dil · yazı boyutu · posta kodu · teslimat · ödeme · puan (yazı boyutu 09.08'de, puan
  12.08'de eklendi).

  DİL: uygulamanın dili modül durumunda yaşıyor ve testler arasında SIFIRLANMAZ (üretimde de öyle:
  seçim kalıcıdır) — her test kendi başlangıcını `setAppLocale('tr')` ile kurar, yoksa bir önceki
  testin seçtiği dil sonrakine sızar.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockSave = jest.fn(async (_state: unknown): Promise<void> => undefined);
jest.mock('@/lib/onboarding/onboarding-store', () => ({
  saveOnboarding: (state: unknown) => mockSave(state),
}));

/* YER ÇÖZÜMÜ GERÇEK UÇTAN geliyor (09.08 — eski yerel '67' kuralı kalktı): test o ucu mock'lar,
   böylece dört hâlin hangi cümleyi doğurduğu ağa çıkmadan ölçülür. */
const mockResolve = jest.fn();
jest.mock('@/lib/api/places', () => ({
  resolvePostalCode: (code: string) => mockResolve(code),
}));

/* PUAN KURALLARI da gerçek uçtan geliyor (12.08) ve MİSAFİRE açık: test o ucu mock'lar. Sayılar
   burada UYDURMA değil ölçüt — ekranın sunucudan geleni bastığını, sabit bir sayı gömmediğini
   sınıyoruz (bu yüzden 500/5 € çifti seçildi: gerçek ayarla aynı). */
jest.mock('@/lib/api/points', () => ({
  fetchPointsRules: () =>
    Promise.resolve({
      data: {
        redeem: { minimumPoints: 500, valueCents: 500 },
        centValue: 1,
        neighborMaxUses: 3,
        earnWays: [
          { key: 'referral', points: 500 },
          { key: 'visit', points: 10 },
        ],
      },
      error: null,
      status: 200,
    }),
}));

/** Ucun zarfı — `apiFetch` sözleşmesi: başarıda `error: null`. */
function resolved(placeName: string, inRoute: boolean) {
  return {
    data: {
      kind: 'resolved',
      place: { country: 'FR', postalCode: '67000', placeName, places: [placeName], inRoute },
    },
    error: null,
    status: 200,
  };
}

beforeEach(async () => {
  mockReplace.mockClear();
  mockSave.mockClear();
  mockResolve.mockReset();
  mockResolve.mockResolvedValue(resolved('Strasbourg', true));
  await setAppLocale('tr');
});

/** İleri düğmesiyle adım atlar — dil seçmeden de ilerlenebildiğini her kullanım yeniden sınar. */
async function pressNext() {
  await fireEvent.press(screen.getByTestId('onboarding-next'));
}

/**
 * Posta kodu adımı DÖRDÜNCÜDÜR: dil → yazı boyutu → **teslimat** → posta kodu.
 *
 * Sıra 13.08'de değişti (kullanıcı kararı): kodu istemeden ÖNCE neden istediğimizi anlatan kart
 * gelir. Sebebini bilmeyen kişi alanı boş geçiyor.
 */
async function goToZipStep() {
  await pressNext();
  await pressNext();
  await pressNext();
}

describe('onboarding', () => {
  it('dil adımı LOCALES listesini çizer; uygulamanın dili önseçilidir, yalnız onda ✓ vardır', async () => {
    await render(<OnboardingScreen />);

    expect(screen.getByText('HOŞ GELDİNİZ · BIENVENUE')).toBeOnTheScreen();
    expect(screen.getByText('Hangi dilde devam edelim?')).toBeOnTheScreen();

    expect(within(screen.getByTestId('onboarding-language-tr')).getByText('✓')).toBeOnTheScreen();
    expect(within(screen.getByTestId('onboarding-language-fr')).queryByText('✓')).toBeNull();
    expect(within(screen.getByTestId('onboarding-language-de')).queryByText('✓')).toBeNull();
  });

  it('dil seçimi EKRANIN METNİNİ ANINDA DEĞİŞTİRİR; kısa gecikmeyle yazı boyutu adımına geçer', async () => {
    await render(<OnboardingScreen />);

    await fireEvent.press(screen.getByTestId('onboarding-language-fr'));
    expect(within(screen.getByTestId('onboarding-language-fr')).getByText('✓')).toBeOnTheScreen();

    // Kullanıcı kararı 09.08: seçim yapılır yapılmaz O EKRANIN metni de seçilen dile döner.
    expect(screen.getByText('Dans quelle langue continuons-nous ?')).toBeOnTheScreen();

    // v3: seçimden 250 ms sonra kendiliğinden bir sonraki adım — o adım da Fransızca çizilir.
    await waitFor(() => expect(screen.getByText('Choisissez la taille du texte')).toBeOnTheScreen());
  });

  it('posta kodu maskesi yalnız rakam bırakır ve beş haneyle keser', async () => {
    await render(<OnboardingScreen />);
    await goToZipStep();

    const input = screen.getByTestId('onboarding-zip');
    await fireEvent.changeText(input, 'ab12cd3456789');
    expect(input.props.value).toBe('12345');
  });

  it('yer cevabı: beş haneden önce soru sorulmaz; rota içi ve rota dışı AYRI cümle alır', async () => {
    await render(<OnboardingScreen />);
    await goToZipStep();

    const input = screen.getByTestId('onboarding-zip');

    await fireEvent.changeText(input, '670');
    expect(screen.queryByTestId('onboarding-zip-note')).toBeNull();
    expect(mockResolve).not.toHaveBeenCalled();

    await fireEvent.changeText(input, '67000');
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-zip-note')).toHaveTextContent(
        'Harika — kapınıza ücretsiz teslim ediyoruz! Kapıda ödeme de kullanabilirsiniz.',
      ),
    );
    expect(screen.getByTestId('onboarding-zip-place')).toHaveTextContent('67000 · Strasbourg');

    mockResolve.mockResolvedValue(resolved('Paris', false));
    await fireEvent.changeText(input, '75000');
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-zip-note')).toHaveTextContent(
        // Eşik SAYISI metinden çıkarıldı (13.08): `free_shipping_threshold_cents` kapsamlı —
        // global 60 €, ülke 90 €, b2b 250 €. Sabit "60 €" Alman müşteriye yanlış söz veriyordu.
        'Soğuk zincir korumalı kargoyla 2–4 iş gününde ulaştırırız. Belirli bir tutarın üzerinde kargo ücretsiz — tutarı sepetinizde görürsünüz.',
      ),
    );
  });

  it('uçtan uca: puan bölümü KART KART ilerler, hesap teklifi ancak SON kartta çıkar', async () => {
    await render(<OnboardingScreen />);
    expect(screen.getByTestId('onboarding-next')).toHaveTextContent('Devam');

    await pressNext(); // → yazı boyutu
    expect(screen.getByText('Yazı boyutunu seçin')).toBeOnTheScreen();

    // GEREKÇE ÖNCE, SORU SONRA (kullanıcı kararı 13.08).
    await pressNext(); // → teslimat
    expect(screen.getByText('İki teslimat yolumuz var')).toBeOnTheScreen();

    await pressNext(); // → posta kodu
    await fireEvent.changeText(screen.getByTestId('onboarding-zip'), '67000');

    await pressNext(); // → ödeme
    expect(screen.getByText('Nasıl isterseniz öyle ödeyin')).toBeOnTheScreen();
    expect(screen.getByText('Online ödeme')).toBeOnTheScreen();
    expect(screen.getByText('Kapıda ödeme')).toBeOnTheScreen();
    expect(screen.getByText('Havale ve vadeli hesap')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-next')).toHaveTextContent('Devam');

    await pressNext(); // → puanın GİRİŞ kartı
    expect(screen.getByText('Kullandıkça kazanın')).toBeOnTheScreen();
    // SAYI SUNUCUDAN: eşik de para karşılığı da mock'un verdiği değerler — ekran sabit gömmüyor.
    await waitFor(() => expect(screen.getByTestId('onboarding-points-rate')).toHaveTextContent('500 puan = 5,00 € kupon'));
    // Giriş kartı döküm YAPMAZ ve hesap TEKLİF ETMEZ — soruyu düğmenin kendisi sorar.
    expect(screen.queryByTestId('onboarding-points-ways-invite')).toBeNull();
    expect(screen.getByTestId('onboarding-next')).toHaveTextContent('Nasıl puan kazanılır?');

    await pressNext(); // → 1. grup kartı
    expect(screen.getByTestId('onboarding-points-group-invite')).toBeOnTheScreen();
    expect(screen.getByText('Çağırdıkça')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-next')).toHaveTextContent('Devam');

    await pressNext(); // → 2. (ve mock'ta SON) grup kartı
    expect(screen.getByTestId('onboarding-points-group-visit')).toBeOnTheScreen();
    // Teklif ancak puan anlatıldıktan SONRA (kullanıcı kararı 13.08).
    expect(screen.getByTestId('onboarding-next')).toHaveTextContent('Hesap aç, kazanmaya başla');

    await pressNext(); // → hesap aç
    expect(mockSave).toHaveBeenCalledWith({ done: true, locale: 'tr', postalCode: '67000' });
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('grup kartı yalnız KENDİ yollarını çizer; "Sonra bakarım" her puan kartında vitrine düşürür', async () => {
    await render(<OnboardingScreen />);
    for (let step = 0; step < 6; step += 1) await pressNext(); // → 1. grup kartı

    await waitFor(() => expect(screen.getByTestId('onboarding-points-group-invite')).toBeOnTheScreen());
    // Kart KENDİ grubunu çizer: `visit` bu kartta YOK, kendi kartında.
    expect(screen.getByTestId('points-earn-referral')).toBeOnTheScreen();
    expect(screen.queryByTestId('points-earn-visit')).toBeNull();
    // Ödül rozeti puanı ve parasını BİRLİKTE taşır; para `points × centValue` ile türetilir.
    expect(within(screen.getByTestId('points-earn-referral')).getByText('+500 · 5,00 €')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('onboarding-later'));
    expect(mockSave).toHaveBeenCalledWith({ done: true, locale: 'tr', postalCode: null });
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('Atla çıkıştır: hiçbir şey seçilmediyse uygulamanın o anki dili ve boş posta kodu (null) saklanır', async () => {
    await render(<OnboardingScreen />);

    await fireEvent.press(screen.getByTestId('onboarding-skip'));

    expect(mockSave).toHaveBeenCalledWith({ done: true, locale: 'tr', postalCode: null });
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('Atla o ana dek yapılan seçimi de taşır: seçilen dil kayda girer', async () => {
    await render(<OnboardingScreen />);

    await fireEvent.press(screen.getByTestId('onboarding-language-de'));
    await waitFor(() => expect(screen.getByText('Textgröße wählen')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(mockSave).toHaveBeenCalledWith({ done: true, locale: 'de', postalCode: null });
  });
});
