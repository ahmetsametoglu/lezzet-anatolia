import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { FeedbackScreen } from './feedback-screen';
import { feedbackCard, feedbackCompletion, feedbackInvite } from './feedback-fixture';
import messages from './messages.json';

/*
  GERİ BİLDİRİM EKRANI — tel cevabı fixture'dan gelir (fetch mock'u): ekran GERÇEK istemci yolunu
  (`lib/api/feedback` → şema doğrulaması) katederek çizilir, hook ayrıca test edilmez (ürün ve
  tarif ekranı testlerinin birebir deseni).

  Doğrulananlar: akışın ilerleyişi ve sayaç · oyun UCA yazılması · yazma reddinde oyun GERİ
  ALINMASI · yorumun tamamlamadan ÖNCE gitmesi · sonucun cevaptan okunması · üç açılış hâli
  (bulunamadı · bağlantı hatası · zaten tamamlanmış).

  Cihaz dili tr-TR'ye sabitlenir ki assert edilen metinler koşulan makinenin diline bağlı olmasın.
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

/** Dört ucun cevabı — verilmeyen uç varsayılanla döner (yazımlar "kayıt düştü"). */
function wire(handlers: { invite?: Response; vote?: Response; review?: Response; complete?: Response } = {}) {
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/vote')) return Promise.resolve(handlers.vote ?? ok({ recorded: true }));
    if (url.endsWith('/review')) return Promise.resolve(handlers.review ?? ok({ recorded: true }));
    if (url.endsWith('/complete')) return Promise.resolve(handlers.complete ?? ok(feedbackCompletion()));
    return Promise.resolve(handlers.invite ?? ok(feedbackInvite()));
  });
}

/** Ekranı açar ve ilk yükün bitmesini bekler — skeleton kalkmadan assert edilmez. */
async function renderFeedback() {
  await render(<FeedbackScreen token={TOKEN} />);
  await waitFor(() => expect(screen.queryByTestId('feedback-loading')).toBeNull());
}

/** Verilen tuşa `times` kez basar — akış-sonu testlerinin kısayolu. */
async function voteRemaining(testID: 'feedback-like' | 'feedback-dislike', times: number) {
  for (let i = 0; i < times; i += 1) {
    await fireEvent.press(screen.getByTestId(testID));
  }
}

