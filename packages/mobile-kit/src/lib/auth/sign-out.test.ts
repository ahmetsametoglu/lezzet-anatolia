import { signOut } from './sign-out';
import { clearStoredSession } from './session-store';
import { getSupabase } from './supabase';

jest.mock('./supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('./session-store', () => ({ clearStoredSession: jest.fn(async () => undefined) }));

const supabaseSignOut = jest.fn();

beforeEach(() => {
  supabaseSignOut.mockReset();
  (clearStoredSession as jest.Mock).mockClear();
  (getSupabase as jest.Mock).mockReturnValue({ auth: { signOut: supabaseSignOut } });
});

describe('signOut', () => {
  it('cihaz oturumunu kapatır ve depoyu her durumda temizler', async () => {
    supabaseSignOut.mockResolvedValueOnce({ error: null });

    const result = await signOut();

    expect(result.error).toBeNull();
    expect(supabaseSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(clearStoredSession).toHaveBeenCalledTimes(1);
  });

  it('supabase temizliği düşse bile depo boşalır, hata Result ile döner (yutulmaz)', async () => {
    supabaseSignOut.mockResolvedValueOnce({ error: { message: 'ağ yok' } });

    const result = await signOut();

    expect(result.error).toBe('ağ yok');
    expect(clearStoredSession).toHaveBeenCalledTimes(1);
  });
});
