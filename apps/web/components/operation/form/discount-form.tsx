'use client';

import type { ReactNode } from 'react';
import { fromCents, toCents } from '@lezzet/helper';
import { LOCALES, type Locale } from '@lezzet/i18n';
import type {
  DiscountDraftPayload,
  DiscountScope,
  DiscountTrigger,
  DiscountType,
  LocalizedText,
} from '@lezzet/types';
import { FieldShell } from './field-shell';
import { Input } from './input';
import { MoneyField, PercentField } from './money-input';
import { DateRangeField } from './date-field';
import { parseDay, toDay } from './calendar-math';
import { MultiToggle } from './multi-toggle';
import { LocaleCard } from './locale-card';
import { LocalizedTextField } from './localized-text-field';
import { Select } from './select';
import { Toggle } from './toggle';

/**
 * İNDİRİM / KUPON FORMUNUN GÖVDESİ — dialog'dan AYRI, çünkü iki yerde çiziliyor (22.10).
 *
 * ── NEDEN SAYFA KLASÖRÜNDE DEĞİL, ORTAK KOMPONENTLERDE ──────────────────────
 * Bir tur `prices/` altına yazılmıştı ve `docs:check` haklı olarak reddetti (`STACK §7`: kardeş
 * sayfadan yalnız `*-url` import edilir). Kural burada bir teknik ayrıntı değil, ölçünün kendisi:
 * iki yüzey aynı formu paylaşıyorsa o form artık bir sayfaya ait DEĞİLDİR. Sayfada bırakıp öteki
 * sayfadan çağırmak, sahipliği belirsiz bir dosya üretirdi — fiyat ekranı onu kendi malı sanıp
 * değiştirir, asistan kuyruğu sessizce kırılırdı.
 *
 * ── NEDEN AYRILDI ───────────────────────────────────────────────────────────
 * Gövde bir tur `discount-dialog` içinde gömülüydü ve asistan kuyruğu aynı kararı ayrı bir dille
 * anlatıyordu: *"Kapsamı, tarihi ve oranı indirim ekranında düzenlenir."* Kullanıcının itirazı bu
 * cümleyeydi — *"doğrudan bu indirimle alakalı formun önüme gelmesini istiyorum"* (10.08). İki
 * gösterim dili bakımı da ikiye böler: forma alan eklendiğinde önizleme bilmez ve öneri ekranı
 * sessizce eksik gösterir. Tek gövde, iki kabuk.
 *
 * ── STATE YUKARIDA, GÖVDE DENETİMLİ ─────────────────────────────────────────
 * Gövde kendi durumunu tutmuyor; `values` + `onChange` alıyor. Sebep asistan tarafı: kuyrukta
 * taslağı ÇERÇEVE tutuyor (`assistant-body`), çünkü kararı yürüten, hatayı gösteren ve kuyruğu
 * tazeleyen taraf o. Gövde kendi state'ini saklasaydı asistan kabuğu ona ulaşamaz ve "kaydet"
 * düğmesi gövdenin içine kaçardı.
 *
 * ── KURALLAR GÖVDEYLE BİRLİKTE TAŞINIR ──────────────────────────────────────
 * `discountBlocked` ve `discountInputOf` de burada: engel listesi dialog'da kalsaydı asistan kabuğu
 * kendi engelini yazardı ve bir gün biri "%100 üstü yüzde" kuralını unuturdu. Kaydetmenin son
 * emniyeti yine DB kısıtlarıdır (0031) — form aynı kuralı gösterir ama gerçeğin sahibi tektir.
 */

/**
 * Müşteriye görünen adın uzunluk tavanı. Kural teknik değil YERLEŞİMDEN geliyor: metin sepet ve mail
 * özetinde para satırının etiketi olarak duruyor ("İndirim — …  −3,00 €"). Uzun bir cümle o satırı
 * iki satıra kırar ve kartı okunmaz hâle getirir. Tavan bu yüzden formda, kaydederken değil:
 * operatör yazarken görsün, sonradan kesilmiş bir metinle karşılaşmasın.
 */
const PUBLIC_LABEL_MAX = 40;

const PUBLIC_LABEL_PLACEHOLDER: Record<Locale, string> = {
  tr: 'ör. Hoş geldin indirimi',
  fr: 'ör. Offre de bienvenue',
  de: 'ör. Willkommensrabatt',
};

