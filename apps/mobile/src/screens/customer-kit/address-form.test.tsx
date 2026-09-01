import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { AddressWrite } from '@/lib/api/addresses';
import { AddressForm } from './address-form';

/*
  ADRES FORMU — POSTA KODU SEÇİLİR, YAZILMAZ (21.28).

  KRİTİK İDDİA: kaydetme gövdesinde `country` VARDIR ve değeri seçilen satırdan gelir. Ülke bir
  alan değil koddan türeyen bir sonuçtur (`0033_postal_code_place.sql`), ama koddan her zaman
  türemiyor — 610 kod iki ülkede birden geçerli. Seçim o belirsizliği doğmadan kapatır.

  Seçim yoksa gövdede `country` da YOKTUR ve bu bir eksik değil: kapı kodu kendisi çözer, çözemezse
  kolon varsayılanına düşer. Form hiçbir hâlde kaydı engellemez — adres defteri hizmet alanımızı
  bilmez (kullanıcı kararı 10.08).

  Öneri ucu GERÇEK yolundan koşuyor (`suggestPostalCodes` → `apiFetch` → şema): zarf ve sözleşme
  gerçekten kat ediliyor, yalnız tel (`fetch`) ve yazma uçları taklit.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockCreate = jest.fn();
jest.mock('@/lib/api/addresses', () => ({
  createAddress: (body: AddressWrite) => mockCreate(body),
  updateAddress: jest.fn(),
  deleteAddress: jest.fn(),
}));

/* BAN (sokak) araması dış servise çıkar — taklit ediliyor. VARSAYILANI "unavailable": posta kodu
   testlerinin ölçtüğü tek şey kod yolu olsun. Koordinat testleri cevabı kendileri kurar; jest
   fabrikası yalnız `mock` önekli değişkeni görebildiği için değer bir kutuda taşınıyor. */
const mockBan: { reply: unknown } = { reply: { status: 'unavailable' } };
jest.mock('@lezzet/address-fr', () => ({
  MIN_QUERY_LENGTH: 3,
  addressLineOf: (suggestion: { line1?: string }) => suggestion.line1 ?? '',
  searchAddresses: async () => mockBan.reply,
}));

/** TEK yerleşimli: şehir seçim gerektirmez. */
const STRASBOURG = { country: 'FR', postalCode: '67000', placeName: 'Strasbourg', places: ['Strasbourg'], inRoute: true };
/** ÇOK yerleşimli: şehir seçtirilmeli — birini otomatik yazmak 19.17'nin yasakladığı şey. */
const BISCHWILLER = {
  country: 'FR',
  postalCode: '67240',
  placeName: null,
  places: ['Bischwiller', 'Gries', 'Kaltenhouse'],
  inRoute: false,
};
/** AYNI kod, Almanya — 610 çakışan koddan biri; ülkeyi ancak seçim ayırır. */
const BOBENHEIM = { country: 'DE', postalCode: '67240', placeName: 'Bobenheim-Roxheim', places: ['Bobenheim-Roxheim'], inRoute: false };

/**
 * Ucun `67240` için GERÇEK cevabı (ölçüldü 10.08): aynı kod, iki ülke, tek listede. Sıra da
 * sunucunun — rota adayı önce, eşitlikte ülke kodu; DE bu yüzden başta.
 *
 * Testler bu tek listeyi paylaşıyor ÇÜNKÜ öneri önbelleği modül düzeyinde ve dosya boyunca yaşıyor
 * (hook'un kararı: çekmece kapanıp açılınca sorgu tekrar ağa çıkmasın). Aynı koda iki farklı cevap
 * kursaydık ikinci test birincinin önbelleğini okur ve sebebi görünmeyen bir düşüş verirdi.
 */
const CAKISAN = [BOBENHEIM, BISCHWILLER];
const DE = 0;
const FR = 1;

function suggestReply(rows: unknown[]): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data: rows, error: null }) } as unknown as Response;
}

