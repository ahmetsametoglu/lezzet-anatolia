'use client';

import { useState } from 'react';
import type { Address, Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { FormInputField } from '@/components/customer/form/form-input-field';
import { formatDeliveryDate } from '@/lib/storefront/format';
import { AddressFields, type AddressFieldsCopy } from './address-fields';
import { useDeliveryPlace } from './place-context';
// Ülke adları: yer hapıyla ORTAK kaynak — gerekçe ülke alanının künyesinde.
import placeCopy from './place-messages.json';

/**
 * K35 · Adres formu — **checkout ile hesap sayfasının ORTAK parçası**.
 *
 * Bir süre yalnız checkout'un içinde, yerel bir fonksiyon olarak yaşıyordu; hesap sayfası adres
 * eklemek isteyince ikinci bir kopya yazmak gerekiyordu. Aynı formun iki görünümü, biri
 * iyileştiğinde öbürünün eskimesi demekti (CLAUDE.md §1) — üstelik burada "iyileşme" dediğimiz şey
 * `autoComplete` jetonları ve posta kodu doğrulaması gibi, unutulduğunda sessizce pahalıya patlayan
 * ayrıntılar.
 *
 * **Metin dışarıdan gelir** (`AddressFormCopy`): her sayfa kendi `messages.json`'undan geçirir —
 * global sözlük yok (CLAUDE.md §2). Bileşen hangi sayfada olduğunu bilmez.
 *
 * Alan sırası **K33** ile birebir ve SABİT: başlık · alıcı · sokak · kapı/kat · posta kodu + şehir ·
 * telefon · ülke · varsayılan.
 */

export interface NewAddressInput {
  /** "Ev", "İş" — kart başlığı olur; boş bırakılabilir, o zaman şehir başlık olur. */
  label?: string;
  /** Alıcı: adrese GİDEN kişi, hesabın sahibi olmak zorunda değil (hediye, iş adresi). */
  recipient?: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  phone?: string;
  /**
   * Ülke müşteriye SORULMAZ, posta kodundan TÜRER (19.8) — ve bu alan o türetmenin taşıyıcısı.
   *
   * Form bir tur boyunca ülkeyi hiç taşımıyordu: `toAddressFields` sabit `'FR'` yazıyordu ve
   * ekranda "Fransa" salt okunur duruyordu. Bugün tek ülkeye teslim ettiğimiz için zararsız
   * görünüyordu, ama **610 posta kodu iki ülkede birden geçerli** (ölçüm 10.08) ve KEHL deposu
   * etkin — o kodlarda sabit `FR` bir varsayımdı, sonuç değil. Alan boş bırakılabilir: dolduran
   * yer kodun ÇÖZÜMÜDÜR, müşterinin beyanı değil.
   */
  country?: Country;
  makeDefault?: boolean;
}

/**
 * Formun çıktısı → adres alanları. Dönüşüm AÇIK yazılır (yayma ile değil): `NewAddressInput` formun
 * kendi sözleşmesi ve içinde `makeDefault` var — adres tablosunda öyle bir kolon yok, `is_default`
 * var ve onu ayrı bir eylem yönetiyor. Yayarak geçmek, kapının ayıklamasına güvenmek demekti.
 *
 * **Formun yanında durur, çağıranın içinde değil:** hesap sayfası ile checkout aynı formu kullanıyor
 * ve aynı dönüşüme ihtiyaç duyuyor. İki kopya olsaydı biri yeni bir alan öğrenip öteki öğrenmezdi —
 * `recipient` ile `phone`ın bir kez sessizce düşmesi (28.07) tam olarak bu sınıftandı.
 */
export function toAddressFields(input: NewAddressInput) {
  return {
    label: input.label ?? null,
    recipient: input.recipient ?? null,
    line1: input.line1,
    line2: input.line2 ?? null,
    postalCode: input.postalCode,
    city: input.city,
    phone: input.phone ?? null,
    /* Çözülemediyse bugünkü davranış korunur (`FR`) — geri düşüş, formun kodu hiç doğrulatmadan
       kaydedilebildiği hâl için. Doğru olan çözümden geleni yazmak; hiç yoksa da bir değer
       yazmak zorundayız, kolon `not null`. */
    country: input.country ?? ('FR' as const),
  };
}

/** DB satırı → formun beklediği şekil. Düzenlemede alanlar DOLU açılır; boş form yeniden yazdırırdı. */
export function toFormInput(address: Address): NewAddressInput {
  return {
    label: address.label ?? undefined,
    recipient: address.recipient ?? undefined,
    line1: address.line1,
    line2: address.line2 ?? undefined,
    postalCode: address.postalCode,
    city: address.city,
    phone: address.phone ?? undefined,
    country: address.country,
    makeDefault: address.isDefault,
  };
}

/**
 * Formun ihtiyaç duyduğu metinler — sayfanın kendi sözlüğünden geçirilir.
 *
 * Dışa AÇILMAZ: çağıranlar kendi `Messages` tipinden geçiyor, yapısal uyum yeter. Export edilseydi
 * kullanılmayan bir dışa açık tip olurdu (`knip`).
 */
interface AddressFormCopy extends AddressFieldsCopy {
  /** Çekmece başlığı (yalnız mobil web) — masaüstünde form satır içi açıldığı için çizilmez. */
  sheetTitle: string;
  optional: string;
  label: string;
  recipient: string;
  line2: string;
  phone: string;
  country: string;
  countryValue: string;
  makeDefault: string;
  save: string;
  cancel: string;
  postalHint: string;
  placeInRoute: string;
  placeInRouteNoDate: string;
  placeShipping: string;
}

interface AddressFormProps {
  copy: AddressFormCopy;
  locale: Locale;
  /** Düzenlemede mevcut değerler; yeni adreste boş. */
  initial?: NewAddressInput;
  onSave: (input: NewAddressInput) => Promise<void>;
  onCancel: () => void;
  /**
   * Mobil web forku — form bir ÇEKMECENİN içinde çiziliyor (kullanıcı kararı 21.08).
   *
   * İki şeyi birden değiştirir ve ikisi de aynı sebepten: **ikili satırlar tek sütuna iner** ve
   * **kart çerçevesi düşer** (çekmece zaten bir kap; kabın içine ikinci bir kap çizmek ekranın
   * dar genişliğini bir kez daha yer).
   *
   * ÖLÇÜLDÜ (21.08, iPhone 13 · 390 px): kart içi genişlik **278 px**ti ve üç ikili satır onu
   * şöyle bölüyordu — alıcı adı 133 px (*"Ahmet SAMET"* kırpılıyordu), şehir 116 px
   * (*"Illkirch-Gra…"*), telefon **96 px** (*"+337680…"*). En tersi: SALT OKUNUR ülke alanı
   * satırın **%61**'ini alıyordu. Posta kodu (beş hane, 150 px sabit) şehir adından genişti.
   *
   * `md:` ile akışkan responsive DEĞİL (`CLAUDE §2`): karar cihaz forkundan geliyor, çağıran
   * `useDevice` sonucunu geçiyor.
   */
  compact?: boolean;
}

export function AddressForm({ copy, locale, initial, onSave, onCancel, compact = false }: AddressFormProps) {
  const [form, setForm] = useState<NewAddressInput>(initial ?? { line1: '', postalCode: '', city: '' });
  const [busy, setBusy] = useState(false);
  const [postalError, setPostalError] = useState<string | null>(null);
  const { place, setPostalCode } = useDeliveryPlace();

  const filled = (key: keyof NewAddressInput) => Boolean((form[key] as string | undefined)?.trim());
  /**
   * ── BAŞLIK ARTIK KAPIYI KİLİTLEMİYOR (kullanıcı bulgusu 21.08) ──────────────────────────────
   * `label` bu listedeydi ve kaydetmeyi engelliyordu — oysa alanın kendi sözleşmesi *"boş
   * bırakılabilir, o zaman şehir başlık olur"* diyor, kolon `null` kabul ediyor ve kartı çizen
   * yer o geri düşüşü ZATEN uyguluyor (`address.label ?? address.city`). Yani form, sisteminin
   * her katmanında isteğe bağlı olan tek bir alanı zorunlu tutuyordu.
   *
   * Görünmez bir kilitti: alanın yanında "(isteğe bağlı)" yazmadığı için müşteri düğmenin neden
   * kapalı olduğunu ancak alanları tek tek deneyerek bulabiliyordu. Kullanıcı ekran görüntüsüyle
   * bildirdi — her şey doluydu, düğme kapalıydı, eksik olan tek şey başlıktı.
   *
   * Kalan dördü GERÇEKTEN zorunlu: alıcı ve telefon olmadan kurye kapıya gidemez, sokak ve kod
   * olmadan adres adres değildir. Onlar `optional` işareti de taşımıyor — kapı ile ekran aynı
   * şeyi söylüyor.
   */
  const complete = filled('recipient') && filled('line1') && filled('postalCode') && filled('city') && filled('phone');

  /**
   * `autoComplete` ŞART ve alanın kendi jetonuyla: tarayıcı kayıtlı adresi ancak alanın ne olduğunu
   * anlarsa önerir. Jeton yoksa öneri hiç çıkmaz ve müşteri adresini elle yazar — bir adres
   * formunda en pahalı sürtünme budur. `name` de veriliyor; bazı tarayıcılar sezgilerini ondan kurar.
   */
  const META: Record<string, { autoComplete: string; name: string }> = {
    label: { autoComplete: 'off', name: 'address-label' },
    recipient: { autoComplete: 'name', name: 'recipient' },
    line1: { autoComplete: 'address-line1', name: 'address-line1' },
    line2: { autoComplete: 'address-line2', name: 'address-line2' },
    postalCode: { autoComplete: 'postal-code', name: 'postal-code' },
    city: { autoComplete: 'address-level2', name: 'city' },
    phone: { autoComplete: 'tel', name: 'phone' },
  };

  const field = (key: keyof NewAddressInput, label: string, optional = false) => (
    <FormInputField
      label={label}
      optional={optional}
      optionalLabel={copy.optional}
      value={(form[key] as string) ?? ''}
      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
      autoComplete={META[key]?.autoComplete}
      name={META[key]?.name}
    />
  );

  /**
   * Posta kodu ALAN TERK EDİLİNCE doğrulanır ve teslimat cevabı orada verilir (K34: "doğrulama alan
   * terk edilince çalışır, kaydete basınca değil"; K35: "posta kodu yazıldığı an teslimat cevabı
   * verir"). Müşteri formun sonuna kadar yazıp da adresin gönderilebilir olmadığını en sonda
   * öğrenmemeli.
   *
   * Çözümü sitenin ORTAK yer bağlamı yapar (`setPostalCode`) — burada ikinci bir çözüm yazılsaydı
   * başlıktaki yer hapı ile formun cevabı ayrışabilirdi. Yan etkisi de istediğimiz şey: kod bölge
   * dışıysa aşağıdaki K32 kısıt bloğu kendiliğinden açılır.
   */
  /**
   * **Dönüş değeri 19.16b'de TERSİNE döndü ve burası onu bilmiyordu.** `setPostalCode` eskiden hata
   * metni ya da `null` dönüyordu; artık `PlaceLookup | null` dönüyor ve `null` YALNIZ gerçek arıza
   * demek. Eski `failure ? …` kontrolü bu yüzden çözülen her kodda uyarı basıyor, gerçekten
   * başarısız olduğunda susuyordu. Tip değişimi derleyiciye görünmedi (ikisi de "truthy sorgulanan
   * bir değer"), sessizce ters çalıştı.
   */
  const checkPostal = async (raw: string) => {
    const value = raw.trim();
    if (!value) return setPostalError(null);
    const lookup = await setPostalCode(value);
    // Kabul edilen tek hâl `resolved`. `ambiguous`/`unknown`/`unresolved` ve arıza (`null`) hepsi
    // "bu kodla devam edilemez" demek — ekranları ayrışacak (19.7) ama form için sonuç aynı.
    setPostalError(lookup?.kind === 'resolved' ? null : copy.postalHint);
    /* ÜLKE BURADAN TÜRER — tek kaynak. `AddressFields` seçim yolunda da bu işlevi çağırıyor
       (`onPostalBlur`), yani seçilen kod da elle yazılan kod da aynı çözümden geçiyor; ikinci bir
       türetme yazsaydık iki yolun bir gün ayrışması kaçınılmazdı. Çözülemeyen kodda ülkeye
       DOKUNULMAZ: bilinmeyeni bir değere düşürmek, bilinmeyeni bilinen gibi okutmak olurdu. */
    if (lookup?.kind === 'resolved') setForm((prev) => ({ ...prev, country: lookup.place.country }));
  };

  /**
   * ── ŞEHİR KODDAN DOLDURULMUYOR, VE BU BİLİNÇLİ (01.08) ────────────────────
   * Bir süre burada "şehir boşsa `placeName` ile doldur" vardı; yaşanmış bir hatayı hedefliyordu
   * (`67000` Strasbourg + `LINGOLSHEIM` yazılmış bir kapıda-ödeme siparişi, oysa Lingolsheim'ın
   * kodu 67380 ve o kod rota bölgelerimizde yok). **Geri alındı, çünkü referans verisi bu işi
   * taşıyamıyor.**
   *
   * `postal_code_place` kod başına TEK ad tutuyor ve çok yerleşimli kodda üst idari birime
   * çıkıyor. Tuzak şurada: o üst birim çoğu zaman kendi merkez kasabasının ADINI taşır ve geçerli
   * bir belediye adı gibi okunur — `67800` bizde "Strasbourg" (gerçek: Bischheim/Hoenheim),
   * `51300` "Vitry-le-François" (gerçek: 46 köy). Yani doldurma, Bischheim'lı müşterinin adresine
   * "Strasbourg" yazardı: bir yanlışı düzeltmek değil, doğruyu bozmak. Kodların **%40'ı** çok
   * yerleşimli (FR 4.289 + DE 2.392 / 16.878), yani bu istisna değil kural.
   *
   * Aynı sebeple kodun yer adı bu formda HİÇ gösterilmiyor: "📍 67800 Strasbourg" satırı
   * Bischheim'lı müşteriye yanlış bir şehir söyler. Uydurulmuş şehir adı yazmama kuralı
   * (`place-types.ts`) burada da geçerli — ad güvenilir olmadığı sürece gösterilmez.
   *
   * Doğru çözüm veride: kod başına TÜM yerleşimler + adın gerçekten belediye olup olmadığını
   * söyleyen bir işaret (`19.17`). O gelince hem doldurma hem "şehir bu koda ait mi" kuralı
   * yazılabilir; ikisi de aynı veriyi bekliyor.
   */

  const answer = !postalError && place && place.postalCode === form.postalCode.trim() ? place : null;

  const kaydet = (
    <Button
      disabled={!complete || busy}
      /* Çekmecede TAM GENİŞLİK: yanında ikinci bir düğme yok, ve uzun etiket dar kutuda iki satıra
         kırılıyordu (kullanıcı bildirimi: *"aşağıdaki butona sığmama durumu var"*). */
      fullWidth={compact}
      onClick={async () => {
        setBusy(true);
        await onSave({
          ...form,
          label: form.label?.trim() || undefined,
          recipient: form.recipient?.trim() || undefined,
          line2: form.line2?.trim() || undefined,
          phone: form.phone?.trim() || undefined,
        });
        setBusy(false);
      }}
    >
      {copy.save}
    </Button>
  );

  /**
   * Eylem satırı. **Çekmecede "Vazgeç" YOK** (kullanıcı kararı 21.08): çekmece zaten üç kapanış
   * yolu sunuyor — ✕, örtüye dokunma, Escape. Dördüncü bir düğme hem yer yiyor hem de kaydetin
   * yanında durup onu dar kutuya sıkıştırıyordu.
   *
   * Masaüstünde satır içi formun ✕'i YOK; orada "Vazgeç" tek çıkıştır ve kalıyor — K2'ye göre
   * çerçeveli, metne kaçmış bir bağlantı değil.
   */
  const actions = compact ? (
    kaydet
  ) : (
    /* Tasarımda eylem satırı İNCE BİR AYRAÇLA ayrılır: formun sonu ile kararın başladığı yer. */
    <div className="flex items-center gap-2.5 border-t border-sand-100 pt-3.5">
      {kaydet}
      <Button variant="secondary" size="sm" onClick={onCancel}>
        {copy.cancel}
      </Button>
    </div>
  );

  /* Gövde kaptan BAĞIMSIZ tutuluyor: masaüstünde doğrudan, mobil webde çekmecenin içinde çizilir.
     İkinci bir kopya yok, yani iki yol da aynı alanları aynı sırada göstermek zorunda. */
  const body = (
    /* Tasarım künyesi: beyaz kart · 1px kum-200 kenar · radius 18 · ped 20/22 · gap 14.
       Satır içi açılır, ayrı sayfa yoktur (envanter).
       ÇEKMECEDE kap DÜŞER: çekmecenin kendisi zaten kart (kum zemin, üstten yuvarlak, kendi pedi);
       içine ikinci bir kart çizmek dar ekranda iki kat kenarlık ve iki kat ped demekti. */
    <div
      className={
        compact
          ? 'flex w-full flex-col gap-3.5'
          : 'flex w-full flex-col gap-3.5 rounded-card border border-sand-200 bg-card px-5.5 py-5'
      }
    >
      {/* Başlık + alıcı: masaüstünde yan yana (geniş sütun taşır), çekmecede alt alta. */}
      <div className={compact ? 'flex flex-col gap-3.5' : 'flex gap-3'}>
        <div className="flex-1">{field('label', copy.label, true)}</div>
        <div className="flex-1">{field('recipient', copy.recipient)}</div>
      </div>
      {/* Sokak · posta kodu · şehir ARTIK ÖNERİLİ ve davranış ortak bileşende (`AddressFields`):
          aynı üçlüyü çizen profesyonel başvuru formu da oradan besleniyor. Kapı numarası, posta
          kodu ve şehir tek dokunuşla birlikte dolar. */}
      <AddressFields
        value={{ line1: form.line1, postalCode: form.postalCode, city: form.city }}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        copy={copy}
        onPostalBlur={(code) => void checkPostal(code)}
        onCountryChange={(country) => setForm((prev) => ({ ...prev, country: country ?? undefined }))}
        postalError={postalError ?? undefined}
        afterLine1={field('line2', copy.line2, true)}
        compact={compact}
      />
      {/**
       * ── ÜLKENİN İKİ KAYNAĞI VAR VE İKİSİ DE GEREKLİ (ölçüldü 21.08) ──────────────────────────
       * Bu satır bir tur boyunca yoktu: ülkeyi yalnız `checkPostal` türetiyordu, gerekçesi de
       * *"iki yol da aynı çözümden geçiyor, ikinci kaynak gereksiz"*di. **Ölçüm bunu çürüttü.**
       *
       * `77694` (Kehl) seçilerek girildi ve kayıt `country = FR` ile yazıldı. Sebep: kod
       * ÇÖZÜLMÜYOR — yer hapı da aynı cevabı veriyor (*"bu ülkeye gönderim açık değil"*: DE için
       * sevk deposu tanımlı değil, `unresolved`). Çözüm başarısız olunca `checkPostal` ülkeye hiç
       * dokunmuyor ve `toAddressFields` geri düşüşü `FR` yazıyor — yani sessizce YANLIŞ ülke.
       *
       * Oysa bilgi ekranda ZATEN vardı: öneri satırı `(country, postalCode)` ikilisini birlikte
       * taşıyor ve kaynağı `postal_code_place` referansı — sevk deposu yapılandırmasından
       * BAĞIMSIZ. Bir yer bize gönderim açık olmadığı için Fransa'ya taşınmaz.
       *
       * Üç yol, ikisi bilgili: listeden seçim → referanstan ülke · elle yazıp kod çözüldü →
       * çözümden ülke · elle yazıp çözülemedi → BİLİNMİYOR, geri düşüş devrede (`toAddressFields`).
       */}

      {/* Teslimat cevabı. Bölge dışı bir HATA DEĞİLDİR (tasarım): nötr krem satır kullanılır,
          kırmızı yalnız biçim hatasına ayrılmıştır. */}
      {answer && (
        <div
          className={[
            'rounded-[12px] px-3.5 py-2.5 font-sans text-note leading-relaxed font-semibold',
            answer.inRoute ? 'border border-olive-line bg-olive-bg text-olive-dark' : 'bg-sand-100 text-body',
          ].join(' ')}
        >
          {answer.inRoute
            ? answer.nextDate
              ? copy.placeInRoute.replace('{date}', formatDeliveryDate(answer.nextDate, locale))
              : copy.placeInRouteNoDate
            : copy.placeShipping}
        </div>
      )}

      {/* Telefon + ülke aynı satırda; çekmecede pay çevrilir (kullanıcı kararı 21.08). Masaüstünde
          ülke 170 px sabit — geniş kapta oturuyor. Dar kapta o sabit, SALT OKUNUR bir alanın
          satırın %61'ini yemesi demekti (ölçüldü: telefon 96 px). Telefon uzun, ülke tek kelime. */}
      <div className="flex gap-3">
        <div className={compact ? 'basis-[65%]' : 'flex-1'}>{field('phone', copy.phone)}</div>
        {/**
         * Ülke SALT OKUNUR (K34'ün beşinci hâli): seçim sunmak müşteriye bir karar veriyormuş gibi
         * yapmak olurdu — ülke bir alan değil, posta kodundan türeyen bir SONUÇ (19.8).
         *
         * ── AMA SABİT "Fransa" YAZIYORDU VE ARTIK YALAN SÖYLÜYORDU (21.08) ────────────────────
         * `copy.countryValue` sabit bir metindi ve ülke her zaman `FR` yazıldığı sürece dürüsttü.
         * Ülke 20.08'de posta kodundan türetilir olunca ikisi ayrıştı; ölçüldü: `77694 Kehl`
         * seçilince ekran **"Fransa"** diyor, kayda **`DE`** yazılıyordu. Müşteriye gösterilen ile
         * saklanan aynı olmalı — özellikle KDV'yi ve teslimat yolunu belirleyen bir alanda.
         *
         * Ad `place-messages`ten okunuyor, sözlüklere yeni anahtar eklenmedi: aynı iki ülkenin adı
         * zaten orada ve üç dilde (yer hapı onları çiziyor). Dört ayrı sözlüğe kopyalamak, bir gün
         * yer hapının "Almanya" derken formun başka bir şey demesi demekti (CLAUDE §1).
         */}
        <div className={compact ? 'basis-[35%]' : 'w-[170px] flex-none'}>
          <FormInputField
            label={copy.country}
            value={(form.country ?? 'FR') === 'DE' ? placeCopy[locale].countryDE : placeCopy[locale].countryFR}
            readOnly
            name="country"
            autoComplete="country-name"
          />
        </div>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={form.makeDefault ?? false}
          onChange={(e) => setForm((prev) => ({ ...prev, makeDefault: e.target.checked }))}
          className="size-[22px] flex-none cursor-pointer rounded-[6px] accent-olive"
        />
        <span className="font-sans text-body-sm text-ink">{copy.makeDefault}</span>
      </label>

      {/* Tasarımda eylem satırı İNCE BİR AYRAÇLA ayrılır: formun sonu ile kararın başladığı yer.
          ÇEKMECEDE bu satır gövdenin İÇİNDE DEĞİL, kabuğun kaymayan alt bölmesinde durur (aşağıda
          `actions`) — gerekçesi `Dialog.footer` künyesinde. */}
      {!compact && actions}
    </div>
  );

  /**
   * ── ÇEKMECE KARARI FORMUN KENDİSİNDE, ÇAĞIRANLARDA DEĞİL (kullanıcı kararı 21.08) ────────────
   * Form bugün DÖRT yerden satır içi açılıyor (hesap: ekle + düzenle · checkout: ekle + düzenle).
   * Sarmalamayı çağıranlara bıraksaydık aynı `Dialog` kurulumu dört kez yazılırdı ve dördünün bir
   * gün ayrışması kaçınılmazdı — `Dialog` künyesinin kendi dersi tam olarak bu (*"iki panel kabuğu
   * ayrı kurulmuştu ve asıl sorun kapanma sözleşmelerinin farklı olmasıydı"*). Çağıran tek bir şey
   * söyler: `compact`.
   *
   * **`onCancel` çekmecenin de kapanışıdır** — ✕, örtüye dokunma ve Escape hepsi oraya bağlanır;
   * müşteri için "vazgeç" tek bir şeydir, üç ayrı kapanış yolu üç ayrı sonuç doğurmamalı.
   */
  if (!compact) return body;
  return (
    <Dialog title={copy.sheetTitle} closeLabel={placeCopy[locale].close} onClose={onCancel} placement="sheet" footer={actions}>
      {body}
    </Dialog>
  );
}
