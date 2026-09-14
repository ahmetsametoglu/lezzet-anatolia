'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { usePostalSuggest } from '@/lib/address/use-postal-suggest.hook';
import { isValidPostalCode, type DeliveryPlace, type PlaceLookup } from '@/lib/delivery/place-types';
import { useDeliveryPlace } from './place-context';
import messages from './place-messages.json';

type Copy = (typeof messages)['tr'];

/**
 * Yer sorusunun MANTIĞI — kod ya da yer adı girişi, öneri, çözüm hâlleri. Kabuğu başlıktaki yer
 * sorusu: masaüstünde panel (`PlacePanel`, v1: önce ülke, sonra kod; öneri yok, tek satırlık sorun),
 * mobil webde çekmece (`PlaceSheet`) — ikisi de `use-place-answer.hook` üstünden. Mantık tek yerde,
 * kabuklar yalnız çizer — panel bir ara kendi gönderme mantığını yazmıştı (13.09 kopya bulgusu).
 *
 * **Ayrı posta kodu penceresi (`PlaceDialog`) 14.09'da kalktı** (kullanıcı kararı): posta kodu yalnız
 * başlıktaki haptan sorulur; ürün, paket, katalog ve sepetteki düğmeler o soruyu açar. Pencere ülkeyi
 * önden sormuyordu ve girişli müşteriye de kod soruyordu.
 *
 * ## Öneri listesi (19.7 · kullanıcı kararı 02.08)
 *
 * Müşteri yazar, biz öneririz, o **seçerek onaylar**. Kod elle yazıldığında yanlış hane fark
 * edilmiyordu ve "tanımadık" cevabı bir yazım hatası mı yoksa gerçekten hizmet dışı bir yer mi
 * olduğunu söylemiyordu. Liste ikisini ayırıyor.
 *
 * **Ülke her satırda yazılı** (kullanıcı kararı): posta kodları iki ülkede birden geçerli olabiliyor
 * ve yalnız ilçe adı gören müşteri hangi ülkeye baktığını bilmiyor. Pencerede ülke bir ALAN değil —
 * sorulmuyor, satırda gösteriliyor; seçilen satırın ülkesi kodu bağlar (motor, 13.09). Masaüstü
 * paneli ise v1 gereği ülkeyi önce sorar (`country` seçeneği).
 *
 * **Öneri seçmek "Göster"in yerine geçer**, ek bir onay istemez: liste zaten bir seçim ekranı, tıklama
 * niyetin kendisi. Yazıp doğrudan "Göster"e basma yolu da duruyor.
 *
 * ## Dört hâl, dört cümle (19.16b)
 *
 * `resolvePlaceAction` ayrık sonuç döndürüyor ve dördü de kendi diliyle karşılanıyor:
 *   `ambiguous`  → seçim ekranı (ülke MÜŞTERİNİN cevabı; KDV oranı buna bağlı, biz seçemeyiz)
 *   `unknown`    → "bulunamadı" + çıkış (alışveriş durmaz, teslimat yolu adreste netleşir)
 *   `unresolved` → sebebine göre İKİ ayrı cümle, ikisi de BİZİM eksiğimizi itiraf eder;
 *                  "bölge dışısınız" demek müşteriye olmayan bir kusur yüklemek olurdu.
 *
 * ## "Göster" hiçbir hâlde kilitli kalmaz (kullanıcı bildirimi 13.09)
 *
 * Düğme yalnız soru sürerken kapalı (`busy`). Önce iki boşluk vardı: istek DÜŞERSE (ağ koptu, sayfa
 * yeniden yüklendi) kilit hiç açılmıyordu, ve müşteri kodu ya da ülkeyi değiştirse de süren sorunun
 * cevabını bekliyordu. Şimdi her soru bir sıra numarası taşır (`generation`): kod ya da ülke değişince
 * sıra ilerler, kilit hemen açılır ve eski sorunun cevabı ekrana yazılmaz; düşen istek genel arıza
 * cümlesine döner.
 */

interface PlaceLookupOptions {
  /** Müşterinin seçtiği ülke — verilirse kod o ülkeye bağlanır (masaüstü paneli, v1 · 13.09). */
  country?: Country;
  /** Yazarken öneri listesi (pencere). Panel v1 gereği yalnız kod alır, öneri çekmez. */
  suggest?: boolean;
  /** Yer çözülünce — panel burada kapanır ve bildirim çıkarır. */
  onResolved?: (place: DeliveryPlace) => void;
}

