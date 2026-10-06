import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sınırlar taklit edilir (çerez, Supabase istemcisi, yönlendirme hedefi); kodun çevrilip çevrilmediğine göre verilen karar gerçek koddan.
const durum: {
  cerezler: { name: string; value: string }[];
  cevirmeHatasi: { message: string; code?: string } | null;
  kullanici: { id: string } | null;
} = { cerezler: [], cevirmeHatasi: null, kullanici: null };
const { captureError } = vi.hoisted(() => ({ captureError: vi.fn() }));

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => durum.cerezler }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: durum.cevirmeHatasi }),
      getUser: async () => ({ data: { user: durum.kullanici } }),
    },
  }),
}));
vi.mock('@/lib/auth/redirect', () => ({ resolvePostLoginRedirect: async () => '/fr/compte' }));
vi.mock('@/lib/identity/invite-handoff', () => ({ handOffInvitesToCustomer: async () => undefined }));
vi.mock('@/i18n/navigation', () => ({ getPathname: () => '/fr/connexion' }));
vi.mock('@lezzet/observability', () => ({ captureError, logger: { info: vi.fn() }, SOURCES: { webServer: 'web-server' } }));

import { GET } from './route';

const DOGRULAMA = { name: 'sb-proje-auth-token-code-verifier', value: 'x' };
const OTURUM = { name: 'sb-proje-auth-token.0', value: 'x' };
const donus = () => GET(new Request('https://test.lezzetanatolie.com/auth/callback?code=kod'));

describe('Google dönüşü', () => {
  beforeEach(() => captureError.mockClear());

  // Aynı tek kullanımlık kod ikinci kez geldiğinde (Android'de kurulu PWA) hata sayfasına gönderirse bu test kırmızıya döner.
  it('kod ilk istekte çevrilmişse, oturumu taşıyan ikinci istek girişi tamamlar', async () => {
    durum.cerezler = [OTURUM];
    durum.cevirmeHatasi = { message: 'invalid flow state' };
    durum.kullanici = { id: 'musteri' };

    const cevap = await donus();

    expect(cevap.headers.get('location')).toBe('https://test.lezzetanatolie.com/fr/compte');
    expect(captureError).not.toHaveBeenCalled();
  });

  // Önceden açık bir oturum gerçek bir çevirme hatasını örterse bu test kırmızıya döner.
  it('doğrulama çerezi varken kod çevrilemezse açık oturum girişi kurtarmaz ve hata iz bırakır', async () => {
    durum.cerezler = [DOGRULAMA, OTURUM];
    durum.cevirmeHatasi = { message: 'invalid grant' };
    durum.kullanici = { id: 'baska-hesap' };

    const cevap = await donus();

    expect(cevap.headers.get('location')).toBe('https://test.lezzetanatolie.com/fr/connexion?error=oauth');
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  // İkinci istek ilk çevirmenin cevabından önce gelince hata sayfasına düşerse bu test kırmızıya döner.
  it('kod öbür istekte çevrilirken (doğrulama çerezi var, oturum yok) giriş sayfası hatadan önce oturumu bekler', async () => {
    durum.cerezler = [DOGRULAMA];
    durum.cevirmeHatasi = { message: 'invalid flow state, no valid flow state found', code: 'flow_state_not_found' };
    durum.kullanici = null;

    const cevap = await donus();

    expect(cevap.headers.get('location')).toBe('https://test.lezzetanatolie.com/fr/connexion?error=oauth_pending');
    expect(captureError).not.toHaveBeenCalled();
  });

  // Bekleme bütün çevirme hatalarına yayılırsa gerçek hatalar gecikir; bu test o hâlde kırmızıya döner.
  it('doğrulama çerezi varken başka bir çevirme hatası beklemeden hata sayfasına gider', async () => {
    durum.cerezler = [DOGRULAMA];
    durum.cevirmeHatasi = { message: 'code challenge does not match previously saved code verifier', code: 'bad_code_verifier' };
    durum.kullanici = null;

    const cevap = await donus();

    expect(cevap.headers.get('location')).toBe('https://test.lezzetanatolie.com/fr/connexion?error=oauth');
    expect(captureError).toHaveBeenCalledTimes(1);
  });
});
