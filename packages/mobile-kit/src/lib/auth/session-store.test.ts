import * as SecureStore from 'expo-secure-store';
import { AUTH_STORAGE_KEY, clearStoredSession, secureStoreAdapter } from './session-store';

// jest-expo native mock'u fonksiyon gövdesi vermez; davranışı burada kontrol edilir kılıyoruz.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'stored-value'),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const mocked = SecureStore as jest.Mocked<typeof SecureStore>;

beforeEach(() => jest.clearAllMocks());

describe('SecureStore adapter — supabase storage köprüsü', () => {
  it('get/set/remove çağrıları SecureStore karşılıklarına aynı anahtar/değerle gider', async () => {
    await expect(secureStoreAdapter.getItem('k')).resolves.toBe('stored-value');
    expect(mocked.getItemAsync).toHaveBeenCalledWith('k');

    await secureStoreAdapter.setItem('k', 'v');
    expect(mocked.setItemAsync).toHaveBeenCalledWith('k', 'v');

    await secureStoreAdapter.removeItem('k');
    expect(mocked.deleteItemAsync).toHaveBeenCalledWith('k');
  });

  it('clearStoredSession sabit oturum anahtarını siler', async () => {
    await clearStoredSession();
    expect(mocked.deleteItemAsync).toHaveBeenCalledWith(AUTH_STORAGE_KEY);
  });
});
