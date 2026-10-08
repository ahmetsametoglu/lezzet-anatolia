import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { CROP_CENTER, type MeOrderDetail } from '@lezzet/types';

import messages from '@lezzet/i18n/customer/support';
import { NewTicketSheet } from './new-ticket-sheet';

/*
  Ağ gerçek yoldan geçer ve gövdeler telden okunur; taklit edilen yalnız cihazın sınırı (görsel seçici, R2'ye giden PUT, yerel dosya),
  çünkü üçü de yerel yetenek ve testte köprü yok.
*/

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

/* Oturum hazır: çekmece girişli müşteride açılır. Ad `mock` ile başlamak ZORUNDA (jest hoisting). */
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

/** R2'ye giden PUT — gövdesi `File`, cevabı yalnız `ok`. */
const mockExpoFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockExpoFetch(...args) }));
/* Sınıf alanı açıkça atanır, çünkü `constructor(readonly uri)` kısayolu fabrikanın dışına bir başvuru doğurur ve jest'in kaldırma
   bekçisi dosyayı koşturmaz. */
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
  },
}));

const t = messages.tr.new;

function reply(status: number, body: unknown): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
let issued = 0;

const ORDER: MeOrderDetail = {
  reference: 'LA-26-TEST01',
  placedAt: '2026-10-01T10:00:00Z',
  status: 'delivered',
  active: false,
  deliveryType: 'shipping',
  deliveryDate: '2026-10-03',
  address: { line1: '8 rue de la Mésange', line2: null, postalCode: '67000', city: 'Strasbourg' },
  lines: [
    {
      id: 'line-1',
      name: 'Su Böreği',
      unitLabel: '2500 g',
      image: { url: null, crop: CROP_CENTER, frames: null },
      bundle: null,
      qty: 1,
      billedQty: 1,
      shortfall: false,
      shortfallCents: 0,
      unitPriceCents: 2247,
      lineTotalCents: 2247,
    },
  ],
  timeline: null,
  pickup: null,
  subtotalCents: 2247,
  discountCents: 0,
  discountLabel: '',
  shippingFeeCents: 0,
  totalCents: 2247,
  pricesIncludeVat: true,
  zeroRated: false,
  vat: [],
  paymentMethod: 'online',
  paymentStatus: 'paid',
  onAccount: false,
  shipment: null,
  feedback: null,
};

/** Uçlar: boş sipariş listesi (kapsam sorusu atlanır) · tek siparişin detayı · imzalı adres · açılış. */
function route({ uploadError }: { uploadError?: string } = {}) {
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes(`/api/v1/me/orders/${ORDER.reference}`)) {
      return Promise.resolve(reply(200, { data: ORDER, error: null }));
    }
    if (address.includes('/api/v1/me/orders')) {
      return Promise.resolve(reply(200, { data: { orders: [], nextCursor: null }, error: null }));
    }
    if (address.includes('/api/v1/me/tickets/uploads')) {
      if (uploadError) return Promise.resolve(reply(400, { data: null, error: uploadError }));
      issued += 1;
      return Promise.resolve(
        reply(200, {
          data: {
            key: `support/tickets/drafts/c1/k${issued}.jpg`,
            uploadUrl: `https://r2.example.test/k${issued}?X-Amz-Signature=s`,
            contentType: 'image/jpeg',
          },
          error: null,
        }),
      );
    }
    if (address.endsWith('/api/v1/me/tickets')) {
      return Promise.resolve(reply(200, { data: { id: '00000000-0000-4000-9000-000000000001' }, error: null }));
    }
    return Promise.resolve(reply(404, { data: null, error: 'not_found' }));
  });
}

function jsonBodies(match: (address: string) => boolean): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([url]) => match(String(url)))
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}
const uploadBodies = () => jsonBodies((address) => address.includes('/api/v1/me/tickets/uploads'));
const openBodies = () => jsonBodies((address) => address.endsWith('/api/v1/me/tickets'));

function asset(n: number): ImagePicker.ImagePickerAsset {
  return {
    uri: `file:///cache/p${n}.jpg`,
    mimeType: 'image/jpeg',
    fileName: `IMG_${n}.JPG`,
    width: 800,
    height: 600,
    fileSize: 1000,
    type: 'image',
    assetId: null,
  };
}
const picked = (...assets: ImagePicker.ImagePickerAsset[]): ImagePicker.ImagePickerResult => ({ canceled: false, assets });

const onCreated = jest.fn();

async function openForm() {
  await render(<NewTicketSheet locale="tr" onClose={jest.fn()} onCreated={onCreated} />);
  // Sipariş listesi boş → kapsam sorusu atlanır, akış doğrudan forma açılır (künye §7).
  await screen.findByTestId('new-ticket-message');
}

async function submitWith(text: string) {
  await fireEvent.changeText(screen.getByTestId('new-ticket-message'), text);
  await fireEvent.press(screen.getByTestId('new-ticket-submit'));
}

/* Adres zorunlu: `env.apiUrl` tanımsızken bilerek fırlatır ve istek fetch'e hiç ulaşmaz. */
beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
});

beforeEach(() => {
  issued = 0;
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  mockExpoFetch.mockReset();
  mockExpoFetch.mockResolvedValue({ ok: true });
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockClear();
  jest.mocked(ImagePicker.launchCameraAsync).mockClear();
  onCreated.mockClear();
  route();
});

