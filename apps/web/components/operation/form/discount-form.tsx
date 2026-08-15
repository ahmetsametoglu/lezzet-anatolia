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
import { ToggleField } from './toggle';

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

/**
 * Kod örnekleri de DİLE göre: müşteri kendi dilinde okuyabildiği bir şey yazacak.
 * "ör." öneki YOK: üç kutu tek satırda duruyor (dar hücre) ve mono + soluk placeholder zaten
 * örnek olduğunu söylüyor — önek en uzun örneği hücreden taşırıyordu.
 */
const CODE_PLACEHOLDER: Record<Locale, string> = {
  tr: 'HOSGELDIN',
  fr: 'BIENVENUE',
  de: 'WILLKOMMEN',
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
  /**
   * Yerleşim KABUĞUN kararı (15.08, kullanıcı bildirimi: tek sütun "çok karışık ve kötü yerleşim").
   * Diyalog geniş pencerede İKİ sütun ister (solda Tanım, sağda İndirim + Koşullar); asistan
   * kuyruğu kendi çerçevesinde tek sütunda kalır. Alanların kendisi ve sırası iki yerleşimde de
   * AYNI — ayrışan yalnız dizilim; bölümler her iki hâlde de başlıklarıyla kategorili.
   */
  columns?: 1 | 2;
  /**
   * Aktif anahtarı gövdede mi çizilsin? Diyalog `false` verir ve anahtarı KENDİ footer'ına taşır
   * (15.08, kullanıcı kararı — footer'lı aktiflik deseni): kayıt düğmesinin yanında durur, formun
   * gövdesi yalnız kuralın içeriğini taşır. Asistan kuyruğunda footer yok — gövdede kalır.
   */
  showActiveToggle?: boolean;
  /**
   * Tetik anahtarı gövdede mi çizilsin? Diyalog `false` verir ve anahtarı BAŞLIK barına taşır
   * (15.08, kullanıcı kararı): kupon/kampanya seçimi formun bir alanı değil, formun KİMLİĞİDİR —
   * başlıkla aynı satırda durur. Asistan kuyruğunda başlık yuvası yok — gövdede kalır.
   */
  showTriggerToggle?: boolean;
}

