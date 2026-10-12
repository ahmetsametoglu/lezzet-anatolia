import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { FeedbackScreen } from './feedback-screen';
import { feedbackCard, feedbackCompletion, feedbackInvite } from './feedback-fixture';
import messages from '@lezzet/i18n/customer/feedback';

/*
  Tel cevabı sahte `fetch`ten gelir ve ekran gerçek istemci yolunu (şema doğrulaması dahil) katederek çizilir, bu yüzden kanca ayrıca
  sınanmaz. Cihaz dili tr-TR'ye sabitlenir ki beklenen metinler koşulan makinenin diline bağlı olmasın.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const t = messages.tr;
const TOKEN = 'davet-token';

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function fail(status: number, error: string): Response {
  return { status, headers: { get: () => null }, json: async () => ({ data: null, error }) } as unknown as Response;
}

/** Dört ucun cevabı; verilmeyen uç başarılı varsayılanla döner. */
function wire(handlers: { invite?: Response; vote?: Response; review?: Response; complete?: Response } = {}) {
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/vote')) return Promise.resolve(handlers.vote ?? ok({ recorded: true }));
    if (url.endsWith('/review')) return Promise.resolve(handlers.review ?? ok({ recorded: true }));
    if (url.endsWith('/complete')) return Promise.resolve(handlers.complete ?? ok(feedbackCompletion()));
    return Promise.resolve(handlers.invite ?? ok(feedbackInvite()));
  });
}

/** Ekranı açar ve ilk yükün bitmesini bekler; iskelet kalkmadan assert edilmez. */
async function renderFeedback() {
  await render(<FeedbackScreen token={TOKEN} />);
  await waitFor(() => expect(screen.queryByTestId('feedback-loading')).toBeNull());
}

/** Listenin ilk `count` satırına aynı oyu verir. */
async function voteRows(kind: 'like' | 'dislike', count = 3) {
  for (let i = 0; i < count; i += 1) {
    await fireEvent.press(screen.getByTestId(`feedback-row-${i}-${kind}`));
  }
}

/** Satırın yorum alanını açar ve metni yazar. */
async function writeComment(row: number, text: string) {
  await fireEvent.press(screen.getByTestId(`feedback-row-${row}-add-comment`));
  await fireEvent.changeText(screen.getByTestId(`feedback-row-${row}-comment`), text);
}

/** Satırdaki oy dairesi seçili mi; seçim durumu kitin dokunma yüzeyinde taşınır, kimlik ise içteki görsel yüzeydedir. */
function voteSelected(row: number, kind: 'like' | 'dislike'): boolean {
  const name = kind === 'like' ? t.vote.like : t.vote.dislike;
  return within(screen.getByTestId(`feedback-row-${row}`)).queryByRole('button', { name, selected: true }) !== null;
}

/** Belirli uca giden istekler; çağrı sırası ve gövdesi buradan okunur. */
function callsTo(suffix: string): { url: string; body: unknown }[] {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).endsWith(suffix))
    .map(([input, init]) => ({
      url: String(input),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    }));
}

/** Yazım uçlarının çağrı sırası. */
function writeOrder(): string[] {
  return fetchMock.mock.calls
    .map(([input]) => String(input).split('/').pop() ?? '')
    .filter((last) => last === 'vote' || last === 'review' || last === 'complete');
}

const minWordsText = (count: number) => t.list.minWords.replace('{count}', String(count));

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockRouter.back.mockReset();
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  wire();
});

