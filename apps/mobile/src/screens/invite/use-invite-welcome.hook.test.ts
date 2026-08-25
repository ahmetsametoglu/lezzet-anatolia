import { act, renderHook, waitFor } from '@testing-library/react-native';

/*
  DAVET KARŞILAMASI (21.45 · MB-56) — bağlantıya tıklayanın gördüğü ilk ekranın verisi.

  ── BU DOSYANIN KORUDUĞU ASIL ŞEY: İKİ KATMANIN AYRI KALMASI ────────────────
  Kancada **ağ hâli** ("cevap geldi mi") ile **iş hâli** ("kod kimin") ayrı yaşıyor. Karıştırmak
  kodu SADELEŞTİRİR ve tam o yüzden test ediliyor: bir ağ arızası `unknown`a katılırsa davetli,
  geçici bir bağlantı sorununda **kodunun geçersiz olduğunu** okur. Kod geçerlidir, tıklamıştır,
  arkadaşı çağırmıştır — ve ona "tanımadık" denir. Hiçbir yerde hata görünmez.

  Tersi de yanlış: `unknown` bir HATA değil, sunucunun verdiği KESİN cevaptır; onu `error`a
  katmak da davetliye "tekrar dene" dedirtirdi — hiç düzelmeyecek bir şey için.

  ── İKİNCİ KARAR: BOŞ KOD AĞA HİÇ ÇIKMAZ ────────────────────────────────────
  Bozuk bir bağlantı (`/invite/` — kodsuz) sunucuya sorulmaz; sunucunun vereceği cevap zaten
  `unknown` ve boşuna bir tur atmanın karşılığı yok. Bu kısa devre kalkarsa hiçbir şey bozulmaz,
  yalnız her bozuk bağlantı bir ağ turu doğurur — ölçülmezse görünmeyen cinsten.

  ── ÜÇÜNCÜ KARAR: ESKİMİŞ CEVAP YAZILMAZ ────────────────────────────────────
  "Tekrar dene"ye art arda basan parmak iki uçuş başlatır; yavaş olanın sonucu hızlıyı ezmemeli.
  Sayaç kalkarsa belirti şudur: davetli iki kez basar, ekran bir an doğruyu gösterir ve sonra
  ESKİ cevaba geri döner. Yeniden üretilmesi neredeyse imkânsız bir şikâyet.
*/

const mockFetchInviteWelcome = jest.fn();
jest.mock('@/lib/invite/invite-api', () => ({ fetchInviteWelcome: (code: string) => mockFetchInviteWelcome(code) }));

import { useInviteWelcome } from './use-invite-welcome.hook';

const ok = (data: unknown) => ({ data, error: null, status: 200, retryAfterSec: null });
/** `status: null` = istek hiç atılamadı (ağ) — 0 DEĞİL, bilinmiyor (CLAUDE §1). */
const fail = (status: number | null = null) => ({ data: null, error: 'hata', status, retryAfterSec: null });

beforeEach(() => {
  mockFetchInviteWelcome.mockReset();
});

async function karsilama(code: string) {
  const { result } = await renderHook(() => useInviteWelcome(code));
  await waitFor(() => expect(result.current.status).not.toBe('loading'));
  return result;
}

