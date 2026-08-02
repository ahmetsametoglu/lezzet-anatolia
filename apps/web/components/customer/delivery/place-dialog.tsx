'use client';

import { useEffect, useRef, useState } from 'react';
import type { Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { pillInputClass } from '@/components/customer/form/pill-input';
import { suggestPostalCodesAction } from '@/lib/delivery/actions';
import { isValidPostalCode, type PlaceLookup, type PlaceOption, type PlaceSuggestion } from '@/lib/delivery/place-types';
import { formatDeliveryDate } from '@/lib/storefront/format';
import { useDeliveryPlace } from './place-context';
import messages from './place-messages.json';

/**
 * Teslimat yeri düzenleme paneli — hapa (K30) ya da şeride (K31) tıklayınca açılır.
 *
 * İki iş yapar: kodu girdirir ve **kapıya teslim ettiğimiz yerleri gösterir**. İkincisi olmadan
 * "kargo" cevabı bir çıkmaz gibi okunuyor; liste "benimki neden yok" sorusunu cevaplıyor ve
 * bölgenin gerçekten var olduğunu gösteriyor.
 *
 * Sonuç cümlesi kısıtı BURADA söylemez ("şu ürün gönderilemez"): panel sepeti bilmez. Yalnız kuralı
 * söyler — soğuk zincir kargoya verilemez. Hangi kalemin etkilendiğini kısıt bloğu (K32) söyler.
 *
 * **Gönderince KAPANMAZ** (28.07 düzeltmesi). Önce kapanıyordu ve panelin bütün amacını boşa
 * çıkarıyordu: müşteri sorusunu soruyor, cevap yazılıyor, ama cevabı okumadan ekran kayboluyordu.
 * Artık cevap gösterilir, kapatma müşterinin kararıdır ("Tamam", ✕, Escape ya da dışına tıklama) —
 * dördü de paylaşılan `Dialog` kabuğunun sözleşmesi (K3).
 *
 * ## Öneri listesi (19.7 · kullanıcı kararı 02.08)
 *
 * Müşteri yazar, biz öneririz, o **seçerek onaylar**. Bu, panelin en eski açığını kapatıyor: kod
 * elle yazıldığında yanlış hane fark edilmiyordu ve "tanımadık" cevabı bir yazım hatası mı yoksa
 * gerçekten hizmet dışı bir yer mi olduğunu söylemiyordu. Liste ikisini ayırıyor.
 *
 * **Ülke her satırda yazılı** (kullanıcı kararı): posta kodları iki ülkede birden geçerli olabiliyor
 * ve yalnız ilçe adı gören müşteri hangi ülkeye baktığını bilmiyor. Ülke bir ALAN değil — sorulmuyor,
 * yalnız gösteriliyor; seçim koda bağlı kalıyor.
 *
 * **Öneri seçmek "Göster"in yerine geçer**, ek bir onay istemez: liste zaten bir seçim ekranı, tıklama
 * niyetin kendisi. Yazıp doğrudan "Göster"e basma yolu da duruyor — kodunu ezbere bilen müşteri
 * listeyi hiç okumak zorunda değil.
 *
 * ## Dört hâl, dört cümle (19.16b)
 *
 * `resolvePlaceAction` ayrık sonuç döndürüyor ve panel dördünü de kendi diliyle karşılıyor. Tek
 * uyarıya indirilmişlerdi ve metin yalnız `unknown` için doğruydu; ötekilerde ekran müşteriye onun
 * hatası olmayan bir şeyi hata gibi söylüyordu:
 *   `ambiguous`  → seçim ekranı (ülke MÜŞTERİNİN cevabı; KDV oranı buna bağlı, biz seçemeyiz)
 *   `unknown`    → "tanımadık" + çıkış (alışveriş durmaz, teslimat yolu adreste netleşir)
 *   `unresolved` → sebebine göre İKİ ayrı cümle, ikisi de BİZİM eksiğimizi itiraf eder;
 *                  "bölge dışısınız" demek müşteriye olmayan bir kusur yüklemek olurdu.
 */
interface PlaceDialogProps {
  locale: Locale;
  onClose: () => void;
}

/** Öneri isteği gecikmesi (ms) — her tuşta sunucuya gitmemek için. */
const SUGGEST_DELAY = 220;
/** Satırda kaç yerleşim adı yazılır, gerisi "+N" olur (tasarım kararı — veri biçim dayatmaz). */
const NAMES_SHOWN = 2;

export function PlaceDialog({ locale, onClose }: PlaceDialogProps) {
  const t = messages[locale];
  // Bölge listesi BAĞLAMDAN gelir — sayfa açılırken sunucuda okundu. Burada `useEffect` ile
  // çekiliyordu ve panel açıldıktan bir süre SONRA alttan beliriyordu: müşteri "benimki var mı"
  // diye bakarken listenin yarısı henüz yoktu.
  const { place, setPostalCode, clear, zones } = useDeliveryPlace();
  const [value, setValue] = useState(place?.postalCode ?? '');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  /** `resolved` DIŞINDAKİ hâl — ekranın kuracağı cümlenin kaynağı. Çözülünce `null`. */
  const [lookup, setLookup] = useState<PlaceLookup | null>(null);
  /** Biçim hatası (5 hane) — sunucuya hiç gitmeden, yazarken. */
  const [invalid, setInvalid] = useState(false);
  /** Gerçek arıza (ağ/DB): hâllerden biri değil, genel hata. */
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Son sorulan kod — öneri listesi cevaplanmış bir kodu tekrar önermesin. */
  const asked = useRef<string | null>(place?.postalCode ?? null);

  // Öneriler yazarken gelir. Gecikme + iptal: hızlı yazan müşteride ara istekler sonuçsuz kalır ve
  // geç dönen eski bir cevap yeni listeyi ezmez.
  useEffect(() => {
    if (value.length < 2 || value === asked.current) {
      setSuggestions([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      void suggestPostalCodesAction(value).then((rows) => {
        if (live) setSuggestions(rows);
      });
    }, SUGGEST_DELAY);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [value]);

  const submit = async (code: string, country?: Country) => {
    if (!isValidPostalCode(code)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setFailed(false);
    setBusy(true);
    const result = await setPostalCode(code, country);
    setBusy(false);
    asked.current = code;
    setSuggestions([]);
    if (result === null) {
      setFailed(true);
      setLookup(null);
      return;
    }
    setLookup(result.kind === 'resolved' ? null : result);
  };

  const pick = (code: string, country: Country) => {
    setValue(code);
    void submit(code, country);
  };

  return (
    <Dialog title={t.dialogTitle} closeLabel={t.close} onClose={onClose} maxWidth={460}>
      <p className="font-sans text-note leading-relaxed text-body">{t.dialogBody}</p>

      <div className="flex gap-2.5">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
            setFailed(false);
            setLookup(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && void submit(value)}
          inputMode="numeric"
          maxLength={5}
          placeholder={t.placeholder}
          aria-label={t.dialogTitle}
          // Liste bir açılır kutu değil, panelin akışında duran bir blok — `combobox` rolü
          // klavye sözleşmesi (ok tuşları, `aria-activedescendant`) vaat eder, o sözleşme burada yok.
          autoComplete="off"
          className={pillInputClass('min-w-0 flex-1 py-2.5 text-body font-semibold')}
        />
        <Button size="sm" onClick={() => void submit(value)} disabled={busy} className="!px-5">
          {t.submit}
        </Button>
      </div>

      {invalid && <span className="font-sans text-note font-semibold text-terracotta">{t.invalid}</span>}
      {/* Arıza ≠ "tanımadık": biri bizim ulaşamadığımız, öteki kodun cevabı. Aynı cümleyi
          kullanmak müşteriye kodunun yanlış olduğunu düşündürürdü. */}
      {failed && <span className="font-sans text-note font-semibold text-terracotta">{t.failed}</span>}

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-sans text-note font-bold text-ink">{t.suggestTitle}</span>
          {suggestions.map((s) => (
            <PlaceRow
              key={`${s.country}:${s.postalCode}`}
              code={s.postalCode}
              country={s.country}
              places={s.places}
              inRoute={s.inRoute}
              t={t}
              onPick={pick}
            />
          ))}
        </div>
      )}

      {/* ── Belirsiz: ülke müşterinin cevabı ──────────────────────────────────── */}
      {lookup?.kind === 'ambiguous' && (
        <div className="flex flex-col gap-1.5 rounded-soft bg-honey-bg px-4 py-3">
          <span className="font-sans text-note font-bold text-honey">{t.ambiguousTitle}</span>
          <span className="font-sans text-note leading-relaxed text-body">{t.ambiguousBody}</span>
          <div className="mt-1 flex flex-col gap-1.5">
            {lookup.options.map((o: PlaceOption) => (
              <PlaceRow key={o.country} code={value} country={o.country} places={o.places} inRoute={o.inRoute} t={t} onPick={pick} />
            ))}
          </div>
        </div>
      )}

      {/* ── Tanınmadı: müşterinin yazım hatası ya da hizmet dışı bir yer ───────── */}
      {lookup?.kind === 'unknown' && (
        <div className="flex flex-col gap-1 rounded-soft bg-sand-100 px-4 py-3">
          <span className="font-sans text-note font-bold text-ink">{t.unknownTitle}</span>
          <span className="font-sans text-note leading-relaxed text-body">{t.unknownBody}</span>
        </div>
      )}

      {/* ── Çözülemedi: BİZİM eksiğimiz, müşterinin değil ──────────────────────── */}
      {lookup?.kind === 'unresolved' && (
        <div className="flex flex-col gap-1 rounded-soft bg-sand-100 px-4 py-3">
          <span className="font-sans text-note font-bold text-ink">
            {lookup.reason === 'no_shipping_warehouse' ? t.unresolvedShipTitle : t.unresolvedZoneTitle}
          </span>
          <span className="font-sans text-note leading-relaxed text-body">
            {lookup.reason === 'no_shipping_warehouse' ? t.unresolvedShipBody : t.unresolvedZoneBody}
          </span>
        </div>
      )}

      {/* Temizleme, ait olduğu GİRDİNİN altında: en altta dururken hangi alanı boşalttığı belirsiz
          kalıyordu ve panelin kapanış eyleminin yanına düşüp yanlışlıkla basılmaya açıktı. */}
      {place && (
        <button
          type="button"
          onClick={() => {
            clear();
            setValue('');
            setLookup(null);
            asked.current = null;
          }}
          className="w-max cursor-pointer font-sans text-note font-semibold text-muted underline hover:text-terracotta"
        >
          {t.clear}
        </button>
      )}

      {/* Sonuç: yer çözülmüşse ne anlama geldiği tek cümleyle. Kargo hâli bir HATA gibi
          yazılmaz — kargo da bizim teslimat yolumuz, yalnız soğuk zincir dışarıda kalıyor. */}
      {place && !lookup && !invalid && !failed && (
        <div
          className={[
            'flex flex-col gap-1 rounded-soft px-4 py-3 font-sans text-note leading-relaxed',
            place.inRoute ? 'bg-olive-bg text-olive-dark' : 'bg-sand-100 text-body',
          ].join(' ')}
        >
          <span>{place.inRoute ? t.resultInRoute : t.resultShipping}</span>
          {place.inRoute && place.nextDate && (
            <span className="font-semibold">{t.nextDate.replace('{date}', formatDeliveryDate(place.nextDate, locale))}</span>
          )}
        </div>
      )}

      {zones.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-sand-100 pt-3">
          <span className="font-sans text-note font-bold text-ink">{t.zonesTitle}</span>
          {zones.map((zone) => (
            <span key={zone.name} className="font-sans text-micro leading-relaxed text-muted">
              <span className="font-semibold text-body">{zone.name}</span> · {zone.postalCodes.join(' · ')}
            </span>
          ))}
        </div>
      )}

      {place && (
        <Button variant="secondary" size="sm" fullWidth onClick={onClose}>
          {t.done}
        </Button>
      )}
    </Dialog>
  );
}

/**
 * Seçilebilir yer satırı — **öneri listesi ve belirsizlik seçicisi AYNI satırı kullanır.**
 *
 * İkisi de aynı soruyu soruyor ("hangisi sizinki") ve aynı üç bilgiyi taşıyor: kod, yerleşimler,
 * ülke. Ayrı iki satır yazmak, biri iyileştiğinde ötekinin geride kalması demekti.
 *
 * **Rota işareti bir sıralama ipucudur, bir seçim değil:** kapıya teslim ettiğimiz yeri öne alıp
 * işaretliyoruz ama müşterinin yerine seçmiyoruz — iki adayın farkı yalnız teslimat yolu değil,
 * KDV oranıdır (19.8).
 */
interface PlaceRowProps {
  code: string;
  country: Country;
  places: string[];
  inRoute: boolean;
  t: (typeof messages)['tr'];
  onPick: (code: string, country: Country) => void;
}

function PlaceRow({ code, country, places, inRoute, t, onPick }: PlaceRowProps) {
  const shown = places.slice(0, NAMES_SHOWN).join(', ');
  const rest = places.length - NAMES_SHOWN;
  return (
    <button
      type="button"
      onClick={() => onPick(code, country)}
      className="flex cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-soft border border-sand-200 bg-card px-3.5 py-2 text-left transition-colors hover:border-olive"
    >
      <span className="font-sans text-body-sm font-bold text-ink">{code}</span>
      {shown && (
        <span className="font-sans text-note text-body">
          {shown}
          {rest > 0 && <span className="text-muted"> {t.suggestMore.replace('{n}', String(rest))}</span>}
        </span>
      )}
      {/* Ülke her satırda yazılı: aynı kod iki ülkede geçerli olabiliyor ve yalnız ilçe adı gören
          müşteri hangisine baktığını bilemiyor (kullanıcı kararı 02.08). */}
      <span className="font-sans text-micro font-semibold text-muted">{country === 'FR' ? t.countryFR : t.countryDE}</span>
      {inRoute && (
        <span className="ml-auto font-sans text-micro font-semibold text-olive-dark">{t.suggestRoute}</span>
      )}
    </button>
  );
}
