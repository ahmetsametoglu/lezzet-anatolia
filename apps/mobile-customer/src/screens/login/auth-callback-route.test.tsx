import { render } from '@testing-library/react-native';

import AuthCallbackRoute from '@/app/auth/callback';

let mockParams: { code?: string; next?: string } = {};
const mockScreen = jest.fn((_props: { homeRoute: unknown }) => null);
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
jest.mock('@/screens/login/auth-callback-screen', () => ({
  AuthCallbackScreen: (props: { homeRoute: unknown }) => mockScreen(props),
}));

describe('AuthCallbackRoute', () => {
  // Derin bağlantıya dışarıdan yazılan hedef uygulamayı liste dışı bir rotaya götürürse kırmızıya döner.
  it('dönüş hedefi yalnız izinli listeden; liste dışı hedef hesap sekmesine düşer', async () => {
    mockParams = { code: 'kod', next: '/cart' };
    await render(<AuthCallbackRoute />);
    expect(mockScreen).toHaveBeenLastCalledWith(expect.objectContaining({ homeRoute: '/cart' }));

    mockParams = { code: 'kod', next: '/checkout' };
    await render(<AuthCallbackRoute />);
    expect(mockScreen).toHaveBeenLastCalledWith(expect.objectContaining({ homeRoute: '/account' }));
  });
});