/** Belirli uca giden istekler — çağrı sırası ve gövdesi buradan okunur. */
function callsTo(suffix: string): { url: string; body: unknown }[] {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).endsWith(suffix))
    .map(([input, init]) => ({
      url: String(input),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    }));
}

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
  it('oy aşamasıyla açılır: ilk ürün, sipariş rozeti ve "1 / 3" sayacı', async () => {
    await renderFeedback();

    expect(screen.getByText(t.title)).toBeOnTheScreen();
    expect(screen.getByText(feedbackCard(0).name)).toBeOnTheScreen();
    expect(screen.getByText('LA-2411')).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-progress')).toHaveTextContent('1 / 3');
  });

  it('davet dili SORGUDA gider — kart adları sunucuda çözülür', async () => {
    await renderFeedback();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`http://api.test/api/v1/feedback/${TOKEN}?locale=tr`);
  });

  it('yarıda bırakılan akış kaldığı yerden sürer: oylu kart atlanır (sözleşmenin kuralı)', async () => {
    wire({
      invite: ok(
        feedbackInvite({
          cards: [
            feedbackCard(0, { existing: { vote: 'like', rating: null, comment: null } }),
            feedbackCard(1),
            feedbackCard(2),
          ],
        }),
      ),
    });
    await renderFeedback();

    expect(screen.getByText(feedbackCard(1).name)).toBeOnTheScreen();
    expect(screen.queryByText(feedbackCard(0).name)).toBeNull();
    expect(screen.getByTestId('feedback-progress')).toHaveTextContent('2 / 3');
  });

  it('oy sıradaki ürüne geçirir ve UCA yazılır — tur sonunda toplu değil', async () => {
    await renderFeedback();

    await fireEvent.press(screen.getByTestId('feedback-like'));

    expect(screen.getByText(feedbackCard(1).name)).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-progress')).toHaveTextContent('2 / 3');
    await waitFor(() =>
      expect(callsTo('/vote')).toEqual([
        { url: `http://api.test/api/v1/feedback/${TOKEN}/vote`, body: { productId: feedbackCard(0).productId, vote: 'like' } },
      ]),
    );
  });

  it('yazma DÜŞERSE oy geri alınır: aynı karta dönülür ve sebep söylenir', async () => {
    wire({ vote: fail(400, 'vote_failed') });
    await renderFeedback();

    await fireEvent.press(screen.getByTestId('feedback-like'));

    await waitFor(() => expect(screen.getByTestId('feedback-write-error')).toHaveTextContent(t.errors.vote_failed));
    expect(screen.getByText(feedbackCard(0).name)).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-progress')).toHaveTextContent('1 / 3');
  });

  it('tüm ürünler oylanınca yorum aşaması açılır; sayaç kaybolur (şablonun stage0 kapısı)', async () => {
    await renderFeedback();

    await voteRemaining('feedback-like', 3);

    expect(screen.getByText(t.comment.title)).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-progress')).toBeNull();
    expect(screen.queryByTestId('feedback-vote')).toBeNull();
  });

  it('yorum zorunlu değildir: boşken yazım ucu HİÇ çağrılmaz, yalnız tamamlama gider', async () => {
    await renderFeedback();
    await voteRemaining('feedback-like', 3);

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeOnTheScreen());
    expect(callsTo('/review')).toHaveLength(0);
    expect(callsTo('/complete')).toHaveLength(1);
  });

  it('yorum doluysa TAMAMLAMADAN ÖNCE ürüne yazılır — hedef ilk beğenilen kart', async () => {
    await renderFeedback();
    await fireEvent.press(screen.getByTestId('feedback-dislike'));
    await voteRemaining('feedback-like', 2);

    await fireEvent.changeText(screen.getByTestId('feedback-comment-input'), 'Baklava tazeydi.');
    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeOnTheScreen());
    // Beğenilmeyen ilk kart DEĞİL, ilk BEĞENİLEN kart (yorum ürün sayfasında yayınlanıyor).
    expect(callsTo('/review')).toEqual([
      {
        url: `http://api.test/api/v1/feedback/${TOKEN}/review`,
        body: { productId: feedbackCard(1).productId, comment: 'Baklava tazeydi.' },
      },
    ]);
  });

  it('yorum yazımı düşerse tamamlama HİÇ çağrılmaz — metin kaybolmaz', async () => {
    wire({ review: fail(400, 'unexpected') });
    await renderFeedback();
    await voteRemaining('feedback-like', 3);

    await fireEvent.changeText(screen.getByTestId('feedback-comment-input'), 'Kargo geç geldi.');
    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-write-error')).toHaveTextContent(t.errors.unexpected));
    expect(callsTo('/complete')).toHaveLength(0);
    expect(screen.getByTestId('feedback-comment-input')).toHaveDisplayValue('Kargo geç geldi.');
  });

  it('sonuç CEVAPTAN okunur: puan kartı + dış değerlendirme; bağlantı gerçekten açılır', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderFeedback();
    await voteRemaining('feedback-like', 3);

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByText(t.done.title)).toBeOnTheScreen());
    /* MB-17: yazılan sayı TURUN TOPLAMIDIR (`invitePointsTotal` = 40), tamamlama primi (15) değil.
       Fixture ikisini bilerek ayrı tutuyor — eşit olsalardı bu iddia hiçbir şeyi kanıtlamazdı ve
       ekran primi yazmaya geri dönse test yine yeşil kalırdı. Cihazda ölçülen arıza tam buydu:
       ekran "+5" derken deftere 30 yazılmıştı. */
    expect(screen.getByText('✦ +40 puan')).toBeOnTheScreen();
    expect(screen.queryByText('✦ +15 puan')).toBeNull();
    /* Not satırı 15.08'de bağlamı bıraktı ("bu değerlendirme için…" → "hesabınıza eklendi"): blok
       artık keşif turunun bitişiyle ORTAK ve bağlamı üstündeki başlık söylüyor. */
    expect(screen.getByText('hesabınıza eklendi')).toBeOnTheScreen();
    expect(screen.getByText('Toplam ✦ 255 puan')).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-issue')).toBeNull();

    await fireEvent.press(screen.getByTestId('feedback-review'));
    expect(openURL).toHaveBeenCalledWith('https://g.page/lezzet-anatolia/review');
    openURL.mockRestore();
  });

  /* MB-17'nin İKİNCİ yarısı. Kart eskiden `pointsAwarded > 0` kapısındaydı ve bunun ölçülmüş bir
     bedeli vardı: günlük tavan dolduğunda ya da davet İKİNCİ kez tamamlandığında prim 0'a düşüyor,
     müşteri o turda yorum için puan kazanmış olsa bile hiçbir puan bilgisi görmüyordu. Kapı artık
     toplamda; bu test o gerilemeyi kilitliyor. */
  it('prim 0 olsa da TURUN TOPLAMI varsa puan kartı çizilir — tavan dolduğunda kart kaybolmaz', async () => {
    wire({ complete: ok(feedbackCompletion({ pointsAwarded: 0, invitePointsTotal: 20 })) });
    await renderFeedback();
    await voteRemaining('feedback-like', 3);

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-points')).toBeOnTheScreen());
    expect(screen.getByText('✦ +20 puan')).toBeOnTheScreen();
  });

  it('turun toplamı SIFIRSA kart hiç çizilmez — B2B müşterisine olmayan ödül vaat edilmez', async () => {
    wire({ complete: ok(feedbackCompletion({ pointsAwarded: 0, invitePointsTotal: 0 })) });
    await renderFeedback();
    await voteRemaining('feedback-like', 3);

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeOnTheScreen());
    expect(screen.queryByTestId('feedback-points')).toBeNull();
  });

  it('"sorun bildir" dalı da cevaptan gelir — ekran memnuniyeti kendi saymaz', async () => {
    wire({
      complete: ok(feedbackCompletion({ outcome: 'report_issue', reviewUrl: null, reviewPlatform: null })),
    });
    await renderFeedback();
    await voteRemaining('feedback-like', 3);

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await waitFor(() => expect(screen.getByTestId('feedback-issue')).toBeOnTheScreen());
    expect(screen.queryByTestId('feedback-review')).toBeNull();

    // Köprü, talebi SİPARİŞE bağlayarak açar (şablon: `openTalepNew(o.ref)`).
    await fireEvent.press(screen.getByTestId('feedback-issue'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/support/new', params: { order: 'LA-2411' } });
  });

  it('"Vitrine dön" ana yığına döner — geri alınabilir bir sayfa bırakmaz', async () => {
    await renderFeedback();
    await voteRemaining('feedback-like', 3);
    await fireEvent.press(screen.getByTestId('feedback-finish'));
    await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('feedback-home'));

    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('eskimiş bağlantı (404) "bulunamadı" durumuna düşer — sessizce boş akış açılmaz', async () => {
    wire({ invite: fail(404, 'invalid_link') });
    await renderFeedback();

    expect(screen.getByTestId('feedback-notfound')).toBeOnTheScreen();
    expect(screen.getByText(t.notFound.title)).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-vote')).toBeNull();

    await fireEvent.press(screen.getByTestId('feedback-notfound-cta'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('bağlantı arızası AYRI hâldir: "tekrar dene" davet duruyor olabilir diye çıkış sunmaz', async () => {
    wire({ invite: fail(500, 'unexpected') });
    await renderFeedback();

    expect(screen.getByTestId('feedback-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-notfound')).toBeNull();

    wire();
    await fireEvent.press(screen.getByTestId('feedback-retry'));
    await waitFor(() => expect(screen.getByTestId('feedback-vote')).toBeOnTheScreen());
  });

  it('zaten tamamlanmış davet: akış kurulmaz, puan ikinci kez vaat edilmez', async () => {
    wire({ invite: ok(feedbackInvite({ completedAt: '2026-08-01T09:00:00Z', pointsAwarded: 15 })) });
    await renderFeedback();

    expect(screen.getByText(t.already.title)).toBeOnTheScreen();
    expect(screen.getByText(t.already.body)).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-vote')).toBeNull();
    expect(screen.queryByTestId('feedback-points')).toBeNull();
  });
});