describe('FeedbackScreen', () => {
  it('siparişin bütün ürünleri tek listede açılır; kural satırı puanları davetten okur', async () => {
    wire({ invite: ok(feedbackInvite({ votePoints: 3, reviewPoints: 12 })) });
    await renderFeedback();

    for (const index of [0, 1, 2]) expect(screen.getByText(feedbackCard(index).name)).toBeOnTheScreen();
    expect(screen.getByText('LA-2411 · 3 ürün')).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-rule')).toHaveTextContent('Her ürün için oy +3 · yorum +12 puan');
  });

  it('davet dili SORGUDA gider; kart adları sunucuda çözülür', async () => {
    await renderFeedback();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`http://api.test/api/v1/feedback/${TOKEN}?locale=tr`);
  });

  it('yarıda bırakılan akış sürer: önceki oy seçili, önceki yorum açık gelir', async () => {
    wire({
      invite: ok(
        feedbackInvite({
          cards: [
            feedbackCard(0, { existing: { vote: 'like', rating: null, comment: 'Tazeydi, çok beğendik.' } }),
            feedbackCard(1),
            feedbackCard(2),
          ],
        }),
      ),
    });
    await renderFeedback();

    expect(voteSelected(0, 'like')).toBe(true);
    expect(screen.getByTestId('feedback-row-0-comment')).toHaveDisplayValue('Tazeydi, çok beğendik.');
    expect(voteSelected(1, 'like')).toBe(false);
  });

  it('oy kendi satırında işaretlenir ve UCA hemen yazılır', async () => {
    await renderFeedback();

    await fireEvent.press(screen.getByTestId('feedback-row-1-dislike'));

    expect(voteSelected(1, 'dislike')).toBe(true);
    expect(voteSelected(0, 'dislike')).toBe(false);
    await waitFor(() =>
      expect(callsTo('/vote')).toEqual([
        { url: `http://api.test/api/v1/feedback/${TOKEN}/vote`, body: { productId: feedbackCard(1).productId, vote: 'dislike' } },
      ]),
    );
  });

  it('yazma DÜŞERSE oy geri alınır ve sebep söylenir', async () => {
    wire({ vote: fail(400, 'vote_failed') });
    await renderFeedback();

    await fireEvent.press(screen.getByTestId('feedback-row-0-like'));

    await waitFor(() => expect(screen.getByTestId('feedback-write-error')).toHaveTextContent(t.errors.vote_failed));
    expect(voteSelected(0, 'like')).toBe(false);
  });

  it('bütün ürünler oylanmadan tamamlanamaz', async () => {
    await renderFeedback();

    await voteRows('like', 2);
    expect(screen.getByTestId('feedback-finish')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('feedback-row-2-dislike'));
    expect(screen.getByTestId('feedback-finish')).toBeEnabled();
  });

  it('yorum zorunlu değildir: boşken yorum ucu HİÇ çağrılmaz, yalnız tamamlama gider', async () => {
    await renderFeedback();
    await voteRows('like');

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeOnTheScreen());
    expect(callsTo('/review')).toHaveLength(0);
    expect(callsTo('/complete')).toHaveLength(1);
  });

  it('her yorum KENDİ ürününe yazılır ve hepsi tamamlamadan önce gider', async () => {
    await renderFeedback();
    await voteRows('like');
    await writeComment(0, 'Baklava tazeydi, şerbeti kıvamında.');
    await writeComment(2, 'Fıstık iri ve taze.');

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeOnTheScreen());
    expect(callsTo('/review').map((call) => call.body)).toEqual([
      { productId: feedbackCard(0).productId, comment: 'Baklava tazeydi, şerbeti kıvamında.' },
      { productId: feedbackCard(2).productId, comment: 'Fıstık iri ve taze.' },
    ]);
    expect(writeOrder().slice(-3)).toEqual(['review', 'review', 'complete']);
  });

  it('alt sınırın altındaki yorum tamamlamayı durdurur; yazdıkça uyarı kalkar ve akış sürer', async () => {
    await renderFeedback();
    await voteRows('like');
    await writeComment(1, 'Güzel');

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    expect(screen.getByText(minWordsText(2))).toBeOnTheScreen();
    expect(callsTo('/review')).toHaveLength(0);
    expect(callsTo('/complete')).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId('feedback-row-1-comment'), 'Güzel ve taze');
    expect(screen.queryByText(minWordsText(2))).toBeNull();

    await fireEvent.press(screen.getByTestId('feedback-finish'));
    await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeOnTheScreen());
    expect(callsTo('/review').map((call) => call.body)).toEqual([{ productId: feedbackCard(1).productId, comment: 'Güzel ve taze' }]);
  });

  it('alt sınır DAVETTEN okunur: üç kelime isteyen davette iki kelime yetmez', async () => {
    wire({ invite: ok(feedbackInvite({ reviewMinWords: 3 })) });
    await renderFeedback();
    await voteRows('like');
    await writeComment(0, 'Çok güzeldi');

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    expect(screen.getByText(minWordsText(3))).toBeOnTheScreen();
    expect(callsTo('/review')).toHaveLength(0);
  });

  it('değişmemiş önceki yorum yeniden gönderilmez', async () => {
    const answered = { vote: 'like' as const, rating: null, comment: null };
    wire({
      invite: ok(
        feedbackInvite({
          cards: [
            feedbackCard(0, { existing: { ...answered, comment: 'Tazeydi, çok beğendik.' } }),
            feedbackCard(1, { existing: answered }),
            feedbackCard(2, { existing: answered }),
          ],
        }),
      ),
    });
    await renderFeedback();

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeOnTheScreen());
    expect(callsTo('/review')).toHaveLength(0);
  });

  it('yorum yazımı düşerse tamamlama HİÇ çağrılmaz ve metin kaybolmaz', async () => {
    wire({ review: fail(400, 'unexpected') });
    await renderFeedback();
    await voteRows('like');
    await writeComment(0, 'Kargo geç geldi.');

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-write-error')).toHaveTextContent(t.errors.unexpected));
    expect(callsTo('/complete')).toHaveLength(0);
    expect(screen.getByTestId('feedback-row-0-comment')).toHaveDisplayValue('Kargo geç geldi.');
  });

  /* Ayar oturum ortasında yükselirse istemcinin geçirdiği yorumu sunucu reddeder; genel hata hangi yorumun eksik olduğunu söylemezdi. */
  it('sunucu yorumu kısa bulursa uyarı o satıra çizilir', async () => {
    wire({ review: fail(400, 'comment_too_short') });
    await renderFeedback();
    await voteRows('like');
    await writeComment(2, 'Fıstık taze.');

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByText(minWordsText(2))).toBeOnTheScreen());
    expect(screen.queryByTestId('feedback-write-error')).toBeNull();
    expect(callsTo('/complete')).toHaveLength(0);
  });

  it('sonuç CEVAPTAN okunur: puan kartı + dış değerlendirme; bağlantı gerçekten açılır', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderFeedback();
    await voteRows('like');

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByText(t.done.title)).toBeOnTheScreen());
    // Yazılan sayı turun toplamıdır (40), tamamlama primi (15) değil; eşit olsalardı ekran primi yazsa da test yeşil kalırdı.
    expect(screen.getByText('✦ +40 puan')).toBeOnTheScreen();
    expect(screen.queryByText('✦ +15 puan')).toBeNull();
    expect(screen.getByText('Toplam ✦ 255 puan')).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-issue')).toBeNull();

    await fireEvent.press(screen.getByTestId('feedback-review'));
    expect(openURL).toHaveBeenCalledWith('https://g.page/lezzet-anatolie/review');
    openURL.mockRestore();
  });

  /* Kart prime bağlansaydı günlük tavan dolduğunda prim 0'a düşer ve müşteri o turda kazandığı puanı göremezdi. */
  it('prim 0 olsa da TURUN TOPLAMI varsa puan kartı çizilir', async () => {
    wire({ complete: ok(feedbackCompletion({ pointsAwarded: 0, invitePointsTotal: 20 })) });
    await renderFeedback();
    await voteRows('like');

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-points')).toBeOnTheScreen());
    expect(screen.getByText('✦ +20 puan')).toBeOnTheScreen();
  });

  it('turun toplamı SIFIRSA kart hiç çizilmez; B2B müşterisine olmayan ödül vaat edilmez', async () => {
    wire({ complete: ok(feedbackCompletion({ pointsAwarded: 0, invitePointsTotal: 0 })) });
    await renderFeedback();
    await voteRows('like');

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeOnTheScreen());
    expect(screen.queryByTestId('feedback-points')).toBeNull();
  });

  it('"sorun bildir" dalı da cevaptan gelir ve talebi siparişe bağlar', async () => {
    wire({
      complete: ok(feedbackCompletion({ outcome: 'report_issue', reviewUrl: null, reviewPlatform: null })),
    });
    await renderFeedback();
    await voteRows('dislike');

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-issue')).toBeOnTheScreen());
    expect(screen.queryByTestId('feedback-review')).toBeNull();

    await fireEvent.press(screen.getByTestId('feedback-issue'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/support/new', params: { order: 'LA-2411' } });
  });

  it('"Vitrine dön" ana yığına döner; geri alınabilir bir sayfa bırakmaz', async () => {
    await renderFeedback();
    await voteRows('like');
    await fireEvent.press(screen.getByTestId('feedback-finish'));
    await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('feedback-home'));

    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('eskimiş bağlantı (404) "bulunamadı" durumuna düşer; sessizce boş akış açılmaz', async () => {
    wire({ invite: fail(404, 'invalid_link') });
    await renderFeedback();

    expect(screen.getByTestId('feedback-notfound')).toBeOnTheScreen();
    expect(screen.getByText(t.notFound.title)).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-list')).toBeNull();

    await fireEvent.press(screen.getByTestId('feedback-notfound-cta'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('bağlantı arızası AYRI hâldir: davet duruyor olabilir, "tekrar dene" listeyi açar', async () => {
    wire({ invite: fail(500, 'unexpected') });
    await renderFeedback();

    expect(screen.getByTestId('feedback-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-notfound')).toBeNull();

    wire();
    await fireEvent.press(screen.getByTestId('feedback-retry'));
    await waitFor(() => expect(screen.getByTestId('feedback-list')).toBeOnTheScreen());
  });

  it('zaten tamamlanmış davet: akış kurulmaz, puan ikinci kez vaat edilmez', async () => {
    wire({ invite: ok(feedbackInvite({ completedAt: '2026-08-01T09:00:00Z', pointsAwarded: 15 })) });
    await renderFeedback();

    expect(screen.getByText(t.already.title)).toBeOnTheScreen();
    expect(screen.getByText(t.already.body)).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-list')).toBeNull();
    expect(screen.queryByTestId('feedback-points')).toBeNull();
  });
});
