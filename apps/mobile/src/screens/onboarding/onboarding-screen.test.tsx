import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { OnboardingScreen } from './onboarding-screen';

/*
  ONBOARDING — depo mock'lu (görev kısıtı): sınanan şey akışın kendisi — adım geçişleri, maske,
  bölge kuralı, çıkışta ne saklandığı. Cihaz dili tr'ye sabit; "seçim ekran dilini değiştirmez"
  kararı tam da bu sabitle ölçülüyor (fr seçilir, metin tr kalır).
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockSave = jest.fn(async (_state: unknown): Promise<void> => undefined);
jest.mock('@/lib/onboarding/onboarding-store', () => ({
  saveOnboarding: (state: unknown) => mockSave(state),
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSave.mockClear();
});

/** İleri düğmesiyle adım atlar — dil seçmeden de ilerlenebildiğini her kullanım yeniden sınar. */
async function pressNext() {
  await fireEvent.press(screen.getByTestId('onboarding-next'));
}

describe('onboarding', () => {
  it('dil adımı LOCALES listesini çizer; cihaz dili önseçilidir, yalnız onda ✓ vardır', async () => {
    await render(<OnboardingScreen />);

    expect(screen.getByText('HOŞ GELDİNİZ · BIENVENUE')).toBeOnTheScreen();
    expect(screen.getByText('Hangi dilde devam edelim?')).toBeOnTheScreen();

    expect(within(screen.getByTestId('onboarding-language-tr')).getByText('✓')).toBeOnTheScreen();
    expect(within(screen.getByTestId('onboarding-language-fr')).queryByText('✓')).toBeNull();
    expect(within(screen.getByTestId('onboarding-language-de')).queryByText('✓')).toBeNull();
  });

  it('dil seçimi işareti taşır, kısa gecikmeyle posta kodu adımına geçer; EKRAN METNİ CİHAZ DİLİNDE KALIR', async () => {
    await render(<OnboardingScreen />);

    await fireEvent.press(screen.getByTestId('onboarding-language-fr'));
    expect(within(screen.getByTestId('onboarding-language-fr')).getByText('✓')).toBeOnTheScreen();

    // v3: seçimden 250 ms sonra kendiliğinden bir sonraki adım.
    await waitFor(() => expect(screen.getByTestId('onboarding-zip')).toBeOnTheScreen());
    // Fransızca seçildi ama sözlük cihaz dilinden okunmaya devam eder (kabuk kararı ayrı iş).
    expect(screen.getByText('TESLİMAT BÖLGESİ')).toBeOnTheScreen();
  });

  it('posta kodu maskesi yalnız rakam bırakır ve beş haneyle keser', async () => {
    await render(<OnboardingScreen />);
    await pressNext();

    const input = screen.getByTestId('onboarding-zip');
    await fireEvent.changeText(input, 'ab12cd3456789');
    expect(input.props.value).toBe('12345');
  });

  it('bölge kuralı: iki haneden önce sessiz, 67 bölge içi cümlesi, kalanı kargo cümlesi', async () => {
    await render(<OnboardingScreen />);
    await pressNext();

    const input = screen.getByTestId('onboarding-zip');

    await fireEvent.changeText(input, '6');
    expect(screen.queryByTestId('onboarding-zip-note')).toBeNull();

    await fireEvent.changeText(input, '67');
    expect(screen.getByTestId('onboarding-zip-note')).toHaveTextContent(
      'Harika — kapınıza ücretsiz teslim ediyoruz! Kapıda ödeme de kullanabilirsiniz.',
    );

    await fireEvent.changeText(input, '75000');
    expect(screen.getByTestId('onboarding-zip-note')).toHaveTextContent(
      'Soğuk zincir korumalı kargoyla 2–4 iş gününde ulaştırırız; 60 € üzeri kargo ücretsiz.',
    );
  });

  it('dört adım uçtan uca: son adımın CTA etiketi değişir; bitirince seçimler saklanır ve vitrine dönülür', async () => {
    await render(<OnboardingScreen />);
    expect(screen.getByTestId('onboarding-next')).toHaveTextContent('Devam');

    await pressNext(); // → posta kodu
    await fireEvent.changeText(screen.getByTestId('onboarding-zip'), '67000');

    await pressNext(); // → soğuk zincir
    expect(screen.getByText('SOĞUK ZİNCİR')).toBeOnTheScreen();
    expect(screen.getByText('Tazelik kapınıza kadar korunur')).toBeOnTheScreen();

    await pressNext(); // → ödeme
    expect(screen.getByText('Nasıl isterseniz öyle ödeyin')).toBeOnTheScreen();
    expect(screen.getByText('Online ödeme')).toBeOnTheScreen();
    expect(screen.getByText('Kapıda ödeme')).toBeOnTheScreen();
    expect(screen.getByText('Havale ve vadeli hesap')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-next')).toHaveTextContent('Alışverişe başla');

    await pressNext(); // → bitir
    expect(mockSave).toHaveBeenCalledWith({ done: true, locale: 'tr', postalCode: '67000' });
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('Atla çıkıştır: hiçbir şey seçilmediyse cihaz dili ve boş posta kodu (null) saklanır', async () => {
    await render(<OnboardingScreen />);

    await fireEvent.press(screen.getByTestId('onboarding-skip'));

    expect(mockSave).toHaveBeenCalledWith({ done: true, locale: 'tr', postalCode: null });
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('Atla o ana dek yapılan seçimi de taşır: seçilen dil kayda girer', async () => {
    await render(<OnboardingScreen />);

    await fireEvent.press(screen.getByTestId('onboarding-language-de'));
    await waitFor(() => expect(screen.getByTestId('onboarding-zip')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(mockSave).toHaveBeenCalledWith({ done: true, locale: 'de', postalCode: null });
  });
});