describe('yeni talep — fotoğraf', () => {
  it('galeriden seçilen fotoğraf imzalı adrese YÜKLENİR ve anahtarı açılış gövdesine girer', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked(asset(1)));
    await openForm();

    await fireEvent.press(screen.getByTestId('new-ticket-photo-library'));
    await screen.findByTestId('new-ticket-photo-0');

    // Kapıya giden ad TÜRDEN türer (`photo.jpg`), dosyanın kendi adından değil.
    expect(uploadBodies()).toEqual([{ filename: 'photo.jpg', alreadyRequested: 0 }]);
    const [url, init] = mockExpoFetch.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: { uri: string } }];
    expect(url).toBe('https://r2.example.test/k1?X-Amz-Signature=s');
    expect(init.method).toBe('PUT');
    // Tür KAPININ söylediği; jeton kovaya gitmez — imza yetkinin kendisi.
    expect(init.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    expect(init.body.uri).toBe('file:///cache/p1.jpg');

    await submitWith('Kutu ezik geldi');
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(openBodies()[0]).toMatchObject({ body: 'Kutu ezik geldi', attachments: ['support/tickets/drafts/c1/k1.jpg'] });
  });

  it('kamera izni verilmezse sebep söylenir ve kamera AÇILMAZ', async () => {
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValueOnce({ granted: false, status: ImagePicker.PermissionStatus.DENIED, canAskAgain: false, expires: 'never' });
    await openForm();

    await fireEvent.press(screen.getByTestId('new-ticket-photo-camera'));

    expect(await screen.findByText(t.photo.errors.cameraDenied)).toBeTruthy();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('depo yüklemeyi REDDEDERSE fotoğraf eklenmez, cümle söylenir; talep fotoğrafsız gider', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked(asset(1)));
    mockExpoFetch.mockResolvedValueOnce({ ok: false });
    await openForm();

    await fireEvent.press(screen.getByTestId('new-ticket-photo-library'));

    expect(await screen.findByText(t.photo.errors.unavailable)).toBeTruthy();
    expect(screen.queryByTestId('new-ticket-photo-0')).toBeNull();

    await submitWith('Fotoğraf gitmedi');
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(openBodies()[0]).not.toHaveProperty('attachments');
  });

  it('kapının tür reddi dosya türü cümlesine çevrilir — kovaya hiçbir şey gitmez', async () => {
    route({ uploadError: 'unsupported_type' });
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked(asset(1)));
    await openForm();

    await fireEvent.press(screen.getByTestId('new-ticket-photo-library'));

    expect(await screen.findByText(t.photo.errors.unsupported)).toBeTruthy();
    expect(mockExpoFetch).not.toHaveBeenCalled();
  });

  it('kaldırılan fotoğrafın anahtarı gövdeden DÜŞER', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked(asset(1)));
    await openForm();

    await fireEvent.press(screen.getByTestId('new-ticket-photo-library'));
    await fireEvent.press(await screen.findByTestId('new-ticket-photo-remove-0'));
    expect(screen.queryByTestId('new-ticket-photo-0')).toBeNull();

    await submitWith('Vazgeçtim, fotoğrafsız');
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(openBodies()[0]).not.toHaveProperty('attachments');
  });

  it('yükleme sürerken Gönder KİLİTLİ — yarım fotoğraf talebe girmez', async () => {
    let release: (value: { ok: boolean }) => void = () => undefined;
    mockExpoFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked(asset(1)));
    await openForm();

    await fireEvent.press(screen.getByTestId('new-ticket-photo-library'));
    await screen.findByTestId('new-ticket-photo-pending');
    await submitWith('Bekliyorum');
    expect(openBodies()).toHaveLength(0);

    await act(async () => release({ ok: true }));
    await screen.findByTestId('new-ticket-photo-0');
    await fireEvent.press(screen.getByTestId('new-ticket-submit'));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(openBodies()[0]).toMatchObject({ attachments: ['support/tickets/drafts/c1/k1.jpg'] });
  });

  it('tavan MOTORUN sayısı: beşinci fotoğraftan sonra kaynaklar çizilmez, sayaç 5/5 der', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce(picked(asset(1), asset(2), asset(3), asset(4), asset(5)));
    await openForm();

    await fireEvent.press(screen.getByTestId('new-ticket-photo-library'));
    await screen.findByTestId('new-ticket-photo-4');

    // Seçici kalan kadarını açtı; kapıya giden sayaç sırayla ilerledi.
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ selectionLimit: 5 }));
    expect(uploadBodies().map((body) => body.alreadyRequested)).toEqual([0, 1, 2, 3, 4]);
    expect(screen.queryByTestId('new-ticket-photo-library')).toBeNull();
    expect(screen.queryByTestId('new-ticket-photo-camera')).toBeNull();
    expect(screen.getByTestId('new-ticket-photo-count')).toHaveTextContent('5/5 fotoğraf');
  });
});

describe('yeni talep — önce konu, sonra ürün', () => {
  // Konu değişince gizlenen işaret gövdede kalırsa ya da ürün listesi konudan önce çizilirse kırmızıya döner.
  it('ürün listesi yalnız ürüne dair konuda çıkar; "Soru"ya dönülünce işaretli kalem gövdeden düşer', async () => {
    await render(<NewTicketSheet locale="tr" orderReference={ORDER.reference} onClose={jest.fn()} onCreated={onCreated} />);
    await screen.findByTestId('new-ticket-type-damaged');
    expect(screen.queryByTestId('new-ticket-lines')).toBeNull();

    await fireEvent.press(screen.getByTestId('new-ticket-type-damaged'));
    await fireEvent.press(await screen.findByTestId('new-ticket-line-line-1'));
    await fireEvent.press(screen.getByTestId('new-ticket-type-question'));
    expect(screen.queryByTestId('new-ticket-lines')).toBeNull();

    await submitWith('Teslim saatini sormak istiyorum');
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('00000000-0000-4000-9000-000000000001'));
    expect(openBodies()[0]).toMatchObject({ type: 'question', orderReference: ORDER.reference });
    expect(openBodies()[0]).not.toHaveProperty('orderItemIds');
  });
});
