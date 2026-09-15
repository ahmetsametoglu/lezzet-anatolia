import addressCopy from '@lezzet/i18n/customer/address';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { AddressWrite, MeAddress } from '@/lib/api/addresses';
import { AddressForm } from './address-form';

/*
  ADRES FORMU — Musteri Mobil `shAddr` akışı (21.313).

  KRİTİK İDDİALAR:
  · öneri TEK kapıdan ve SEÇİLİ ülkeyle sorulur; seçilen adres kaynağıyla (BAN / Google) noktasını
    gövdeye taşır — ikinci bir ağ turu yok, kaynak 30 gün kuralını belirliyor;
  · kaydetmek = seçmek: yeni adres teslimat adresi olur ve bildirim bunu söyler;
  · elle girilen adres kaydetmeden önce doğrulanır ama doğrulama kaydı ENGELLEMEZ (10.08);
  · numarasız yazıda sıfır sonuç "bulamadık" değil "kapı numarasını da yazın"dır (14.09).

  Uçlar taklit; öneri kancasının önbelleği modül düzeyinde yaşadığı için her test KENDİ sorgusunu yazar
  (aynı metne iki farklı cevap kursaydık ikinci test birincinin önbelleğini okurdu).
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockSuggest = jest.fn();
const mockResolve = jest.fn();
const mockLocate = jest.fn();
jest.mock('@/lib/api/addresses', () => ({
  createAddress: (body: AddressWrite) => mockCreate(body),
  updateAddress: (id: string, body: AddressWrite) => mockUpdate(id, body),
  deleteAddress: (id: string) => mockDelete(id),
  suggestAddressOptions: (input: unknown) => mockSuggest(input),
  resolveAddressOption: (input: unknown) => mockResolve(input),
  locateAddress: (input: unknown) => mockLocate(input),
}));

/* Bölge listesi: yalnız 67000 aracın yolunda — rozet ve teslim satırı bu gerçekten söyler. */
jest.mock('@/lib/api/places', () => ({
  fetchDeliveryAreas: async () => ({
    data: { areas: [{ country: 'FR', places: [{ name: 'Strasbourg', codes: ['67000'] }] }] },
    error: null,
  }),
}));

const mockSelect = jest.fn();
jest.mock('./delivery-address-store', () => ({ selectDeliveryAddress: (id: string | null) => mockSelect(id) }));
const mockToast = jest.fn();
jest.mock('@lezzet/mobile-kit/src/lib/toast/toast-store', () => ({ toastSuccess: (text: string) => mockToast(text) }));

const t = addressCopy.tr.form;

const BAN_POINT = { lat: 48.5839, lng: 7.7455, precision: 'housenumber', source: 'ban' } as const;

/** BAN önerisi — tam adresiyle gelir, seçim ikinci adım istemez. */
const FR_OPTION = {
  id: 'ban-1',
  title: '12 rue des Fleurs',
  subtitle: '67000 Strasbourg',
  address: { line1: '12 rue des Fleurs', postalCode: '67000', city: 'Strasbourg', point: BAN_POINT },
};

/** Google önerisi — yalnız metin; tam adres seçimde açılır. */
const DE_OPTION = { id: 'place-1', title: 'Hauptstraße 12', subtitle: 'Kehl, Deutschland', address: null };

const SAVED: MeAddress = {
  id: 'yeni',
  label: 'Ev',
  recipient: 'Claire Weber',
  phone: '+33612345678',
  line1: '12 rue des Fleurs',
  line2: null,
  postalCode: '67000',
  city: 'Strasbourg',
  country: 'FR',
  isDefault: false,
  isBilling: false,
};

function suggestReply(options: unknown[]) {
  return { data: { options, busy: false }, error: null };
}

/** Üretimdeki varsayılan: hesabın adı ve ÜLKE İÇİ numarası (`addressDefaultsOf`). */
const DEFAULTS = { recipient: 'Claire Weber', phone: '0612345678' };

async function renderNew(onSaved = jest.fn()): Promise<jest.Mock> {
  await render(<AddressForm editing={null} addresses={[]} onSaved={onSaved} defaults={DEFAULTS} />);
  return onSaved;
}

/** Arama alanına yazıp öneri listesinin gelmesini bekler (gecikme + tel turu). */
async function search(text: string): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('address-search'), text);
  await waitFor(() => expect(screen.getByTestId('address-suggestions')).toBeTruthy());
}

