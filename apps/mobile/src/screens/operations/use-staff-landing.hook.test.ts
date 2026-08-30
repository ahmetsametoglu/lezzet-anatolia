import { renderHook, waitFor } from '@testing-library/react-native';

import { meFixture } from './me-fixture';

/*
  AÇILIŞTA ROL KARARI (21.97) — "kurye uygulamayı kapatıp açınca rotasını kaybediyor"un düzeltmesi.

  ── ÖLÇÜLEN ARIZA, SAHADAN ────────────────────────────────────────────────────
  Giriş yapan personel kabuğa gidiyordu ama uygulama YENİDEN açılınca aynı oturum müşteri
  sekmelerinde başlıyordu. Sefer şeridinin cihaz turunda görüldü (18.08, CPH1907): kurye gün
  ortasında uygulamayı kapatıp açarsa rotasına ancak ÇIKIP yeniden girerek ulaşıyor.

  ── DÖRT KARAR, DÖRDÜ DE SESSİZ BOZULUR ─────────────────────────────────────
  1. **YALNIZ KÖKTE.** Derin bağla açılan uygulamada (`/invite/…`) kullanıcı istediği yerdedir;
     kabuk onu çekip alsaydı bağ sessizce ölürdü. Personel de bir müşteridir — kendi davet bağına
     basan kurye o ekranı görmeli.
  2. **KÖK DIŞINDA BAYRAK TÜKETİLMEZ.** Derin bağla açılan uygulamada karar ERTELENİR; kullanıcı
     köke döndüğünde hâlâ hakkıdır. Bayrağı orada da yakan bir yazım, kuryeyi o açılış boyunca
     rotasız bırakır ve hiçbir yerde hata vermez.
  3. **TEK ATIŞ.** Köprüden müşteri yüzeyine geçen personel geri fırlatılmaz.
  4. **`replace`, `push` DEĞİL.** Geri tuşu kuryeyi vitrine geri atmamalı.

  Üçü de "yanlış davranış" üretmez, YANLIŞ YERE GÖTÜRÜR — ve bir ekranın nerede açıldığı hata
  günlüğüne düşmez.

  ── KARARI KENDİ HESAPLAMAZ ─────────────────────────────────────────────────
  `operationsHomeRoute` GERÇEK çalışıyor (taklit edilmedi): girişin okuduğu kuralla açılışın
  okuduğu kural aynı olmalı. Taklit edilseydi test, ayrışmayı ölçemeyeceği bir dünyayı doğrulardı.
*/

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockPathname = '/';
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockPathname,
}));

const mockUseMe = jest.fn();
jest.mock('@/screens/customer-kit/use-me.hook', () => ({ useMe: () => mockUseMe() }));

import { markStaffLandingDone, resetStaffLanding, useStaffLanding } from './use-staff-landing.hook';

const hazir = (roles: Parameters<typeof meFixture>[0]) => ({ status: 'ready', me: meFixture(roles) });

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  mockUseMe.mockReset();
  mockPathname = '/';
  resetStaffLanding();
});

async function acilis() {
  const view = await renderHook(() => useStaffLanding());
  return view;
}

describe('açılışta rol kararı', () => {
  it('KURYE rotasına taşınır — kapatıp açan personel rotasını kaybetmez', async () => {
    mockUseMe.mockReturnValue(hazir(['courier']));
    await acilis();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/courier'));
  });

  it('MÜŞTERİ yerinde bırakılır — müşteri de bir cevaptır', async () => {
    mockUseMe.mockReturnValue(hazir([]));
    await acilis();

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('`replace` kullanılır, `push` DEĞİL — geri tuşu kuryeyi vitrine fırlatmasın', async () => {
    mockUseMe.mockReturnValue(hazir(['courier']));
    await acilis();

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('CEVAP GELMEDEN karar verilmez — şebekesiz açılışta uygulama yine de açılır', async () => {
    mockUseMe.mockReturnValue({ status: 'loading', me: null });
    await acilis();

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('KİMLİK OKUNAMADIYSA yönlendirme yok — bilinmeyen, "müşteri" DEĞİLDİR', async () => {
    mockUseMe.mockReturnValue({ status: 'error', me: null });
    await acilis();

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('DERİN BAĞ ezilmez — davet bağıyla açılan uygulama kabuğa çekilmez', async () => {
    mockPathname = '/invite/ABC123';
    mockUseMe.mockReturnValue(hazir(['courier']));
    await acilis();

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('derin bağda karar ERTELENİR, iptal EDİLMEZ — köke dönünce hakkı sürer', async () => {
    // İkinci kararın çivisi ve en kolay bozulan yer: bayrağı kök dışında da yakan bir yazım bu
    // testte kırmızı yanar, ötekilerin hepsi yeşil kalır.
    mockPathname = '/invite/ABC123';
    mockUseMe.mockReturnValue(hazir(['courier']));
    await acilis();
    expect(mockReplace).not.toHaveBeenCalled();

    mockPathname = '/';
    await acilis();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/courier'));
  });

  it('TEK ATIŞ — aynı açılışta ikinci kez yönlendirilmez', async () => {
    mockUseMe.mockReturnValue(hazir(['courier']));
    await acilis();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));

    await acilis();

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('KÖPRÜ kendini iptal etmez — müşteri yüzeyine geçen personel geri fırlatılmaz', async () => {
    // Taze giriş yapan personel kabuğa `post-login-route` üstünden gider, yani bayrak hiç
    // tüketilmemiştir. Köprüye bastığı an sekme kabuğu monte olur; `markStaffLandingDone`
    // olmasaydı kanca "bu açılışta henüz karar vermedim" der ve onu operasyona geri atardı.
    mockUseMe.mockReturnValue(hazir(['courier']));
    markStaffLandingDone();

    await acilis();

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('MÜŞTERİ cevabı da bayrağı tüketir — her köke dönüşte `/me` yeniden tartılmaz', async () => {
    mockUseMe.mockReturnValue(hazir([]));
    await acilis();

    // Aynı açılışta rolleri "değişse" bile karar yeniden verilmez: soru "bu AÇILIŞTA nereye
    // inilir"di ve cevabı alındı.
    mockUseMe.mockReturnValue(hazir(['courier']));
    await acilis();

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('ÇOK ROLLÜ personel bölüm SIRASINA iner — sunucunun rol sırasına değil', async () => {
    /* `operationsHomeRoute` TASARIMIN sırasını kullanıyor — v3'te **Depo → Kurye → Yönetim → Para**
       (30.08'de düzeltildi; kod v2'nin sırasını izliyordu). Sunucu `roles`u başka sırayla
       döndürdüğü gün açılış bölümü DEĞİŞMEMELİ: burada roller kurye önce yazılıyor ama personel
       yine depoya iniyor. */
    mockUseMe.mockReturnValue(hazir(['courier', 'warehouse']));
    await acilis();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/warehouse'));
  });
});