/** Kod örnekleri de DİLE göre: müşteri kendi dilinde okuyabildiği bir şey yazacak. */
const CODE_PLACEHOLDER: Record<Locale, string> = {
  tr: 'ör. HOSGELDIN',
  fr: 'ör. BIENVENUE',
  de: 'ör. WILLKOMMEN',
};

/**
 * Formun sunucuya gönderdiği hâl — para KURUŞTA (`STACK §8`), tarih ISO. `id` doluysa güncelleme.
 *
 * Tip FORMLA BİRLİKTE duruyor, fiyat ekranının görünüm tipleriyle değil: girdiyi üreten
 * `discountInputOf` burada ve ikisi tek sözleşmenin iki ucu. Ayrı dosyalarda dururlarsa bir gün
 * biri alan ekler, öteki bilmez.
 */
export interface DiscountFormInput {
  id: string | null;
  name: string;
  /** Müşteriye görünen ad, üç dilde. Boş diller aksiyonda ayıklanır; hepsi boşsa alan `null` yazılır. */
  publicLabel: LocalizedText;
  trigger: DiscountTrigger;
  /**
   * Kuponun kodları, DİL BAŞINA bir tane (boş bırakılan dil kod açmaz). Kampanyada hepsi boş.
   * Action bunları `discount_code` satırlarına eşitler — kotayı bölmezler, aynı kuralı açarlar.
   */
  codes: Partial<Record<Locale, string>>;
  type: DiscountType;
  /**
   * Formda tek girdi kutusu var ama gönderilen alan İKİ (02.9): tipine uyan dolu, öteki `null`.
   * Tek alan `valueCents` adıyla yüzde de taşıyordu — adın yalan söylediği hâl.
   */
  percent: number | null;
  amountCents: number | null;
  scope: DiscountScope;
  /** Kapsam hedefi (kategori ya da koleksiyon kimliği); sepet kapsamında `null`. */
  targetId: string | null;
  minBasketCents: number | null;
  firstOrderOnly: boolean;
  validFrom: string | null;
  validTo: string | null;
  customerId: string | null;
  maxUses: number | null;
  perCustomerLimit: number | null;
  isActive: boolean;
}

/**
 * Kapsam kutusunun seçeneği — kategori ya da koleksiyon. Dışarı AÇILMAZ: çağıranlar kendi seçenek
 * tiplerini geçiyor ve yapısal uyum yetiyor; ihraç edilmiş bir ikizi, aynı şeyin ikinci adı olurdu.
 */
interface DiscountScopeOption {
  id: string;
  name: string;
}

/** Bir kupon kapısının kaç kez kullanıldığı — düzenleme formunda etiketin yanında görünür. */
interface DiscountCodeUsage {
  code: string;
  usedCount: number;
}

/** Formun EKRAN birimli hâli: para EURO, tarih takvim günü, sayı sınırları metin. */
export interface DiscountFormValues {
  name: string;
  publicLabel: LocalizedText;
  trigger: DiscountTrigger;
  codes: Partial<Record<Locale, string>>;
  type: DiscountType;
  /** Tek kutu, iki taban: tipe göre yüzde ya da EURO. Gönderilirken ayrışır (`percent`/`amountCents`). */
  value: number | null;
  scope: DiscountScope;
  targetId: string;
  minBasket: number | null;
  firstOrderOnly: boolean;
  validFrom: string;
  validTo: string;
  maxUses: string;
  perCustomerLimit: string;
  isActive: boolean;
}

/**
 * Asistanın DOKUNDUĞU alanlar bu anahtarlarla işaretlenir. Alan adları formun kutularına göre
 * (`value`, `validity`), tablonun kolonlarına göre değil: işareti okuyan operatör kutuya bakıyor.
 */
export type DiscountField =
  | 'trigger'
  | 'name'
  | 'publicLabel'
  | 'code'
  | 'type'
  | 'value'
  | 'scope'
  | 'target'
  | 'minBasket'
  | 'firstOrderOnly'
  | 'limits'
  | 'validity';