describe('davet karşılaması', () => {
  it('cevap gelene kadar YÜKLENİYOR — ekran hiçbir şey iddia etmeden bekler', async () => {
    mockFetchInviteWelcome.mockImplementation(() => new Promise(() => {}));
    const { result } = await renderHook(() => useInviteWelcome('ABC123'));

    expect(result.current.status).toBe('loading');
  });

  it('geçerli kod davet edenin ADIYLA döner', async () => {
    mockFetchInviteWelcome.mockResolvedValue(ok({ status: 'ok', referrerName: 'Ayşe' }));
    const result = await karsilama('ABC123');

    expect(result.current.status).toBe('ready');
    if (result.current.status !== 'ready') throw new Error('karşılama kurulamadı');
    expect(result.current.data).toEqual({ status: 'ok', referrerName: 'Ayşe' });
  });

  it.each([['unknown'], ['self'], ['already_customer']])(
    '`%s` bir CEVAPTIR, hata değil — ekran onu çizer, "tekrar dene" demez',
    async (status) => {
      // Kritik ayrım: bunlar sunucunun KESİN cevapları. `error`a katılsalardı davetli, hiç
      // düzelmeyecek bir şey için tekrar denemeye davet edilirdi.
      mockFetchInviteWelcome.mockResolvedValue(ok({ status }));
      const result = await karsilama('ABC123');

      expect(result.current.status).toBe('ready');
      if (result.current.status !== 'ready') throw new Error('karşılama kurulamadı');
      expect(result.current.data.status).toBe(status);
    },
  );

  it.each([
    ['ağ yok', null],
    ['sunucu arızası', 500],
  ])('%s → HATA, "tanımadık" DEĞİL — geçerli kod geçersiz gibi okunmasın', async (_ad, status) => {
    mockFetchInviteWelcome.mockResolvedValue(fail(status));
    const result = await karsilama('ABC123');

    expect(result.current.status).toBe('error');
  });

  it('BOŞ kod ağa HİÇ çıkmaz — doğrudan "tanımadık"a düşer', async () => {
    const result = await karsilama('');

    expect(mockFetchInviteWelcome).not.toHaveBeenCalled();
    if (result.current.status !== 'ready') throw new Error('karşılama kurulamadı');
    expect(result.current.data).toEqual({ status: 'unknown' });
  });

  it('YALNIZ BOŞLUK olan kod da ağa çıkmaz', async () => {
    // `/invite/%20` gibi bir bağlantı bozuktur; `trim` olmasaydı sunucuya boşluk sorulurdu.
    const result = await karsilama('   ');

    expect(mockFetchInviteWelcome).not.toHaveBeenCalled();
    if (result.current.status !== 'ready') throw new Error('karşılama kurulamadı');
    expect(result.current.data.status).toBe('unknown');
  });

  it('`retry` gerçekten yeniden sorar ve düzelen cevapla karşılama kurulur', async () => {
    mockFetchInviteWelcome.mockResolvedValue(fail());
    const result = await karsilama('ABC123');
    expect(result.current.status).toBe('error');

    mockFetchInviteWelcome.mockResolvedValue(ok({ status: 'ok', referrerName: 'Ayşe' }));
    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockFetchInviteWelcome).toHaveBeenCalledTimes(2);
  });

  it('`retry` HER hâlde erişilebilir — hata dalında saklı değil', async () => {
    // Karşılama ekranı düğmeyi hâle göre çiziyor ama kanca kararı ekrana bırakıyor: `loading`
    // hâlinde de tazeleme meşru bir istek (bağlantı geldi, kullanıcı bekliyor).
    mockFetchInviteWelcome.mockResolvedValue(ok({ status: 'ok', referrerName: 'Ayşe' }));
    const result = await karsilama('ABC123');

    expect(typeof result.current.retry).toBe('function');
  });

  it('ESKİMİŞ cevap taze olanı EZMEZ — art arda basılan "tekrar dene"', async () => {
    // Arızanın belirtisi neredeyse üretilemez bir şikâyettir: ekran bir an doğruyu gösterir,
    // sonra eski cevaba geri döner. Sayaç kalkarsa bu test kırmızı yanar.
    let yavasCevap!: (v: unknown) => void;
    mockFetchInviteWelcome.mockImplementationOnce(() => new Promise((r) => (yavasCevap = r)));
    const { result } = await renderHook(() => useInviteWelcome('ABC123'));

    // İkinci basış: hızlı cevap gelir ve yerleşir.
    mockFetchInviteWelcome.mockResolvedValue(ok({ status: 'ok', referrerName: 'TAZE' }));
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Şimdi İLK uçuş geç cevap veriyor — yazılmamalı.
    await act(async () => {
      yavasCevap(ok({ status: 'ok', referrerName: 'ESKİ' }));
    });

    if (result.current.status !== 'ready') throw new Error('karşılama kurulamadı');
    expect(result.current.data).toEqual({ status: 'ok', referrerName: 'TAZE' });
  });

  it('KOD DEĞİŞİRSE yeniden sorulur — aynı ekranda ikinci bir bağlantı açılabilir', async () => {
    mockFetchInviteWelcome.mockResolvedValue(ok({ status: 'ok', referrerName: 'Ayşe' }));
    // Props tipi AÇIKÇA yazılıyor: `initialProps` aşırı yüklemesinde çıkarım düşüyor ve
    // `result.current` `unknown` kalıyor — iddia derlenir ama hiçbir şey söylemez.
    const { result, rerender } = await renderHook((props: { code: string }) => useInviteWelcome(props.code), {
      initialProps: { code: 'ABC123' },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    mockFetchInviteWelcome.mockResolvedValue(ok({ status: 'ok', referrerName: 'Mehmet' }));
    await act(async () => {
      await rerender({ code: 'XYZ789' });
    });

    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('henüz hazır değil');
      expect(result.current.data).toEqual({ status: 'ok', referrerName: 'Mehmet' });
    });
    expect(mockFetchInviteWelcome).toHaveBeenLastCalledWith('XYZ789');
  });
});
