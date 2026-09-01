import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ToastHost } from '@/components/ui/toast-host';
import { resetToast } from '@/lib/toast/toast-store';

/*
  SAYIM ARTIK TUŞ TAKIMIYLA YAZILIYOR (v3 · `00-ortak`, 30.08). Alan bir `TextInput` değil, tuş
  takımını açan bir düğme; testler de kapıdaki gerçek yolu izliyor: alana dokun → rakamlara bas →
  "Yaz". Doğrudan metin yazmak, artık var olmayan bir yolu ölçmek olurdu.
*/
async function typeAmount(method: 'cash' | 'card' | 'cheque', amount: string) {
  await fireEvent.press(screen.getByTestId(`courier-money-input-${method}`));
  for (const key of amount) {
    await fireEvent.press(screen.getByTestId(`courier-money-keypad-key-${key}`));
  }
  await fireEvent.press(screen.getByTestId('courier-money-keypad-confirm'));
}

import { CourierDayCloseScreen } from './day-close-screen';
import { closedDayRecord, courierRunBrief, courierStop, dayCloseDraft } from './courier-fixture';
import messages from './messages.json';

/*
  K7 EKRAN TESTİ — sayaçlar, işaretli fark, iki adımlı onay, kapanmış seferin salt-okunurluğu ve
  `already_closed`ın bir HATA değil bir GERÇEK olarak gösterilmesi.

  Hook taklit edilmez: gerçek hook + taklit `fetch` (K1 ve teslimat testleriyle aynı karar).

  KAPANIŞIN ÖZNESİ SEFER (18.08): taslak seferin künyesini taşır, kapatma isteği `runId` ile gider.
*/

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: () => mockBack(), navigate: jest.fn(), push: jest.fn() }),
}));

const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

const t = messages;

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function envelope(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function mockDraft(draft: unknown, closeResult?: unknown) {
  fetchMock.mockImplementation((url, init) => {
    if (init?.method === 'POST') {
      return Promise.resolve(
        envelope(
          closeResult ?? {
            ok: true,
            id: '00000000-0000-4000-8000-000000000099',
            differenceCashCents: 0,
            differenceCardCents: 0,
            differenceChequeCents: 0,
          },
        ),
      );
    }
    if (draft === null) {
      return Promise.resolve({
        status: 500,
        headers: { get: () => null },
        json: async () => ({ data: null, error: 'server_error' }),
      } as unknown as Response);
    }
    return Promise.resolve(envelope(draft));
  });
}

async function renderClose() {
  /* TOAST HOST TESTTE DE ÇİZİLİR (01.09): kapanışın sonucu artık ekranda değil toast'ta ve
     iddiaların okuduğu yer orası — sahte bir gözcü değil, gerçek kanal. */
  await render(
    <>
      <CourierDayCloseScreen />
      <ToastHost />
    </>,
  );
  await waitFor(() => expect(screen.getByTestId('courier-day-close-body')).toBeOnTheScreen());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockBack.mockReset();
  // Toast MODÜL düzeyinde: sayacı düşmezse mesaj sonraki teste sızar, süreç de kapanmaz.
  resetToast();
});

