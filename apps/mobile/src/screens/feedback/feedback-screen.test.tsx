import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { FeedbackScreen } from './feedback-screen';
import { DEMO_FEEDBACK_TOKEN, feedbackInviteByToken } from './feedback-fixture';
import messages from './messages.json';

/*
  GERİ BİLDİRİM EKRAN TESTİ — oy akışının ilerleyişi ve sayaç, yorum aşamasına geçiş, iki akış
  sonu (hepsi beğenildi → dış değerlendirme · biri beğenilmedi → sorun köprüsü), puan kartı,
  yarıda bırakılan akışın kaldığı yerden sürmesi ve geçersiz token'ın "bulunamadı" durumu.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (href: unknown) => mockPush(href),
    replace: (href: unknown) => mockReplace(href),
    back: () => mockBack(),
  }),
}));

const t = messages.tr;
const invite = feedbackInviteByToken(DEMO_FEEDBACK_TOKEN)!;
const [first, second, third] = invite.cards;

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
});

/** Kalan tüm kartları verilen tuşla oylar — akış-sonu testlerinin kısayolu. */
async function voteRemaining(testID: 'feedback-like' | 'feedback-dislike', times: number) {
  for (let i = 0; i < times; i += 1) {
    await fireEvent.press(screen.getByTestId(testID));
  }
}

describe('FeedbackScreen', () => {
  it('oy aşamasıyla açılır: ilk ürün, sipariş rozeti ve "1 / 3" sayacı', async () => {
    await render(<FeedbackScreen token={DEMO_FEEDBACK_TOKEN} />);

    expect(screen.getByText(t.title)).toBeOnTheScreen();
    expect(screen.getByText(first!.name)).toBeOnTheScreen();
    expect(screen.getByText(invite.orderReferenceNo!)).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-progress')).toHaveTextContent('1 / 3');
  });

  it('yarıda bırakılan akış kaldığı yerden sürer: oylu kart atlanır (sözleşmenin kuralı)', async () => {
    const resumed = {
      ...invite,
      cards: invite.cards.map((card, position) =>
        position === 0 ? { ...card, existing: { vote: 'like' as const, rating: null, comment: null } } : card,
      ),
      progress: { rated: 1, total: invite.cards.length },
    };
    await render(<FeedbackScreen token={DEMO_FEEDBACK_TOKEN} invite={resumed} />);

    expect(screen.getByText(second!.name)).toBeOnTheScreen();
    expect(screen.queryByText(first!.name)).toBeNull();
    expect(screen.getByTestId('feedback-progress')).toHaveTextContent('2 / 3');
  });

  it('oy vermek sıradaki ürüne geçirir; sayaç birlikte ilerler', async () => {
    await render(<FeedbackScreen token={DEMO_FEEDBACK_TOKEN} />);

    await fireEvent.press(screen.getByTestId('feedback-like'));

    expect(screen.getByText(second!.name)).toBeOnTheScreen();
    expect(screen.queryByText(first!.name)).toBeNull();
    expect(screen.getByTestId('feedback-progress')).toHaveTextContent('2 / 3');

    await fireEvent.press(screen.getByTestId('feedback-dislike'));
    expect(screen.getByText(third!.name)).toBeOnTheScreen();
    expect(screen.getByTestId('feedback-progress')).toHaveTextContent('3 / 3');
  });

  it('tüm ürünler oylanınca yorum aşaması açılır; sayaç kaybolur (şablonun stage0 kapısı)', async () => {
    await render(<FeedbackScreen token={DEMO_FEEDBACK_TOKEN} />);

    await voteRemaining('feedback-like', invite.cards.length);

    expect(screen.getByText(t.comment.title)).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-progress')).toBeNull();
    expect(screen.queryByTestId('feedback-vote')).toBeNull();
  });

  it('yorum zorunlu değildir; alan yazılanı taşır', async () => {
    await render(<FeedbackScreen token={DEMO_FEEDBACK_TOKEN} />);
    await voteRemaining('feedback-like', invite.cards.length);

    await fireEvent.changeText(screen.getByTestId('feedback-comment-input'), 'Baklava tazeydi.');

    expect(screen.getByTestId('feedback-comment-input')).toHaveDisplayValue('Baklava tazeydi.');
  });

  it('hepsi beğenildiyse: puan kartı + dış değerlendirme daveti; bağlantı gerçekten açılır', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<FeedbackScreen token={DEMO_FEEDBACK_TOKEN} />);
    await voteRemaining('feedback-like', invite.cards.length);

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    expect(screen.getByText(t.done.title)).toBeOnTheScreen();
    // Puan tamamlamaya bağlıdır; değer fixture'dan (gerçek uçta ayardan gelir, ekrana gömülü değil).
    expect(screen.getByText('✦ +15 puan')).toBeOnTheScreen();
    expect(screen.getByText('Toplam ✦ 255 puan')).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-issue')).toBeNull();

    await fireEvent.press(screen.getByTestId('feedback-review'));
    expect(openURL).toHaveBeenCalledWith('https://g.page/lezzet-anatolia/review');
    openURL.mockRestore();
  });

  it('bir ürün bile beğenilmediyse: sorun köprüsü, dış değerlendirme YOK (demo kuralı)', async () => {
    await render(<FeedbackScreen token={DEMO_FEEDBACK_TOKEN} />);
    await fireEvent.press(screen.getByTestId('feedback-dislike'));
    await voteRemaining('feedback-like', invite.cards.length - 1);

    await fireEvent.press(screen.getByTestId('feedback-finish'));

    expect(screen.getByTestId('feedback-issue')).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-review')).toBeNull();

    // Köprü, talebi SİPARİŞE bağlayarak açar (şablon: `openTalepNew(o.ref)`).
    await fireEvent.press(screen.getByTestId('feedback-issue'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/support/new',
      params: { order: invite.orderReferenceNo },
    });
  });

  it('"Vitrine dön" ana yığına döner — geri alınabilir bir sayfa bırakmaz', async () => {
    await render(<FeedbackScreen token={DEMO_FEEDBACK_TOKEN} />);
    await voteRemaining('feedback-like', invite.cards.length);
    await fireEvent.press(screen.getByTestId('feedback-finish'));

    await fireEvent.press(screen.getByTestId('feedback-home'));

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('geçersiz token "bulunamadı" durumuna düşer — sessizce boş akış açılmaz', async () => {
    await render(<FeedbackScreen token="eskimis-baglanti" />);

    expect(screen.getByTestId('feedback-notfound')).toBeOnTheScreen();
    expect(screen.getByText(t.notFound.title)).toBeOnTheScreen();
    expect(screen.queryByTestId('feedback-vote')).toBeNull();

    await fireEvent.press(screen.getByTestId('feedback-notfound-cta'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
