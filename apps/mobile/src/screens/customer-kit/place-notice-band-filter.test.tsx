import { fireEvent, render } from '@testing-library/react-native';

import messages from '@/lib/places/messages.json';
import { PlaceNoticeBand } from './place-notice-band';

/*
  BANDIN SÜZGEÇ YUVASI — "Adresime gönderilebilir" anahtarı (kullanıcı kararı 11.08).

  ── NEDEN AYRI DOSYA (ölçülmüş sebep, tercih değil) ─────────────────────────
  Bandın ana test dosyası kimlik akışını gerçek kancayla koşturuyor (`useMe` taklit EDİLMEDİ — o
  dosyanın kendi kararı) ve `use-me.hook` modül deposu cevabını `act` dışında yayınlıyor. Ölçüldü
  (11.08): o yayın bir SONRAKİ testin `render`ıyla üst üste biniyor ("You seem to have overlapping
  act() calls") ve React o testte ağacı HİÇ KURMUYOR — iddia tek koşarken geçiyor, paket içinde
  boş ağaçla düşüyordu. Yani düşen şey bileşen değil, koşucunun ağacıydı.

  Buradaki iki iddianın kimlikle işi yok: süzgeç yuvası çizilsin mi, dokunuş çağırana gidiyor mu.
  O yüzden bu dosya `useMe`yi MİSAFİRE sabitliyor — ağa hiç çıkılmıyor, yarışacak bir yayın yok.
  Ana dosyadaki act hijyeni ayrı bir borç ve orada duruyor (`BACKLOG-musteri` MB-38 test defteri).
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));
jest.mock('@/lib/onboarding/onboarding-store');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: () => undefined }) }));
jest.mock('@/lib/toast/toast-store', () => ({ publishToast: () => undefined }));
/** Kimlik SABİT: misafir. Bandın süzgeç yuvası oturumdan bağımsız (künye). */
jest.mock('./use-me.hook', () => ({ useMe: () => ({ status: 'ready', me: null }) }));

describe('PlaceNoticeBand · süzgeç yuvası', () => {
  it('süzgeç prop VERİLMEZSE anahtar çizilmez — paketler listesinin hâli', async () => {
    const view = await render(
      <PlaceNoticeBand country="FR" postalCode="75001" source="app-packages" testID="pkg" />,
    );

    expect(view.queryByTestId('pkg-shippable-toggle')).toBeNull();
    expect(view.queryByText(messages.tr.onlyShippable)).toBeNull();
  });

  it('süzgeç prop VERİLİRSE anahtar bandın içinde çizilir ve dokunuş çağırana gider', async () => {
    const onChange = jest.fn();
    const view = await render(
      <PlaceNoticeBand
        country="FR"
        postalCode="75001"
        source="app-catalog"
        shippableFilter={{ value: false, onChange }}
        testID="cat"
      />,
    );

    // Etiket YER AİLESİNİN sözlüğünden gelir (`shippableChipLabel`), banda ikinci nüsha yazılmadı.
    expect(view.getByText(messages.tr.onlyShippable)).toBeOnTheScreen();

    await fireEvent.press(view.getByTestId('cat-shippable-toggle'));
    // Değer BANTTA tutulmuyor: kaynağı katalog kancası (`onlyShippable`) — bant çizer ve iletir.
    expect(onChange).toHaveBeenCalledWith(true);
  });

  /* HAPIN ETİKETİ kod + ŞEHİR (kullanıcı isteği 11.08). Şehir sözleşmede `null` olabiliyor ve o
     hâlde uydurma bir ad basılmaz — iki iddia da bu ayrımı tutuyor. */
  it('hapta posta kodunun yanında şehir de yazar', async () => {
    const view = await render(
      <PlaceNoticeBand country="FR" postalCode="67000" placeName="Strasbourg" source="app-catalog" testID="cat" />,
    );

    expect(view.getByText(messages.tr.placeNotice.code.replace('{postal}', '67000 STRASBOURG'))).toBeOnTheScreen();
  });

  it('şehir bilinmiyorsa hapta YALNIZ kod kalır — yer tutucu uydurulmaz', async () => {
    const view = await render(
      <PlaceNoticeBand country="FR" postalCode="75001" placeName={null} source="app-catalog" testID="cat" />,
    );

    expect(view.getByText(messages.tr.placeNotice.code.replace('{postal}', '75001'))).toBeOnTheScreen();
  });
});