describe('K7 · sefer kapanışı', () => {
  /* İLK YÜK İSKELET, HALKA DEĞİL (N9 · 30.08) — ayıran iz ROL: halka `progressbar`dır. */
  it('yüklenirken İSKELET gösterir, halka değil', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    await render(<CourierDayCloseScreen />);

    expect(screen.getByTestId('courier-day-close-loading')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('taslak okunamazsa hata bloğu çıkar, boş bir kapanış formu AÇILMAZ', async () => {
    mockDraft(null);

    await render(<CourierDayCloseScreen />);

    await waitFor(() => expect(screen.getByTestId('courier-day-close-error')).toBeOnTheScreen());
    expect(screen.queryByTestId('courier-day-close-cta')).toBeNull();
  });

  it('üç sayaç taslaktan sayılır; sonuçlanmamış durak UYARIR ama engellemez', async () => {
    mockDraft(
      dayCloseDraft({
        delivered: [courierStop(1), courierStop(2)],
        pending: [courierStop(3)],
        returned: [courierStop(4)],
      }),
    );

    await renderClose();

    // Kapanışın öznesi başlıkta yazılı: kurye hangi seferi kapattığını okumadan onaylamamalı.
    expect(screen.getByText('Kuzey rotası · SF-26-ABCDEF')).toBeOnTheScreen();
    expect(screen.getByTestId('courier-count-delivered')).toHaveTextContent(/2/);
    expect(screen.getByTestId('courier-count-pending')).toHaveTextContent(/1/);
    expect(screen.getByTestId('courier-count-returned')).toHaveTextContent(/1/);
    expect(screen.getByTestId('courier-day-close-warning')).toHaveTextContent(/1 durak sonuçlanmadı/);
    expect(screen.getByTestId('courier-day-close-cta')).toBeOnTheScreen();
  });

  it('sayım alanları BEKLENENLE açılır ve fark sıfırdır', async () => {
    mockDraft(dayCloseDraft({ expected: { cashCents: 4200, cardCents: 1000, chequeCents: 0 } }));

    await renderClose();

    expect(screen.getByTestId('courier-money-input-cash')).toHaveTextContent('42,00');
    expect(screen.getByTestId('courier-money-input-card')).toHaveTextContent('10,00');
    expect(screen.getByTestId('courier-money-diff-cash')).toHaveTextContent(/0,00/);
  });

  it('fark İŞARETLİDİR: eksik teslim eksi, fazla para artı', async () => {
    mockDraft(dayCloseDraft({ expected: { cashCents: 4200, cardCents: 1000, chequeCents: 0 } }));

    await renderClose();

    await typeAmount('cash', '38,50');
    expect(screen.getByTestId('courier-money-diff-cash')).toHaveTextContent(/−3,50/);

    await typeAmount('card', '12,00');
    expect(screen.getByTestId('courier-money-diff-card')).toHaveTextContent(/\+2,00/);
  });

  it('SAYILMAMIŞ kasada fark SIFIR gösterilmez, "bilinmiyor" çizgisi çıkar', async () => {
    mockDraft(dayCloseDraft({ expected: { cashCents: 4200, cardCents: 0, chequeCents: 0 } }));

    await renderClose();
    /* Tuş takımıyla "bozuk metin" yazılamaz ama alan BOŞALTILABİLİR — ve boş bir kasa
       sayılmamıştır. Ölçülemeyen fark sıfır değildir (CLAUDE §1): ekran "—" der. */
    await fireEvent.press(screen.getByTestId('courier-money-input-cash'));
    for (let i = 0; i < 5; i += 1) {
      await fireEvent.press(screen.getByTestId('courier-money-keypad-delete'));
    }
    await fireEvent.press(screen.getByTestId('courier-money-keypad-confirm'));

    expect(screen.getByTestId('courier-money-diff-cash')).toHaveTextContent('—');
  });

  it('kapanış İKİ ADIMLIDIR: onay kutusu çıkmadan uca hiçbir şey gitmez', async () => {
    mockDraft(dayCloseDraft({ expected: { cashCents: 4200, cardCents: 0, chequeCents: 0 } }));

    await renderClose();
    await fireEvent.press(screen.getByTestId('courier-day-close-cta'));

    expect(screen.getByTestId('courier-day-close-sheet')).toHaveTextContent(/geri alınamaz/);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);

    // Vazgeç ilk adıma döner.
    await fireEvent.press(screen.getByTestId('courier-day-close-sheet-cancel'));
    expect(screen.queryByTestId('courier-day-close-sheet')).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('onaylanınca SEFER kimliği + sayılan tutarlar ve not uca CENT olarak gider; sonuç farkı yazılır', async () => {
    mockDraft(dayCloseDraft({ expected: { cashCents: 4200, cardCents: 0, chequeCents: 0 } }), {
      ok: true,
      differenceCashCents: -200,
      differenceCardCents: 0,
      differenceChequeCents: 0,
      releasedCount: 1,
    });

    await renderClose();
    await typeAmount('cash', '40,00');
    await fireEvent.changeText(screen.getByTestId('courier-day-close-note'), 'Krutenau kolisi araçta kaldı');
    await fireEvent.press(screen.getByTestId('courier-day-close-cta'));
    await fireEvent.press(screen.getByTestId('courier-day-close-sheet-confirm'));

    await waitFor(() => expect(screen.getByTestId('toast-message')).toBeOnTheScreen());
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      runId: courierRunBrief().runId,
      countedCashCents: 4000,
      countedCardCents: 0,
      countedChequeCents: 0,
      note: 'Krutenau kolisi araçta kaldı',
    });
    const notice = screen.getByTestId('toast-message');
    expect(notice).toHaveTextContent(/nakit −2,00/);
    // Kapanışın çözdüğü takılı durak sessiz geçmez (K4).
    expect(notice).toHaveTextContent(/1 takılı durak çözüldü/);
    /* KAPANAN SEFER GERİDE BIRAKILIR (01.09 · kullanıcı bulgusu): ekran kilitlenip yerinde
       kalıyordu ve kurye kapattığı seferi karşısında görmeye devam ediyordu. Ekran artık kendini
       kapatıyor; kilit hâlâ var ama onu görecek olan yalnız kapalı bir kaydı yeniden AÇAN kurye. */
    expect(mockBack).toHaveBeenCalled();
  });

  it('KAPANMIŞ sefer salt-okunur açılır: alanlar kilitli, CTA "zaten kapalı"', async () => {
    mockDraft(dayCloseDraft({ closed: closedDayRecord() }));

    await renderClose();

    expect(screen.getByTestId('courier-day-close-readonly')).toBeOnTheScreen();
    expect(screen.getByTestId('courier-money-input-cash')).toBeDisabled();
    expect(screen.getByTestId('courier-day-close-note').props.editable).toBe(false);
    expect(screen.getByText(t.dayClose.ctaClosed)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('courier-day-close-cta'));
    expect(screen.queryByTestId('courier-day-close-sheet')).toBeNull();
  });

  it('kapanmış seferin sayıları KAPANIŞ KAYDINDAN okunur (anın fotoğrafı), taslaktan değil', async () => {
    mockDraft(
      dayCloseDraft({
        closed: closedDayRecord({ expectedCashCents: 4200, countedCashCents: 4000 }),
        expected: { cashCents: 9900, cardCents: 0, chequeCents: 0 },
      }),
    );

    await renderClose();

    expect(screen.getByTestId('courier-money-input-cash')).toHaveTextContent('40,00');
    expect(screen.getByTestId('courier-money-diff-cash')).toHaveTextContent(/−2,00/);
    expect(screen.getByTestId('courier-day-close-note').props.value).toBe('Krutenau kolisi araçta kaldı');
  });

  it('`already_closed` bir HATA değil bir gerçektir: bilgi tonuyla gösterilir, ekran kilitlenir', async () => {
    mockDraft(dayCloseDraft(), { ok: false, reason: 'already_closed' });

    await renderClose();
    await fireEvent.press(screen.getByTestId('courier-day-close-cta'));
    await fireEvent.press(screen.getByTestId('courier-day-close-sheet-confirm'));

    await waitFor(() => expect(screen.getByTestId('toast-message')).toHaveTextContent(t.dayClose.alreadyClosed));
    /* `already_closed`ta ekran KAPANMAZ: yeni bir kapanış olmadı, kurye zaten kapalı bir kaydı
       açtı ve salt-okunur hâli görmeli — geri atmak "kapattım" izlenimi verirdi. */
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByTestId('courier-day-close-readonly')).toBeOnTheScreen();
  });

  it('geri düğmesi durak listesine döner', async () => {
    mockDraft(dayCloseDraft());

    await renderClose();
    await fireEvent.press(screen.getByTestId('courier-day-close-header-back'));

    expect(mockBack).toHaveBeenCalled();
  });
});