async function renderForm(rows: unknown[]): Promise<void> {
  globalThis.fetch = jest.fn(async () => suggestReply(rows)) as unknown as typeof fetch;
  /* `defaults` üretimdeki hâli taklit ediyor (22.08): dört çağıranın dördü de hesabın künyesini
     geçiriyor ve form o hâlde alıcı/telefon alanlarını DOLU açıyor. Geçirilmezse kaydetme
     doğrulamaya takılır — bu dosyanın konusu posta kodu seçimi, o yüzden künye verilerek
     yolun önü açılıyor; zorunluluğun kendi testi ayrı. */
  await render(
    <AddressForm
      editing={null}
      addresses={[]}
      onSaved={jest.fn()}
      defaults={{ recipient: 'Claire Weber', phone: '+33612345678' }}
    />,
  );
}

/** Kod alanına yazıp öneri listesinin gelmesini bekler (gecikme + tel turu). */
async function type(code: string): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('address-zip'), code);
  await waitFor(() => expect(screen.getByTestId('address-zip-suggestions')).toBeTruthy());
}

beforeEach(() => {
  // Uç taban adresi olmadan `env.apiUrl` FIRLATIR ve çağrı sessizce `network_error`a düşerdi —
  // öneri listesi hiç çizilmez, test de sebebini söylemezdi (kardeş ekran testlerinin aynı satırı).
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  mockBan.reply = { status: 'unavailable' };
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ data: [], error: null });
});

describe('adres formu — posta kodu seçimi', () => {
  it('tek yerleşimli kod seçilince şehir DOLAR — ayrıca seçtirilmez', async () => {
    await renderForm([STRASBOURG]);
    await type('67000');

    await fireEvent.press(screen.getByTestId('address-zip-suggestions-0'));

    expect(screen.getByTestId('address-city').props.value).toBe('Strasbourg');
    expect(screen.queryByTestId('address-city-suggestions')).toBeNull();
  });

  it('çok yerleşimli kodda şehir BOŞ kalır ve yerleşim listesi açılır — ad uydurulmaz', async () => {
    await renderForm(CAKISAN);
    await type('67240');

    await fireEvent.press(screen.getByTestId(`address-zip-suggestions-${FR}`));

    expect(screen.getByTestId('address-city').props.value).toBe('');
    expect(screen.getByTestId('address-city-suggestions')).toBeTruthy();

    // Seçim şehri yazar ve listeyi kapatır.
    await fireEvent.press(screen.getByText('Gries'));
    expect(screen.getByTestId('address-city').props.value).toBe('Gries');
    expect(screen.queryByTestId('address-city-suggestions')).toBeNull();
  });

  it('kaydetme gövdesi SEÇİLEN ülkeyi taşır', async () => {
    await renderForm(CAKISAN);
    await fireEvent.changeText(screen.getByTestId('address-line'), '5 Hauptstraße');
    await type('67240');
    await fireEvent.press(screen.getByTestId(`address-zip-suggestions-${DE}`));
    await fireEvent.press(screen.getByTestId('address-save'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    // AYNI kodun FR satırı da listedeydi: gövdeye giden ülke, seçilen satırın ülkesidir.
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ postalCode: '67240', city: 'Bobenheim-Roxheim', country: 'DE' });
  });

  it('kod ELLE değişince seçim düşer — gövdede ülke gitmez, kapı kendisi çözer', async () => {
    await renderForm([STRASBOURG]);
    await fireEvent.changeText(screen.getByTestId('address-line'), '3 rue des Lilas');
    await type('67000');
    await fireEvent.press(screen.getByTestId('address-zip-suggestions-0'));

    // Müşteri kodu değiştirdi: eski satırın ülkesi artık bu kodun cevabı değil.
    await fireEvent.changeText(screen.getByTestId('address-zip'), '67100');

    await fireEvent.changeText(screen.getByTestId('address-city'), 'Strasbourg');
    await fireEvent.press(screen.getByTestId('address-save'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0].country).toBeUndefined();
  });
});

