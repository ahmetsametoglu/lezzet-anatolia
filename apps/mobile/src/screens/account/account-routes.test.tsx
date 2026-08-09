import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { renderShell } from '@/testing/render-shell';

/*
  HESAP ROTALARININ SMOKE TESTİ — düzenleme sayfası `(tabs)/account.tsx`in YANINA değil, `app/`
  altında AYRI bir klasöre (`app/account/edit.tsx`) yazıldı. İki dosya aynı adın iki kademesini
  tutuyor (`/account` sekmesi · `/account/edit` yığın sayfası) ve birinin ötekini gölgelemediği
  ancak gerçek rota ağacı ayağa kalkınca görülür — bu testin koruduğu değişmez odur.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

// İlk-açılış kapısı tamamlanmış sayılır (modül-yanı mock — gerekçesi mock dosyasının başlığında):
// bayraksız ortamda kök layout her müşteri rotasını onboarding'e çevirirdi; bu testin konusu o değil.
jest.mock('@/lib/onboarding/onboarding-store');

// Hesap rotası artık oturumu okuyor (`useMe`, 21.14c); bu ortamda Supabase env'i yok — istemci
// mock'lanır, oturumsuz hâl döner. Rota testinin konusu GÖLGELENME, kimlik hâlleri ekran testinde.
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      refreshSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

describe('hesap rotaları', () => {
  // `/account/edit` rotası BİLEREK YOK (kullanıcı kararı 08.08): profil düzenleme v3'teki gibi
  // hesap ekranının İÇİNDEKİ çekmecedir (`account-screen.test` kanıtlıyor); ayrı sayfa söküldü.

  it('misafir /account açınca GİRİŞ sayfası doğrudan gelir; vazgeçince karşılama durur (08.08)', async () => {
    const { app } = await renderShell('/account');

    // Misafir sekmeye gelir gelmez login İTİLİR (v3 karşılama bloğu fazladan dokunuştu).
    await waitFor(() => expect(app).toHavePathname('/login'));

    // Girişten vazgeçen kişi ikinci kez itilmez: hesapta karşılama bloğu (yedek kapı) görünür.
    await fireEvent.press(screen.getByTestId('login-back'));
    await waitFor(() => expect(app).toHavePathname('/account'));
    await waitFor(() => expect(screen.getByTestId('account-guest')).toBeOnTheScreen());
    expect(screen.queryByTestId('profile-form')).toBeNull();
  });
});
