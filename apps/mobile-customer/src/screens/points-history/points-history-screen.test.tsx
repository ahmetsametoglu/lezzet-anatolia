import { render, screen } from '@testing-library/react-native';
import messages from '@lezzet/i18n/customer/points-history';

import { PointsHistoryScreen } from './points-history-screen';

/*
  "Yolda olan puanlar" bloğu iki kaynaktan kurulur: bekleyen komşular kartın listesinden, puan sayısı kartın kazanım yollarından. Ekran
  puanı yanlış yoldan okursa blok sessizce kaybolur ya da yanlış sayıyla söz verir; bu test o bağlantıyı tutar.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));

// Ad `mock` ile başlamak zorunda: `jest.mock` fabrikası dosyanın tepesine kaldırılıyor.
let mockEarnWays: { key: string; points: number }[] = [];
jest.mock('@/screens/account/use-points.hook', () => ({
  usePoints: () => ({
    status: 'ready',
    view: {
      points: {
        balance: 120,
        earnWays: mockEarnWays,
        pendingNeighborAwards: [{ neighborName: 'Mehmet', deliveryDate: '2026-10-20' }],
      },
    },
    publish: jest.fn(),
    reload: jest.fn(),
  }),
}));
jest.mock('./use-points-history.hook', () => ({
  usePointsHistory: () => ({
    status: 'ready',
    entries: [],
    loadingMore: false,
    tailFailed: false,
    refreshing: false,
    loadMore: jest.fn(),
    refresh: jest.fn(),
    retry: jest.fn(),
  }),
}));

const t = messages.tr;

describe('PointsHistoryScreen — yolda olan puanlar', () => {
  it('bekleyen komşuyu komşu kazanım yolunun puanıyla yazar', async () => {
    mockEarnWays = [
      { key: 'referral', points: 300 },
      { key: 'neighbor', points: 100 },
    ];

    await render(<PointsHistoryScreen locale="tr" />);

    expect(screen.getByTestId('points-history-pending')).toBeOnTheScreen();
    expect(screen.getByText(t.pending.one.replace('{name}', 'Mehmet').replace('{points}', '100'))).toBeOnTheScreen();
  });

  it('komşu kazanım yolu yoksa blok çizilmez', async () => {
    mockEarnWays = [{ key: 'referral', points: 300 }];

    await render(<PointsHistoryScreen locale="tr" />);

    expect(screen.queryByTestId('points-history-pending')).toBeNull();
  });
});