/**
 * ── ÖNERİNİN KOORDİNATI (11.9 · 01.09) ──────────────────────────────────────
 * 01.09'a kadar bu form BAN önerisinin koordinatını ATIYORDU (web karşılığı 31.08'de bağlanmıştı).
 * Sonuç sessizdi: adres noktasız kaydediliyor, tarama işi on dakika sonra AYNI soruyu ikinci kez
 * BAN'a soruyordu — ve arada kalan pencerede o durak posta kodu merkezine düşüyordu. Strasbourg'da
 * o merkez hiçbir şey ayırt etmiyor (ölçüldü 31.08: üç kodun üçü de aynı nokta), yani rota sırası
 * o adres için keyfîleşiyordu.
 *
 * Sınanan şey noktanın DOĞRULUĞU değil (o sunucunun süzgecinin işi — `geo-address.test.ts`),
 * gövdeye GİRİP GİRMEDİĞİ ve seçim bozulunca DÜŞÜP DÜŞMEDİĞİ.
 */
const ONERI = {
  id: 'ban-1',
  line1: '12 rue des Fleurs',
  postalCode: '67000',
  city: 'Strasbourg',
  latitude: 48.5839,
  longitude: 7.7455,
  kind: 'housenumber',
};

/** Sokak alanına yazıp BAN listesinin gelmesini bekler. */
async function typeStreet(text: string): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('address-line'), text);
  await waitFor(() => expect(screen.getByTestId('address-suggestions')).toBeTruthy());
}

describe('adres formu — öneri koordinatı', () => {
  it('BAN önerisi seçilince nokta gövdeye GİRER — ikinci bir ağ turu yok', async () => {
    mockBan.reply = { status: 'ok', suggestions: [ONERI] };
    await renderForm([STRASBOURG]);
    await typeStreet('12 rue des');
    await fireEvent.press(screen.getByTestId('address-suggestions-0'));

    await fireEvent.press(screen.getByTestId('address-save'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      line1: '12 rue des Fleurs',
      point: { lat: 48.5839, lng: 7.7455, precision: 'housenumber' },
    });
  });

  it('öneri seçilmeden yazılan adreste nokta GÖNDERİLMEZ — alan hiç konmaz', async () => {
    /* "Bilinmiyor"u bir değere çevirmemek (ülke alanının aynı kuralı): `point: null` göndermek de
       çalışırdı ama gövdeyi anlamsız bir alanla şişirirdi. Satır sunucuda tarama kuyruğuna girer. */
    await renderForm([STRASBOURG]);
    await fireEvent.changeText(screen.getByTestId('address-line'), '3 rue des Lilas');
    await type('67000');
    await fireEvent.press(screen.getByTestId('address-zip-suggestions-0'));
    await fireEvent.press(screen.getByTestId('address-save'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0].point).toBeUndefined();
  });

  it('SOKAK elle değişince nokta DÜŞER — nokta seçilen SATIRA aittir', async () => {
    /* Arıza somut: müşteri "12 rue des Fleurs"ü seçer, sonra elle "14" yapar. Nokta 12 numaranınki
       kalırdı ve makullük süzgeci de geçerdi (aynı posta kodu) — kurye YANLIŞ KAPIYA sıralanırdı ve
       hiçbir ekran bunu söylemezdi. */
    mockBan.reply = { status: 'ok', suggestions: [ONERI] };
    await renderForm([STRASBOURG]);
    await typeStreet('12 rue des');
    await fireEvent.press(screen.getByTestId('address-suggestions-0'));

    await fireEvent.changeText(screen.getByTestId('address-line'), '14 rue des Fleurs');
    await fireEvent.press(screen.getByTestId('address-save'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0].point).toBeUndefined();
  });

  it('POSTA KODU elle değişince de nokta DÜŞER — ülkenin kardeş kuralı', async () => {
    mockBan.reply = { status: 'ok', suggestions: [ONERI] };
    await renderForm([STRASBOURG]);
    await typeStreet('12 rue des');
    await fireEvent.press(screen.getByTestId('address-suggestions-0'));

    await fireEvent.changeText(screen.getByTestId('address-zip'), '67100');
    await fireEvent.press(screen.getByTestId('address-save'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0].point).toBeUndefined();
  });
});