beforeEach(() => {
  for (const mock of [mockCreate, mockUpdate, mockDelete, mockSuggest, mockResolve, mockLocate, mockSelect, mockToast]) mock.mockReset();
  mockSuggest.mockResolvedValue(suggestReply([]));
  mockCreate.mockResolvedValue({ data: [SAVED], error: null });
  mockLocate.mockResolvedValue({ data: null, error: null });
});

describe('adres formu — öneri ve doğrulama', () => {
  it('Fransa önerisi seçilince adres doğrulanır; teslim satırı bölge listesinden gelir', async () => {
    mockSuggest.mockResolvedValue(suggestReply([FR_OPTION]));
    await renderNew();
    await search('12 rue des fl');

    expect(mockSuggest).toHaveBeenLastCalledWith(expect.objectContaining({ country: 'FR', query: '12 rue des fl' }));
    await fireEvent.press(screen.getByTestId('address-suggestions-0'));

    expect(screen.getByTestId('address-verified')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId('address-delivery')).toHaveTextContent(t.verifiedInRouteNoDate));
  });

  it('kaydetme gövdesi ülkeyi, kaynağıyla noktayı, etiketi ve E.164 telefonu taşır', async () => {
    mockSuggest.mockResolvedValue(suggestReply([FR_OPTION]));
    await renderNew();
    await search('12 rue des flo');
    await fireEvent.press(screen.getByTestId('address-suggestions-0'));
    await fireEvent.press(screen.getByTestId('address-save'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toEqual({
      label: t.kindHome,
      recipient: 'Claire Weber',
      phone: '+33612345678',
      line1: '12 rue des Fleurs',
      line2: null,
      postalCode: '67000',
      city: 'Strasbourg',
      country: 'FR',
      point: BAN_POINT,
    });
    // Öneri noktasını zaten taşıyordu: doğrulama kapısına ikinci kez gidilmez.
    expect(mockLocate).not.toHaveBeenCalled();
  });

  it('yeni adres kaydedilince teslimat adresi olarak SEÇİLİR ve bildirim bunu söyler', async () => {
    mockSuggest.mockResolvedValue(suggestReply([FR_OPTION]));
    const onSaved = await renderNew();
    await search('12 rue des flou');
    await fireEvent.press(screen.getByTestId('address-suggestions-0'));
    await fireEvent.press(screen.getByTestId('address-save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([SAVED], 'yeni'));
    expect(mockSelect).toHaveBeenCalledWith('yeni');
    expect(mockToast).toHaveBeenCalledWith(addressCopy.tr.savedToast.replace('{name}', t.kindHome));
  });

  it('Almanya seçilince öneri DE ile sorulur; adressiz öneri seçimde açılır ve kaynağı Google olur', async () => {
    const googlePoint = { lat: 48.5719, lng: 7.8147, precision: 'housenumber', source: 'google' } as const;
    mockSuggest.mockResolvedValue(suggestReply([DE_OPTION]));
    mockResolve.mockResolvedValue({
      data: { line1: 'Hauptstraße 12', postalCode: '77694', city: 'Kehl', point: googlePoint },
      error: null,
    });
    await renderNew();
    await fireEvent.press(screen.getByTestId('address-country-DE'));
    await search('Hauptstr 12');

    expect(mockSuggest).toHaveBeenLastCalledWith(expect.objectContaining({ country: 'DE', query: 'Hauptstr 12' }));
    await fireEvent.press(screen.getByTestId('address-suggestions-0'));
    await waitFor(() => expect(screen.getByTestId('address-verified')).toBeOnTheScreen());
    expect(mockResolve).toHaveBeenCalledWith(expect.objectContaining({ country: 'DE', id: 'place-1' }));

    await fireEvent.press(screen.getByTestId('address-save'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ country: 'DE', postalCode: '77694', city: 'Kehl', point: googlePoint });
  });

  it('Google kodu vermezse seçim yarım kalır: elle giriş kartı bilinenle açılır', async () => {
    mockSuggest.mockResolvedValue(suggestReply([DE_OPTION]));
    mockResolve.mockResolvedValue({
      data: { line1: 'Hauptstraße 12', postalCode: null, city: null, point: { lat: 1, lng: 1, precision: 'street', source: 'google' } },
      error: null,
    });
    await renderNew();
    await fireEvent.press(screen.getByTestId('address-country-DE'));
    await search('Hauptstr 14');
    await fireEvent.press(screen.getByTestId('address-suggestions-0'));

    await waitFor(() => expect(screen.getByTestId('address-manual')).toBeOnTheScreen());
    expect(screen.getByTestId('address-line').props.value).toBe('Hauptstraße 12');
    expect(screen.getByTestId('address-zip').props.value).toBe('');
    expect(screen.queryByTestId('address-verified')).toBeNull();
  });
});

describe('adres formu — öneri çıkmayınca', () => {
  it('numarasız yazıda "kapı numarasını da yazın", numaralıda "bulamadık" der', async () => {
    await renderNew();
    await fireEvent.changeText(screen.getByTestId('address-search'), 'rue des lilas');
    await waitFor(() => expect(screen.getByText(t.needDoorTitle)).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('address-search'), '3 rue des lilas');
    await waitFor(() => expect(screen.getByText(t.notFoundTitle)).toBeOnTheScreen());
  });

  it('elle girilen adres kaydetmeden önce doğrulanır; bulunan nokta gövdeye girer', async () => {
    const checked = { lat: 48.6, lng: 7.76, precision: 'housenumber', source: 'ban' } as const;
    mockLocate.mockResolvedValue({ data: checked, error: null });
    await renderNew();
    await fireEvent.changeText(screen.getByTestId('address-search'), '5 rue des tilleuls');
    await waitFor(() => expect(screen.getByTestId('address-manual-open')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('address-manual-open'));

    // Kart yazılanla açılır; kod ve şehir müşteriden.
    expect(screen.getByTestId('address-line').props.value).toBe('5 rue des tilleuls');
    await fireEvent.changeText(screen.getByTestId('address-zip'), '67100');
    await fireEvent.changeText(screen.getByTestId('address-city'), 'Strasbourg');
    await fireEvent.press(screen.getByTestId('address-save'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockLocate).toHaveBeenCalledWith({ line1: '5 rue des tilleuls', postalCode: '67100', city: 'Strasbourg', country: 'FR' });
    expect(mockCreate.mock.calls[0][0].point).toEqual(checked);
  });

  it('doğrulama bulamazsa adres YİNE kaydedilir — nokta hiç gönderilmez (defter reddetmez)', async () => {
    await renderNew();
    await fireEvent.changeText(screen.getByTestId('address-search'), '7 rue des tilleuls');
    await waitFor(() => expect(screen.getByTestId('address-manual-open')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('address-manual-open'));
    await fireEvent.changeText(screen.getByTestId('address-zip'), '67100');
    await fireEvent.changeText(screen.getByTestId('address-city'), 'Strasbourg');
    await fireEvent.press(screen.getByTestId('address-save'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0].point).toBeUndefined();
  });

  it('adres seçilmeden ya da yazılmadan Kaydet kapalı', async () => {
    await renderNew();
    expect(screen.getByTestId('address-save')).toBeDisabled();
  });
});

describe('adres formu — düzenleme', () => {
  const EDITING: MeAddress = { ...SAVED, id: 'eski', label: 'Anne evi', line2: '2. kat' };

  it('kayıtlı adres elle giriş kartında açılır; başka bir ad "Diğer"e düşer; güncelleme SEÇMEZ', async () => {
    mockUpdate.mockResolvedValue({ data: [EDITING], error: null });
    const onSaved = jest.fn();
    await render(<AddressForm editing={EDITING} addresses={[EDITING]} onSaved={onSaved} />);

    expect(screen.getByTestId('address-line').props.value).toBe('12 rue des Fleurs');
    expect(screen.getByTestId('address-label').props.value).toBe('Anne evi');
    expect(screen.getByTestId('address-line2').props.value).toBe('2. kat');
    // Kayıtlı E.164 numara ülke içi yazımla gösterilir; kod seçili ülkeden.
    expect(screen.getByTestId('address-phone').props.value).toBe('0612345678');

    await fireEvent.press(screen.getByTestId('address-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([EDITING], 'eski'));
    expect(mockUpdate.mock.calls[0]).toEqual(['eski', expect.objectContaining({ label: 'Anne evi', line2: '2. kat', phone: '+33612345678' })]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('silme listeyi günceller ve bildirir', async () => {
    mockDelete.mockResolvedValue({ data: [], error: null });
    const onSaved = jest.fn();
    await render(<AddressForm editing={EDITING} addresses={[EDITING]} onSaved={onSaved} />);

    await fireEvent.press(screen.getByTestId('address-delete'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([], null));
    expect(mockToast).toHaveBeenCalledWith(t.deleted);
  });
});