export function usePlaceLookup(locale: Locale, { country: chosen, suggest = true, onResolved }: PlaceLookupOptions = {}) {
  const t = messages[locale];
  const { place, setPostalCode, clear } = useDeliveryPlace();
  const [value, setValue] = useState(place?.postalCode ?? '');
  /** `resolved` DIŞINDAKİ hâl — ekranın kuracağı cümlenin kaynağı. Çözülünce `null`. */
  const [lookup, setLookup] = useState<PlaceLookup | null>(null);
  /** Biçim hatası (5 hane) — sunucuya hiç gitmeden, yazarken. */
  const [invalid, setInvalid] = useState(false);
  /** Gerçek arıza (ağ/DB): hâllerden biri değil, genel hata. */
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Son sorulan kod — öneri listesi cevaplanmış bir kodu tekrar önermesin. */
  const asked = useRef<string | null>(place?.postalCode ?? null);
  /** Kaçıncı sorudayız — cevap döndüğünde hâlâ SON soru muyuz diye bakılır (künye). */
  const generation = useRef(0);

  // Ülke değişti: süren soru geçersiz, kilit ve cümle düşer.
  useEffect(() => {
    generation.current += 1;
    setBusy(false);
    setLookup(null);
    setInvalid(false);
    setFailed(false);
  }, [chosen]);

  /**
   * Gecikme, önbellek ve yarış koruması ortak çekirdekte (`@lezzet/react-hooks`, 21.08): aynı üç
   * karar adres formunun iki alanında da veriliyor; üç nüsha, birinin bir gün ötekilerden farklı
   * davranması demekti. `asked` yine devrede: cevaplanmış bir kod tekrar önerilmez.
   */
  const suggestions = usePostalSuggest(value, { enabled: suggest && value !== asked.current });

  const submit = async (code: string, country: Country | undefined = chosen) => {
    if (!isValidPostalCode(code)) {
      setInvalid(true);
      return;
    }
    const mine = ++generation.current;
    setInvalid(false);
    setFailed(false);
    setBusy(true);
    let result: PlaceLookup | null;
    try {
      result = await setPostalCode(code, country);
    } catch {
      // İstek DÜŞTÜ (ağ koptu, sayfa yeniden yüklendi): sessiz değil — aşağıda genel arıza cümlesi
      // çıkar ve kilit açılır; açılmasaydı düğme bir daha basılamazdı.
      result = null;
    }
    // Bu arada kod ya da ülke değiştiyse cevap eski sorunundur — ekrana yazılmaz.
    if (mine !== generation.current) return;
    setBusy(false);
    // Cevaplanmış kod artık önerilmez — liste `asked` üstünden kapanıyor.
    asked.current = code;
    if (result === null) {
      setFailed(true);
      setLookup(null);
      return;
    }
    if (result.kind === 'resolved') {
      setLookup(null);
      onResolved?.(result.place);
      return;
    }
    setLookup(result);
  };

  const pick = (code: string, country: Country) => {
    setValue(code);
    void submit(code, country);
  };

  const reset = () => {
    generation.current += 1;
    setBusy(false);
    clear();
    setValue('');
    setLookup(null);
    asked.current = null;
  };

  const inputProps = {
    value,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      // Kod değişti: süren soru geçersiz ve düğme hemen açılır.
      generation.current += 1;
      setBusy(false);
      setValue(e.target.value);
      setInvalid(false);
      setFailed(false);
      setLookup(null);
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') void submit(value);
    },
    /**
     * ── ALAN YER ADI DA KABUL EDİYOR (08.41) ─────────────────────────────────────
     * Eskiden `inputMode="numeric"` + `maxLength={5}` vardı ve alan harfi ENGELLEMİYOR, yalnız
     * KIRPIYORDU: "Strasbourg" yazan müşteriye alanda *"Stras"* kalıyor, öneri gelmiyor, "Göster"
     * *"posta kodu 5 hane olmalı"* diyordu (ölçüldü 25.08). Motor ad aramasını 15.08'den beri
     * biliyor; eksik olan yalnız müşteri yüzeyinin kapısıydı. `inputMode` düştü (sayısal klavye
     * ada uymuyor); tavan 40 bir yazım kolaylığı değil, yapıştırılan metnin alanı taşırmasına karşı.
     * Masaüstü paneli bu üçünü kendi ezer: v1 orada yalnız kod soruyor ve öneri listesi yok.
     */
    maxLength: 40,
    placeholder: t.placeholder,
    // Liste bir açılır kutu değil, akışta duran bir blok — `combobox` rolü klavye sözleşmesi
    // (ok tuşları, `aria-activedescendant`) vaat eder, o sözleşme burada yok.
    autoComplete: 'off',
  };

  return { place, value, submit, pick, reset, lookup, invalid, failed, busy, suggest, suggestions, inputProps };
}

type PlaceLookupState = ReturnType<typeof usePlaceLookup>;

/**
 * Girişin TEK SATIRLIK sorunu — biçim, arıza ya da çözülemeyen hâl; yoksa `null`. Panel yalnız bunu
 * yazar; pencere biçim ve arızayı bununla, öteki hâlleri kendi bloklarıyla (başlık + açıklama) çizer.
 *
 * **İKİ AYRI EKSİK, İKİ AYRI CÜMLE (08.41):** harf yazan müşteriye *"posta kodu 5 hane olmalı"* demek
 * onu düzeltemeyeceği bir kurala yollamaktır — yazdığı şey bir yer adı, doğrusu listeden seçmek.
 * Öneri listesi olmayan kabukta (panel) o yol yok; orada biçim cümlesi kalır.
 * Arıza ≠ "bulunamadı": biri bizim ulaşamadığımız, öteki kodun cevabı.
 */
export function lookupMessage(state: PlaceLookupState, t: Copy): string | null {
  if (state.invalid) return state.suggest && /\p{L}/u.test(state.value) ? t.pickFromList : t.invalid;
  if (state.failed) return t.failed;
  if (state.lookup?.kind === 'unknown') return t.unknownTitle;
  if (state.lookup?.kind === 'unresolved') return state.lookup.reason === 'no_shipping_warehouse' ? t.unresolvedShipTitle : t.unresolvedZoneTitle;
  if (state.lookup?.kind === 'ambiguous') return t.ambiguousTitle;
  return null;
}