/** Boş form — yeni kural. */
export function emptyDiscountValues(): DiscountFormValues {
  return {
    name: '',
    publicLabel: {},
    trigger: 'coupon',
    codes: {},
    type: 'percent',
    value: null,
    scope: 'cart',
    targetId: '',
    minBasket: null,
    firstOrderOnly: false,
    validFrom: '',
    validTo: '',
    maxUses: '',
    perCustomerLimit: '',
    isActive: true,
  };
}

/**
 * Kayıttaki bir kuralı forma açar.
 *
 * Girdi **satırın kendisi değil, alanlarının şekli**: fiyat ekranının `DiscountRow` görünüm tipini
 * import etseydik ortak komponent bir sayfaya bağımlı olurdu (`STACK §7`, ters yön). Şeklin kendisi
 * yeterli — bu fonksiyonun bildiği tek şey formun neye ihtiyacı olduğu.
 */
export function discountValuesOf(row: {
  name: string;
  publicLabel: LocalizedText | null;
  trigger: DiscountTrigger;
  codes: Array<{ code: string; locale: Locale | null }>;
  type: DiscountType;
  percent: number | null;
  amountCents: number | null;
  scope: DiscountScope;
  categoryId: string | null;
  collectionId: string | null;
  minBasketCents: number | null;
  firstOrderOnly: boolean;
  validFrom: string | null;
  validTo: string | null;
  maxUses: number | null;
  perCustomerLimit: number | null;
  isActive: boolean;
}): DiscountFormValues {
  return {
    name: row.name,
    publicLabel: row.publicLabel ?? {},
    trigger: row.trigger,
    codes: codeMapOf(row.codes),
    type: row.type,
    value: row.type === 'fixed' ? fromCents(row.amountCents ?? 0) : row.percent,
    scope: row.scope,
    // Hedef kimliği satırda kapsamına göre iki ayrı kolonda durur; form tek kutu tanır.
    targetId: (row.scope === 'category' ? row.categoryId : row.collectionId) ?? '',
    minBasket: row.minBasketCents == null ? null : fromCents(row.minBasketCents),
    firstOrderOnly: row.firstOrderOnly,
    validFrom: toDayValue(row.validFrom),
    validTo: toDayValue(row.validTo),
    maxUses: row.maxUses?.toString() ?? '',
    perCustomerLimit: row.perCustomerLimit?.toString() ?? '',
    isActive: row.isActive,
  };
}

/**
 * Asistanın dilekçesini forma açar — ve hangi kutulara dokunduğunu söyler.
 *
 * **Dilekçede olmayan alan boş kalır, uydurulmaz.** Bir tur burada dört kutu zorunlu olarak boştu —
 * müşteriye görünen ad, "yalnız ilk sipariş" ve iki kullanım tavanı asistanın ŞEMASINDA yoktu.
 * Kullanıcı formu görünce doğru soruyu sordu: *"bunlardan asistanın haberi var mıydı?"* Yoktu; boş
 * kutu "asistan atladı" gibi okunuyordu, oysa gerçek "asistana sorulmadı"ydı. Şema o gün genişletildi
 * (`DiscountDraftPayloadSchema`) — artık boş bir kutu gerçekten asistanın tercihidir ve işaretin
 * yokluğu bilgi taşır.
 *
 * **`isActive` AÇIK doğar ve bu bilinçli bir devir.** Tip bir tur `draft_then_edit`ti: kampanya pasif
 * yaratılır, operatör fiyat ekranında açardı. O emniyet operatörün formu GÖRMEDİĞİ dünyanındı; artık
 * form önünde ve anahtar da önünde. Pasif doğurmak, formu okuyan operatöre "neden yayında değil"
 * sorusunu sordururdu. Kapatmak tek tık.
 */
