import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { OperationsStaffMenu } from './staff-menu';

/*
  KİMLİK MENÜSÜ — KÖPRÜNÜN ERTELENMİŞ YÖNLENDİRMESİ (21.121).

  Çivilenen karar: "Müşteri uygulamasına geç" basış anında YÖNLENDİRMEZ — çekmece kapanıp
  söküldükten sonra yönlendirir. Basış anında `router.replace` cihazda 4/4 tekrarlanan bir
  Fabric çökmesiydi (Modal'ın sökümü + yeni kabuğun ilk mount'u aynı pencerede — ölçüm ve
  gerekçe `bottom-sheet.tsx`in `onClosed` künyesinde). Bu test o sırayı sabitler: replace
  YALNIZ kapanış zinciri tamamlanınca ve '/' hedefiyle çağrılır.
*/

// Ad `mock` ile başlamak ZORUNDA (jest hoisting) — yönlendirme iddiaları bu casusa bakar.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, navigate: jest.fn(), back: jest.fn() }),
}));

// signOut supabase'e uzanır; bu testin konusu değil.
jest.mock('@/lib/auth/sign-out', () => ({ signOut: jest.fn() }));

async function renderMenu() {
  await render(
    <OperationsSessionProvider
      value={{ sections: ['management'], userName: 'Selin Kaya', userEmail: 'yonetim@lezzetanatolia.fr' }}
    >
      <OperationsStaffMenu testID="staff-avatar" />
    </OperationsSessionProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockReset();
});

describe('OperationsStaffMenu · müşteri köprüsü', () => {
  it('geçiş, çekmece söküldükten SONRA ve köke replace ile yapılır', async () => {
    // Casus, sıranın kendisini ölçer: replace ÇAĞRILDIĞI ANDA çekmece hâlâ ekranda mıydı?
    // Sonradan bakmak yetmez — basışta-yönlendiren sabotajda da çekmece "sonunda" kapanır.
    let sheetOpenAtReplace: boolean | null = null;
    mockReplace.mockImplementation(() => {
      sheetOpenAtReplace = screen.queryByTestId('operations-staff-to-customer') !== null;
    });
    await renderMenu();

    await fireEvent.press(screen.getByTestId('staff-avatar'));
    expect(screen.getByTestId('operations-staff-to-customer')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('operations-staff-to-customer'));

    // Yönlendirme kapanış zincirinin ucunda gelir (onClosed, bir kare erteleme) — ve `replace`
    // ile: kabuk yığında altta kalsaydı geri tuşu personeli izinsiz geri taşırdı.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockReplace).toHaveBeenCalledTimes(1);
    // Çekmece, yönlendirme ANINDA çoktan sökülmüştü — replace açık bir Modal'ın üstüne binmedi.
    expect(sheetOpenAtReplace).toBe(false);
  });

  it('çekmeceyi geçiş NİYETİ olmadan kapatmak yönlendirmez', async () => {
    await renderMenu();

    await fireEvent.press(screen.getByTestId('staff-avatar'));
    await fireEvent.press(screen.getByTestId('staff-avatar-sheet-scrim', { includeHiddenElements: true }));

    await waitFor(() => expect(screen.queryByTestId('operations-staff-to-customer')).toBeNull());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
