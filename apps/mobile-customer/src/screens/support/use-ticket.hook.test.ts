import { act, renderHook, waitFor } from '@testing-library/react-native';

import { recoverFailedReads } from '@lezzet/mobile-kit/src/lib/auth/recover-reads';
import { useTicket } from './use-ticket.hook';

/** `null` = oturum yok; istek ağa çıkmadan 401 döner (bildirimden gelinip oturumu düşmüş müşteri). */
let mockToken: string | null = null;
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    getSupabase: () => ({
      auth: { getSession: async () => ({ data: { session: mockToken === null ? null : { access_token: mockToken } } }) },
      channel: () => channel,
      removeChannel: async () => undefined,
    }),
  };
});

const DETAIL = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'damaged',
  status: 'open',
  subject: null,
  createdAt: '2026-10-04T01:29:00.000Z',
  lastMessageAt: '2026-10-04T01:39:00.000Z',
  orderReference: 'LA-26-7WT4XJ',
  messages: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-10-04T01:29:00.000Z',
      fromCustomer: true,
      body: 'Le gâteau est arrivé écrasé.',
      translated: false,
      language: 'fr',
      originalBody: 'Le gâteau est arrivé écrasé.',
      photos: [],
    },
  ],
  returnOutcome: null,
};

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  mockToken = null;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    status: 200,
    headers: { get: () => null },
    json: async () => ({ data: DETAIL, error: null }),
  } as unknown as Response);
});

describe('useTicket', () => {
  // Girişten sonra ekran misafir hâlinde kalırsa kırmızıya döner: bildirimden açılan talep girişten sonra görünmezdi.
  it('oturumsuz açılan talep, girişten sonraki ilk başarılı istekte yeniden okunur', async () => {
    const { result } = await renderHook(() => useTicket(DETAIL.id, 'fr'));
    await waitFor(() => expect(result.current.status).toBe('guest'));

    mockToken = 'access-1';
    await act(async () => recoverFailedReads());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.detail?.orderReference).toBe('LA-26-7WT4XJ');
  });
});