export function DiscountFormBody({
  values,
  onChange,
  categories,
  collections,
  codeUsage,
  filled,
  disabled = false,
  columns = 1,
  showActiveToggle = true,
  showTriggerToggle = true,
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

  // Bölüm gövdeleri DEĞİŞKENDE: iki yerleşim (tek/çift sütun) aynı JSX'i dizer — alanları yerleşim
  // başına ikinci kez yazmak, bir gün yalnız birinde güncellenen bir kutu demekti (no-duplication).
  const tanimSection = (
    <>
      <SectionCard title="Tanım">
        {showTriggerToggle ? (
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
        ) : null}

        <FieldShell label="Ad" labelAside={aside('name', 'Yalnız sizin listeniz için — müşteri görmez')}>
          <Input value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="ör. Bayram indirimi" />
        </FieldShell>

        {/* KOD TANIM'DA, üç dil TEK SATIRDA (15.08 ikinci tur, kullanıcı kararı): kod da kuralın
            kimliği — operatör önce "hangi kod" der, sonra çevirilere geçer. Dil sekmesinin arkasında
            dururken kaç dilde kod açıldığı görünmüyordu; üç kutu yan yana o soruyu tek bakışta yanıtlar.
            KOD YİNE DİLE BAĞLI: "HOSGELDIN" Türk müşteriye bir şey anlatır, Fransız'a hiçbir şey.
            Üç kod TEK kuponun kapılarıdır — koşulları, değeri ve **kullanım tavanı ortaktır**;
            ayrı kupon açmak "toplam 100 kullanım" sınırını sessizce 300 yapardı. */}
        {values.trigger === 'coupon' ? (
          <FieldShell label="Kupon kodu" labelAside={aside('code', 'dil başına bir kapı — boş dil kod açmaz')}>
            <div className="grid grid-cols-3 gap-3">
              {LOCALES.map((lang) => (
                <div key={lang} className="flex min-w-0 flex-col gap-1">
                  {/* Kullanım sayısı etikette: hiç kullanılmamış kodu değiştirmek bedelsizdir,
                      yüz kez kullanılmışı değiştirmek dolaşımdaki kodu kapatır — karar buradan besleniyor. */}
                  <span className="font-ops-body text-ops-micro uppercase tracking-[0.08em] text-ops-faint">
                    {lang}
                    {usedCountOf(lang) > 0 ? ` · ${usedCountOf(lang)} kez` : ''}
                  </span>
                  {/* Kod HER ZAMAN büyük harfe çevrilir: müşteri "bayram10" yazsa da aynı kupon bulunur
                      (arama harf ayrımsız), ama listede tek bir yazım görünsün. */}
                  <Input
                    value={values.codes[lang] ?? ''}
                    mono
                    onChange={(e) => set('codes', { ...values.codes, [lang]: e.target.value.toUpperCase() })}
                    placeholder={CODE_PLACEHOLDER[lang]}
                  />
                </div>
              ))}
            </div>
            <span className="font-ops-body text-ops-micro leading-[1.6] text-ops-faint">
              Hepsi AYNI kuponu açar ve aynı kullanım tavanını paylaşır — kaç kez hangi kodla girildiği
              ayrı sayılır.
            </span>
          </FieldShell>
        ) : null}
      </SectionCard>

      {/* Müşteri metni dil sekmeli kartta (ürün formunun deseni). Kod bir tur bu kartın içindeydi
          (ad ile aynı dile bağlı diye); 15.08 ikinci turda kullanıcı kararıyla Tanım'a taşındı —
          dil eşleşmesini artık kod kutularının kendi dil etiketleri söylüyor. */}
      <LocaleCard title="Müşteriye görünen" completenessOf={values.publicLabel}>
        {(lang) => (
          /* Çeviri alan türü `ad`: indirim etiketi sepette tek satır ve kısa. Açıklama tonunda
             çevrilse "Hoş geldin indirimi" bir cümleye dönüşür ve satıra sığmaz. */
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
        )}
      </LocaleCard>
    </>
  );

  // Kapsam ile tip AYNI SATIRDA (15.08 ikinci tur, kullanıcı kararı: ikisi de yarım sütunluk kısa
  // kutular, alt alta boşa yer yiyorlardı); değer altlarında tam genişlikte kalır (önceki tur kararı).
  const indirimSection = (
    <SectionCard title="İndirim">
      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Kapsam" labelAside={aside('scope')}>
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
      </div>
      {/* Hedef seçici kapsam daraldığında TAM genişlikte açılır: kategori/koleksiyon adları uzun,
          yarım hücrede kırpılıyordu. */}
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
    </SectionCard>
  );

  const kosulSection = (
    <SectionCard title="Koşullar & sınırlar">
      {/* Asgari sepet ile geçerlilik AYNI SATIRDA (15.08 ikinci tur, kullanıcı kararı) — ikisi de
          kısa kutular. Kenar notları yarım hücreye göre kısaldı; "hemen başlar" bilgisini
          placeholder ("Süresiz") zaten taşıyor. */}
      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label="Asgari sepet (€)"
          labelAside={aside('minBasket', 'boş = yok')}
          id="discount-min-basket"
          value={values.minBasket}
          onChange={(next) => set('minBasket', next)}
          placeholder="ör. 50,00"
        />
        {/* Geçerlilik TEK alan: başlangıç ve bitiş ayrı kutularda dururken ikisi arasındaki ilişki
            (ters aralık) ancak kaydederken görülüyordu. Aralık seçicide ters seçim zaten kurulamaz. */}
        <DateRangeField
          label="Geçerlilik"
          labelAside={aside('validity', 'boş = süresiz')}
          from={values.validFrom}
          to={values.validTo}
          onChange={(nextFrom, nextTo) => onChange({ ...values, validFrom: nextFrom, validTo: nextTo })}
          placeholder="Süresiz"
        />
      </div>
      {/* Kitin kartlı anahtarı (`ToggleField`) — elle kutu yazılmaz (kullanıcı düzeltmesi 15.08);
          etiket anahtarın HÂLİNİ söyler, karar FieldShell başlığında. */}
      <FieldShell label="Yalnız ilk sipariş" labelAside={aside('firstOrderOnly')}>
        <ToggleField
          label={values.firstOrderOnly ? 'Yalnız ilk siparişte' : 'Her siparişte geçerli'}
          on={values.firstOrderOnly}
          onChange={(next) => set('firstOrderOnly', next)}
        />
      </FieldShell>

      {/* Kenar notu tek kutuya sığmıyordu ("boş = sınırsız" ikiye kırılıyordu) — iki kutunun ortak
          kuralı tek ipucu satırına indi (aşağıda); işaret (`aside`) etikette kaldı. */}
      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Toplam kullanım" labelAside={aside('limits')}>
          <Input
            value={values.maxUses}
            mono
            inputMode="numeric"
            onChange={(e) => set('maxUses', digits(e.target.value))}
            placeholder="ör. 100"
          />
        </FieldShell>
        <FieldShell label="Müşteri başına" labelAside={aside('limits')}>
          <Input
            value={values.perCustomerLimit}
            mono
            inputMode="numeric"
            onChange={(e) => set('perCustomerLimit', digits(e.target.value))}
            placeholder="ör. 1"
          />
        </FieldShell>
      </div>
      <span className="font-ops-body text-ops-micro leading-[1.6] text-ops-faint">
        Boş bırakılan sınır: sınırsız.
      </span>
    </SectionCard>
  );

  // Aktif anahtarı yalnız footer'sız kabukta (asistan) gövdede durur — diyalog kendi footer'ında çizer.
  const activeBox = showActiveToggle ? (
    <FieldShell label="Aktif" labelAside="kapalı kural uygulanmaz, listede kalır — geçmişi silinmez">
      <ToggleField
        label={values.isActive ? 'Aktif' : 'Kapalı'}
        on={values.isActive}
        onChange={(next) => set('isActive', next)}
      />
    </FieldShell>
  ) : null;

  const ruleNote = (
    <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
      Tek-en-büyük kuralı: birden çok indirim uygun olsa bile müşteriye yalnız en büyüğü uygulanır — müşterinin
      genel indirim oranı da aynı havuzda yarışır. Paketlere ve yaklaşan tarihli teklife hiçbir genel indirim
      binmez; o kalemler kendi özel fiyatındadır.
    </span>
  );

  return (
    // `fieldset` HTML'in kendi devre dışı bırakma mekanizması: içindeki her kutu gerçekten kapanır.
    // Elle her kontrole `disabled` geçirmek, bir gün eklenen kutuda unutulurdu.
    <fieldset disabled={disabled} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
      {columns === 2 ? (
        // İki sütun (diyalog): solda kimlik — kim, hangi adla, hangi kapıdan; sağda kural — ne kadar,
        // neye, hangi koşulla. Sütunlar `items-start`: sol kart uzayınca sağ sütun gerilmez.
        <div className="grid grid-cols-2 items-start gap-x-6 gap-y-5">
          <div className="flex min-w-0 flex-col gap-5">{tanimSection}</div>
          <div className="flex min-w-0 flex-col gap-5">
            {indirimSection}
            {kosulSection}
            {activeBox}
          </div>
        </div>
      ) : (
        <>
          {tanimSection}
          {indirimSection}
          {kosulSection}
          {activeBox}
        </>
      )}
      {ruleNote}
    </fieldset>
  );
}

/**
 * Bölüm kartı — `LocaleCard` ile AYNI görsel aile (başlık şeridi + gövde): form kategorileri artık
 * çizgiyle değil KARTLA ayrılıyor (15.08, kullanıcı bildirimi: beyaz diyalog zemininde `line-soft`
 * ayraç görünmüyordu; kart çerçevesi + zeminli başlık şeridi her temada okunur).
 */
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 shrink-0 flex-col overflow-hidden rounded-ops-card border border-ops-line">
      <div className="border-b border-ops-line-soft bg-ops-subtle px-3.5 py-2">
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">
          {title}
        </span>
      </div>
      <div className="flex flex-col gap-4 p-3.5">{children}</div>
    </div>
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
