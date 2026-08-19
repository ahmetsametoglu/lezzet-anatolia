import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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
  await render(<CourierDayCloseScreen />);
  await waitFor(() => expect(screen.getByTestId('courier-day-close-body')).toBeOnTheScreen());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockBack.mockReset();
});

describe('K7 · sefer kapanışı', () => {
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

    expect(screen.getByTestId('courier-money-input-cash').props.value).toBe('42,00');
    expect(screen.getByTestId('courier-money-input-card').props.value).toBe('10,00');
    expect(screen.getByTestId('courier-money-diff-cash')).toHaveTextContent(/0,00/);
  });

  it('fark İŞARETLİDİR: eksik teslim eksi, fazla para artı', async () => {
    mockDraft(dayCloseDraft({ expected: { cashCents: 4200, cardCents: 1000, chequeCents: 0 } }));

    await renderClose();

    await fireEvent.changeText(screen.getByTestId('courier-money-input-cash'), '38,50');
    expect(screen.getByTestId('courier-money-diff-cash')).toHaveTextContent(/−3,50/);

    await fireEvent.changeText(screen.getByTestId('courier-money-input-card'), '12,00');
    expect(screen.getByTestId('courier-money-diff-card')).toHaveTextContent(/\+2,00/);
  });

  it('bozuk sayım girdisinde fark SIFIR gösterilmez, "bilinmiyor" çizgisi çıkar', async () => {
    mockDraft(dayCloseDraft({ expected: { cashCents: 4200, cardCents: 0, chequeCents: 0 } }));

    await renderClose();
    await fireEvent.changeText(screen.getByTestId('courier-money-input-cash'), 'kırk iki');

    expect(screen.getByTestId('courier-money-diff-cash')).toHaveTextContent('—');
  });

  it('kapanış İKİ ADIMLIDIR: onay kutusu çıkmadan uca hiçbir şey gitmez', async () => {
    mockDraft(dayCloseDraft({ expected: { cashCents: 4200, cardCents: 0, chequeCents: 0 } }));

    await renderClose();
    await fireEvent.press(screen.getByTestId('courier-day-close-cta'));

    expect(screen.getByTestId('courier-day-close-confirm-box')).toHaveTextContent(/geri alınamaz/);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);

    // Vazgeç ilk adıma döner.
    await fireEvent.press(screen.getByTestId('courier-day-close-cancel'));
    expect(screen.queryByTestId('courier-day-close-confirm-box')).toBeNull();
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
    await fireEvent.changeText(screen.getByTestId('courier-money-input-cash'), '40,00');
    await fireEvent.changeText(screen.getByTestId('courier-day-close-note'), 'Krutenau kolisi araçta kaldı');
    await fireEvent.press(screen.getByTestId('courier-day-close-cta'));
    await fireEvent.press(screen.getByTestId('courier-day-close-confirm'));

    await waitFor(() => expect(screen.getByTestId('courier-day-close-notice')).toBeOnTheScreen());
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      runId: courierRunBrief().runId,
      countedCashCents: 4000,
      countedCardCents: 0,
      countedChequeCents: 0,
      note: 'Krutenau kolisi araçta kaldı',
    });
    const notice = screen.getByTestId('courier-day-close-notice');
    expect(notice).toHaveTextContent(/nakit −2,00/);
    // Kapanışın çözdüğü takılı durak sessiz geçmez (K4).
    expect(notice).toHaveTextContent(/1 takılı durak çözüldü/);
    // Kapanış sonrası ekran kilitlenir: ikinci bir kapanış denemesi başlatılamaz.
    expect(screen.getByTestId('courier-day-close-readonly')).toBeOnTheScreen();
  });

  it('KAPANMIŞ sefer salt-okunur açılır: alanlar kilitli, CTA "zaten kapalı"', async () => {
    mockDraft(dayCloseDraft({ closed: closedDayRecord() }));

    await renderClose();

    expect(screen.getByTestId('courier-day-close-readonly')).toBeOnTheScreen();
    expect(screen.getByTestId('courier-money-input-cash').props.editable).toBe(false);
    expect(screen.getByTestId('courier-day-close-note').props.editable).toBe(false);
    expect(screen.getByText(t.dayClose.ctaClosed)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('courier-day-close-cta'));
    expect(screen.queryByTestId('courier-day-close-confirm-box')).toBeNull();
  });

  it('kapanmış seferin sayıları KAPANIŞ KAYDINDAN okunur (anın fotoğrafı), taslaktan değil', async () => {
    mockDraft(
      dayCloseDraft({
        closed: closedDayRecord({ expectedCashCents: 4200, countedCashCents: 4000 }),
        expected: { cashCents: 9900, cardCents: 0, chequeCents: 0 },
      }),
    );

    await renderClose();

    expect(screen.getByTestId('courier-money-input-cash').props.value).toBe('40,00');
    expect(screen.getByTestId('courier-money-diff-cash')).toHaveTextContent(/−2,00/);
    expect(screen.getByTestId('courier-day-close-note').props.value).toBe('Krutenau kolisi araçta kaldı');
  });

  it('`already_closed` bir HATA değil bir gerçektir: bilgi tonuyla gösterilir, ekran kilitlenir', async () => {
    mockDraft(dayCloseDraft(), { ok: false, reason: 'already_closed' });

    await renderClose();
    await fireEvent.press(screen.getByTestId('courier-day-close-cta'));
    await fireEvent.press(screen.getByTestId('courier-day-close-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('courier-day-close-notice')).toHaveTextContent(t.dayClose.alreadyClosed),
    );
    expect(screen.getByTestId('courier-day-close-readonly')).toBeOnTheScreen();
  });

  it('geri düğmesi durak listesine döner', async () => {
    mockDraft(dayCloseDraft());

    await renderClose();
    await fireEvent.press(screen.getByTestId('courier-day-close-header-back'));

    expect(mockBack).toHaveBeenCalled();
  });
});
