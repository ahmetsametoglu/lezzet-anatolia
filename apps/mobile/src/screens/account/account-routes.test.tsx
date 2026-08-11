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
/*
  `/me` OKUMASININ SÜRESİ TESTİN ELİNDE (MB-35): "kimlik okunurken sekme ne çiziyor" sorusu ancak
  ÇÖZÜLMEYEN bir okumayla ölçülebilir — gerçek okuma testte anında bitiyor ve o an hiç görülmüyor.
  Bayrak `mock` önekli çünkü `jest.mock` fabrikası yalnız bu önekli değişkenleri görebiliyor.
*/
let mockMePending = false;
jest.mock('@/lib/api/me', () => {
  const actual = jest.requireActual('@/lib/api/me');
  return { ...actual, fetchMe: () => (mockMePending ? new Promise(() => undefined) : actual.fetchMe()) };
});

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

  /*
    BU TEST DOSYADA İLK SIRADA DURMALI: kimlik durumu `use-me.hook`ta MODÜL düzeyinde yaşıyor
    (tek durum, çok abone — künyesi orada) ve Jest modül kaydını dosya başına bir kez kuruyor.
    Aşağıdaki test oturumu `guest`e çözünce durum orada kalır; ondan sonra çalışan hiçbir test
    `loading` hâlini bir daha göremez.
  */
  it('kimlik OKUNURKEN sekme boş kalmaz — nötr yer tutucu çizilir (MB-35)', async () => {
    mockMePending = true;
    await renderShell('/account');

    // Bekleme GÖRÜNÜR: boş sekme, oturumun misafire düştüğü ayrı arızayla karışıyordu.
    expect(screen.getByTestId('account-loading')).toBeOnTheScreen();

    // Ama hiçbir hâl İDDİA EDİLMEZ: ne misafir daveti ne girişli profil kartı.
    expect(screen.queryByTestId('account-guest')).toBeNull();
    expect(screen.queryByTestId('account-profile')).toBeNull();

    mockMePending = false;
  });

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