export function discountValuesFromProposal(payload: DiscountDraftPayload): {
  values: DiscountFormValues;
  filled: ReadonlySet<DiscountField>;
} {
  const filled = new Set<DiscountField>(['trigger', 'name', 'type', 'value', 'scope']);
  if (payload.publicLabel) filled.add('publicLabel');
  if (payload.code) filled.add('code');
  if (payload.scope !== 'cart') filled.add('target');
  if (payload.minBasketCents !== null) filled.add('minBasket');
  if (payload.firstOrderOnly) filled.add('firstOrderOnly');
  if (payload.maxUses != null || payload.perCustomerLimit != null) filled.add('limits');
  if (payload.validFrom || payload.validTo) filled.add('validity');

  return {
    values: {
      ...emptyDiscountValues(),
      name: payload.name,
      publicLabel: payload.publicLabel ?? {},
      firstOrderOnly: payload.firstOrderOnly ?? false,
      maxUses: payload.maxUses?.toString() ?? '',
      perCustomerLimit: payload.perCustomerLimit?.toString() ?? '',
      trigger: payload.trigger,
      // Dilekçedeki kod DİLSİZDİR (tek dize). Formun üç kutusu var ve kod bir yerde görünmek
      // zorunda — dili olmayan kod TR kutusuna düşer, kayıttan okunan kodlarla aynı kural.
      codes: payload.code ? { tr: payload.code } : {},
      type: payload.type,
      value: payload.type === 'fixed' ? (payload.amountCents === null ? null : fromCents(payload.amountCents)) : payload.percent,
      scope: payload.scope,
      targetId: (payload.scope === 'category' ? payload.categoryId : payload.collectionId) ?? '',
      minBasket: payload.minBasketCents === null ? null : fromCents(payload.minBasketCents),
      validFrom: toDayValue(payload.validFrom),
      validTo: toDayValue(payload.validTo),
    },
    filled,
  };
}

/** Kaydetmenin engeli ve SEBEBİ; `null` ise yol açık. Düğme etkin görünüp hiçbir şey yapmasın. */
export function discountBlocked(v: DiscountFormValues): string | null {
  const codeCount = LOCALES.filter((l) => (v.codes[l] ?? '').trim()).length;
  if (!v.name.trim()) return 'Ad girilmeli';
  if (v.trigger === 'coupon' && codeCount === 0) return 'En az bir dilde kupon kodu girilmeli';
  if (v.value === null || v.value <= 0) return 'İndirim değeri girilmeli';
  // Tavan DB kısıtında da var (%100 üstü yüzde yasak) ama oradan dönen mesaj ham Postgres metnidir.
  // Kural ekranda da söylenir — operatör kısıt ihlali okumaz.
  if (v.type === 'percent' && v.value > 100) return 'Yüzde 100ün üstünde olamaz';
  if (v.maxUses !== '' && Number(v.maxUses) === 0) return 'Kullanım tavanı 0 olamaz — kupon hiç kullanılamaz';
  if (v.perCustomerLimit !== '' && Number(v.perCustomerLimit) === 0)
    return 'Müşteri başı sınır 0 olamaz — kupon hiç kullanılamaz';
  if (v.scope !== 'cart' && !v.targetId) return 'Kapsam hedefi seçilmeli';
  return null;
}

/** Ekran birimlerini kaydetme kapısının beklediği hâle çevirir (para KURUŞ, tarih ISO). */
export function discountInputOf(v: DiscountFormValues, id: string | null): DiscountFormInput {
  return {
    id,
    name: v.name,
    publicLabel: v.publicLabel,
    trigger: v.trigger,
    codes: v.codes,
    type: v.type,
    percent: v.type === 'percent' ? v.value : null,
    amountCents: v.type === 'fixed' && v.value !== null ? toCents(v.value) : null,
    scope: v.scope,
    targetId: v.scope === 'cart' ? null : v.targetId || null,
    minBasketCents: v.minBasket === null ? null : toCents(v.minBasket),
    firstOrderOnly: v.firstOrderOnly,
    validFrom: v.validFrom ? new Date(v.validFrom).toISOString() : null,
    // Bitiş GÜNÜN SONU: "31 Tem'e kadar" yazan operatör 31 Temmuz akşamını kasteder, sabahını değil.
    validTo: v.validTo ? new Date(`${v.validTo}T23:59:59`).toISOString() : null,
    // Kişisel kupon bu formdan AÇILMAZ: sahibi puan kullanımıdır (modül 16). Elle açılması
    // gerektiğinde müşteri ekranından bağlanacak — burada sessizce `null`.
    customerId: null,
    maxUses: v.maxUses.trim() ? Number(v.maxUses) : null,
    perCustomerLimit: v.perCustomerLimit.trim() ? Number(v.perCustomerLimit) : null,
    isActive: v.isActive,
  };
}

