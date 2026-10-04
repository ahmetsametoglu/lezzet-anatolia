import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import { useTicketPhotos } from './use-ticket-photos.hook';

/* Oturum hazır: ek girişli müşteride yüklenir. Ad `mock` ile başlamak zorunda (jest hoisting). */
const mockSession = { access_token: 'access-1' };
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

const mockExpoFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockExpoFetch(...args) }));
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
  },
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
});

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue({
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      data: { key: 'support/tickets/t-1/k1.jpg', uploadUrl: 'https://r2.example.test/k1?X-Amz-Signature=s', contentType: 'image/jpeg' },
      error: null,
    }),
  } as unknown as Response);
  mockExpoFetch.mockResolvedValue({ ok: true });
});

describe('useTicketPhotos', () => {
  // Talep kimliği adres isteğine girmezse ek taslağa yüklenir ve cevap `attachment_not_yours` ile düşer; bu test o hâlde kırmızıya döner.
  it('yazışma eki talebin kendi yükleme ucundan istenir', async () => {
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/p1.jpg',
          mimeType: 'image/jpeg',
          fileName: 'IMG_1.JPG',
          width: 800,
          height: 600,
          fileSize: 1000,
          type: 'image',
          assetId: null,
        },
      ],
    });
    const { result } = await renderHook(() => useTicketPhotos({ ticketId: 't-1', onFailed: jest.fn() }));

    await act(async () => result.current.pick('camera'));

    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://api.test/api/v1/me/tickets/t-1/uploads');
  });
});
