import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReviewPage, ReviewSummary } from '@lezzet/types';

import { publishedReview } from './product-fixture';
import { ProductReviewsScreen } from './product-reviews-screen';

/*
  Tel cevabı sahte `fetch`ten gelir ve ekran gerçek istemci yolunu (şema doğrulaması dahil) katederek çizilir. Cihaz dili tr-TR'ye
  sabitlenir ki beklenen metinler koşulan makinenin diline bağlı olmasın.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockRouter = { back: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function fail(status: number, error: string): Response {
  return { status, headers: { get: () => null }, json: async () => ({ data: null, error }) } as unknown as Response;
}

/** 4★ bir, 5★ üç yorum; 3★ ve altı yok. */
const SUMMARY: ReviewSummary = { average: 4.8, totalCount: 4, commentCount: 4, ratingBreakdown: [0, 0, 0, 1, 3] };

function page(rows: ReviewPage['rows'], nextCursor: string | null = null): ReviewPage {
  return { productName: 'Fıstıklı Baklava', summary: SUMMARY, rows, nextCursor };
}

/** İstek adresleri; süzgeç ve imleç sorgudan okunur. */
const requested = () => fetchMock.mock.calls.map(([input]) => String(input));

async function renderReviews() {
  await render(<ProductReviewsScreen slug="fistikli-baklava" />);
  await waitFor(() => expect(screen.queryByTestId('reviews-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockRouter.back.mockReset();
});

describe('tüm yorumlar', () => {
  // Sayısı sıfır olan çip basılınca boş liste gösterirdi.
  it('özet okunur ve yalnız sayısı olan süzgeç çipleri çizilir', async () => {
    fetchMock.mockResolvedValue(ok(page([publishedReview(0), publishedReview(1)])));
    await renderReviews();

    expect(screen.getByTestId('reviews-summary')).toHaveTextContent('4,8', { exact: false });
    expect(screen.getByTestId('reviews-filter-all')).toHaveTextContent('Tümü (4)');
    expect(screen.getByTestId('reviews-filter-five')).toHaveTextContent('5★ (3)');
    expect(screen.getByTestId('reviews-filter-four')).toHaveTextContent('4★ (1)');
    expect(screen.queryByTestId('reviews-filter-low')).toBeNull();
  });

  // Çip yanlış süzgeci gönderseydi "4★" altında beş yıldızlılar okunurdu.
  it('çip süzgeci sorguya yazar ve liste yeni kümeyle değişir', async () => {
    fetchMock.mockResolvedValueOnce(ok(page([publishedReview(0), publishedReview(1)])));
    await renderReviews();

    fetchMock.mockResolvedValueOnce(ok(page([publishedReview(5, { rating: 4, comment: 'Dört yıldızlık yorum.' })])));
    await fireEvent.press(screen.getByTestId('reviews-filter-four'));

    await waitFor(() => expect(screen.getByTestId('reviews-row-0')).toHaveTextContent('Dört yıldızlık yorum.', { exact: false }));
    expect(screen.queryByTestId('reviews-row-1')).toBeNull();
    expect(requested().at(-1)).toBe('http://api.test/api/v1/products/fistikli-baklava/reviews?locale=tr&rating=four');
  });

  // İmleç gönderilmeseydi sonraki sayfa ilk sayfayı tekrar getirir ve liste kendini çoğaltırdı.
  it('liste sonunda sonraki sayfa imleçle istenir ve eklenir', async () => {
    fetchMock.mockResolvedValueOnce(ok(page([publishedReview(0), publishedReview(1)], 'imlec-1')));
    await renderReviews();

    fetchMock.mockResolvedValueOnce(ok(page([publishedReview(2, { comment: 'Eski bir yorum.' })])));
    await fireEvent(screen.getByTestId('reviews-list'), 'onEndReached');

    await waitFor(() => expect(screen.getByTestId('reviews-row-2')).toHaveTextContent('Eski bir yorum.', { exact: false }));
    expect(requested().at(-1)).toBe('http://api.test/api/v1/products/fistikli-baklava/reviews?locale=tr&cursor=imlec-1');
  });

  it('satışta olmayan ürün (404) "bulunamadı" der, bağlantı arızası gibi tekrar dene sunmaz', async () => {
    fetchMock.mockResolvedValue(fail(404, 'product_not_found'));
    await renderReviews();

    expect(screen.getByTestId('reviews-missing')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('reviews-error-action'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