interface DiscountFormBodyProps {
  values: DiscountFormValues;
  onChange: (next: DiscountFormValues) => void;
  categories: DiscountScopeOption[];
  collections: DiscountScopeOption[];
  /** Düzenlenen kuralın kod kullanımları — yalnız etikette "kaç kez kullanıldı" yazmak için. */
  codeUsage?: DiscountCodeUsage[];
  /** Asistanın doldurduğu kutular; her birinin etiketinde küçük bir işaret çıkar. */
  filled?: ReadonlySet<DiscountField>;
  /** Karar verilmiş öneri / kaydetme sürerken: alanlar gerçekten devre dışı (`fieldset`). */
  disabled?: boolean;
}

export function DiscountFormBody({
  values,
  onChange,
  categories,
  collections,
  codeUsage,
  filled,
  disabled = false,
}: DiscountFormBodyProps) {
  const set = <K extends keyof DiscountFormValues>(key: K, next: DiscountFormValues[K]) =>
    onChange({ ...values, [key]: next });

  const targets = values.scope === 'category' ? categories : values.scope === 'collection' ? collections : [];

  /**
   * O dildeki kapının kaç kez kullanıldığı — kotanın kırılımı, kendisi değil.
   *
   * Kod DEĞİŞTİRİLİRSE sayı düşer ve bu doğru: yeni kod yeni bir kapıdır, eskisinin geçmişini
   * devralmaz. Etiketin sayı göstermesi kararı besliyor — hiç kullanılmamış bir kodu değiştirmek
   * bedelsizdir, yüz kez kullanılmış olanı değiştirmek dolaşımdaki kodu kapatır.
   */
  const usedCountOf = (lang: Locale): number => {
    const typed = (values.codes[lang] ?? '').trim().toUpperCase();
    if (!typed) return 0;
    return codeUsage?.find((c) => c.code.toUpperCase() === typed)?.usedCount ?? 0;
  };

  /** Etiketin sağ ucu: asistan o kutuyu doldurduysa işaret, yoksa kutunun kendi açıklaması. */
  const aside = (field: DiscountField, base?: ReactNode): ReactNode =>
    filled?.has(field) ? (
      <span className="flex items-center gap-1.5">
        <FilledMark />
        {base}
      </span>
    ) : (
      base
    );

  return (
    // `fieldset` HTML'in kendi devre dışı bırakma mekanizması: içindeki her kutu gerçekten kapanır.
    // Elle her kontrole `disabled` geçirmek, bir gün eklenen kutuda unutulurdu.
    <fieldset disabled={disabled} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
      <FieldShell label="Tetik" labelAside={aside('trigger')}>
        <MultiToggle
          value={values.trigger}
          onChange={(next) => set('trigger', next)}
          label="Tetik"
          options={[
            { key: 'coupon', label: 'Kupon (kodlu)' },
            { key: 'automatic', label: 'Otomatik kampanya' },
          ]}
        />
      </FieldShell>

      <FieldShell label="Ad" labelAside={aside('name', 'Yalnız sizin listeniz için — müşteri görmez')}>
        <Input value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="ör. Bayram indirimi" />
      </FieldShell>

      {/* MÜŞTERİ METNİ TEK KARTTA, dil kartın SEKMESİNDEN gelir (ürün formunun deseni). İki alan da
          aynı dile bağlı: Fransız müşteri "Offre de bienvenue" adını görür ve "BIENVENUE" kodunu
          yazar. Ayrı kutulara bölünseydi hangi kodun hangi adla gittiği ekranda hiç görünmezdi.

          Kart, tek alanlı bir değer için kurulmazdı — burada iki alan var ve ikisi tek dil bağlamını
          paylaşıyor, kartın var olma sebebi tam bu.

          KOD DİLE BAĞLIDIR ve bu keyfi değil: "HOSGELDIN" Türk müşteriye bir şey anlatır, Fransız'a
          hiçbir şey. Üç kod TEK kuponun kapılarıdır — koşulları, değeri ve **kullanım tavanı ortaktır**.
          Ayrı kupon açmak "toplam 100 kullanım" sınırını sessizce 300 yapardı. */}
      <LocaleCard title="Müşteriye görünen" completenessOf={values.publicLabel}>
        {(lang) => (
          <>
            {/* Çeviri alan türü `ad`: indirim etiketi sepette tek satır ve kısa. Açıklama tonunda
                çevrilse "Hoş geldin indirimi" bir cümleye dönüşür ve satıra sığmaz. */}
            <LocalizedTextField
              value={values.publicLabel}
              onChange={(next) => set('publicLabel', next)}
              lang={lang}
              label="Ad"
              placeholder={(l) => `${PUBLIC_LABEL_PLACEHOLDER[l]}…`}
              maxLength={PUBLIC_LABEL_MAX}
              field="ad"
              hint="Sepette ve mailde indirim satırının yanına yazılır (“İndirim — Hoş geldin indirimi”) — kısa tutun. Boş bırakılırsa müşteri yalnız “İndirim” görür."
            />

            {values.trigger === 'coupon' ? (
              <FieldShell
                label="Kupon kodu"
                labelAside={aside('code', usedCountOf(lang) > 0 ? `${usedCountOf(lang)} kez kullanıldı` : 'boş = bu dilde kod yok')}
              >
                {/* Kod HER ZAMAN büyük harfe çevrilir: müşteri "bayram10" yazsa da aynı kupon bulunur
                    (arama harf ayrımsız), ama listede tek bir yazım görünsün. */}
                <Input
                  value={values.codes[lang] ?? ''}
                  mono
                  onChange={(e) => set('codes', { ...values.codes, [lang]: e.target.value.toUpperCase() })}
                  placeholder={CODE_PLACEHOLDER[lang]}
                />
                <span className="font-ops-body text-ops-micro leading-[1.6] text-ops-faint">
                  Bu dildeki kapı. Hepsi AYNI kuponu açar ve aynı kullanım tavanını paylaşır — kaç kez
                  hangi kodla girildiği ayrı sayılır.
                </span>
              </FieldShell>
            ) : null}
          </>
        )}
      </LocaleCard>

      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="İndirim tipi" labelAside={aside('type')}>
          <MultiToggle
            value={values.type}
            onChange={(next) => set('type', next)}
            label="İndirim tipi"
            options={[
              { key: 'percent', label: 'Yüzde' },
              { key: 'fixed', label: 'Sabit tutar' },
            ]}
          />
        </FieldShell>
        {values.type === 'percent' ? (
          <PercentField
            label="Değer (%)"
            labelAside={aside('value', 'zorunlu')}
            id="discount-value"
            value={values.value}
            onChange={(next) => set('value', next)}
            placeholder="ör. 10"
          />
        ) : (
          <MoneyField
            label="Değer (€)"
            required
            labelAside={aside('value')}
            id="discount-value"
            value={values.value}
            onChange={(next) => set('value', next)}
            placeholder="ör. 5,00"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Kapsam" labelAside={aside('scope', 'Kupon daima sepet kapsamındadır')}>
          <Select
            value={values.scope}
            onChange={(next) => onChange({ ...values, scope: next as DiscountScope, targetId: '' })}
            options={[
              { value: 'cart', label: 'Sepet (tümü)' },
              { value: 'category', label: 'Kategori' },
              { value: 'collection', label: 'Koleksiyon' },
            ]}
          />
        </FieldShell>
        {values.scope !== 'cart' ? (
          <FieldShell label={values.scope === 'category' ? 'Kategori' : 'Koleksiyon'} labelAside={aside('target')}>
            <Select
              value={values.targetId}
              onChange={(next) => set('targetId', next)}
              placeholder="Seç"
              options={targets.map((t) => ({ value: t.id, label: t.name }))}
            />
          </FieldShell>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label="Asgari sepet (€)"
          labelAside={aside('minBasket', 'boş = koşul yok')}
          id="discount-min-basket"
          value={values.minBasket}
          onChange={(next) => set('minBasket', next)}
          placeholder="ör. 50,00"
        />
        <FieldShell label="Yalnız ilk sipariş" labelAside={aside('firstOrderOnly')}>
          <div className="flex items-center gap-2.5 rounded-ops-card border border-ops-line px-3 py-2">
            <Toggle
              on={values.firstOrderOnly}
              onChange={(next) => set('firstOrderOnly', next)}
              label="Yalnız ilk sipariş"
            />
            <span className="font-ops-body text-ops-xs text-ops-muted">
              {values.firstOrderOnly ? 'Yalnız ilk siparişte geçerli' : 'Her siparişte geçerli'}
            </span>
          </div>
        </FieldShell>
      </div>

      {/* Geçerlilik TEK alan: başlangıç ve bitiş ayrı kutularda dururken ikisi arasındaki ilişki
          (ters aralık) ancak kaydederken görülüyordu. Aralık seçicide ters seçim zaten kurulamaz. */}
      <DateRangeField
        label="Geçerlilik"
        labelAside={aside('validity', 'boş = hemen başlar, süresiz')}
        from={values.validFrom}
        to={values.validTo}
        onChange={(nextFrom, nextTo) => onChange({ ...values, validFrom: nextFrom, validTo: nextTo })}
        placeholder="Süresiz"
      />

      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Toplam kullanım sınırı" labelAside={aside('limits', 'boş = sınırsız')}>
          <Input
            value={values.maxUses}
            mono
            inputMode="numeric"
            onChange={(e) => set('maxUses', digits(e.target.value))}
            placeholder="ör. 100"
          />
        </FieldShell>
        <FieldShell label="Müşteri başına sınır" labelAside={aside('limits', 'boş = sınırsız')}>
          <Input
            value={values.perCustomerLimit}
            mono
            inputMode="numeric"
            onChange={(e) => set('perCustomerLimit', digits(e.target.value))}
            placeholder="ör. 1"
          />
        </FieldShell>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-ops-card border border-ops-line px-3.5 py-2.5">
        <div className="flex flex-col gap-px">
          <span className="font-ops-body text-ops-sm font-medium text-ops-ink">Aktif</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            Kapalı kural hiç uygulanmaz ama listede kalır — geçmişi silinmez
          </span>
        </div>
        <Toggle on={values.isActive} onChange={(next) => set('isActive', next)} label="Aktif" />
      </div>

      <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Tek-en-büyük kuralı: birden çok indirim uygun olsa bile müşteriye yalnız en büyüğü uygulanır — müşterinin
        genel indirim oranı da aynı havuzda yarışır. Paketlere ve yaklaşan tarihli teklife hiçbir genel indirim
        binmez; o kalemler kendi özel fiyatındadır.
      </span>
    </fieldset>
  );
}

/**
 * "Bu kutuyu asistan doldurdu" işareti — nokta + tek kelime.
 *
 * Ayrı bir "değişiklikler" listesi YAZILMAZ (talep §3.4): operatör zaten bildiği forma bakıyor, farkı
 * gözünün alışkın olduğu yerde görmeli. İşaret etiketin ucunda durur, kutunun içinde değil — değeri
 * okumayı engellemez ve kutu düzenlenince de yerinde kalır (asistanın nereye dokunduğu, operatörün
 * sonra ne yazdığından bağımsız bir olgudur).
 */
function FilledMark() {
  return (
    <span className="flex items-center gap-1 font-ops-body text-ops-micro font-semibold text-ops-violet">
      <span aria-hidden className="size-1.5 rounded-full bg-ops-violet" />
      asistan
    </span>
  );
}

/**
 * Kayıttaki kod satırlarını formun dil kutularına dağıtır.
 *
 * **Dili olmayan kod TR kutusuna düşer** (`locale = null` — matbu bir kart üstündeki tek kod gibi):
 * formun üç kutusu var ve kod bir yerde görünmek zorunda; görünmezse operatör onu silmediği hâlde
 * kaydetme sırasında kaybederdi. Aynı dilde ikinci bir kod varsa yalnız ilki forma gelir — form dil
 * başına bir kapı kuruyor, tablo bunu şart koşmuyor.
 */
function codeMapOf(codes: Array<{ code: string; locale: Locale | null }>): Partial<Record<Locale, string>> {
  const map: Partial<Record<Locale, string>> = {};
  for (const row of codes) {
    const lang = row.locale ?? 'tr';
    map[lang] ??= row.code;
  }
  return map;
}

/**
 * DB'deki ISO damgadan takvim GÜNÜNÜ alır. Ayrıştırma tek yerde (`calendar-math`): burada ikinci
 * bir dönüşüm yazmak, kaydedilen gün ile gösterilen günü ayrı dilimlerde farklı gösterebilirdi.
 */
function toDayValue(iso: string | null): string {
  const date = parseDay(iso);
  return date ? toDay(date) : '';
}

/** Sayı alanına yalnız rakam: "3 adet" gibi bir metin sessizce NaN'a dönerdi. */
function digits(raw: string): string {
  return raw.replace(/\D/g, '');
}
