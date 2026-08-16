'use client';

import type { ReactNode } from 'react';
import type { Control, UseFormWatch } from 'react-hook-form';
import { ALLERGEN_LABELS, ProductAllergenEnum, resolveLocalizedText } from '@lezzet/types';
import { type Locale } from '@lezzet/i18n';
import { UnderlineTabs } from '@/components/operation/ui/underline-tabs';
import { LocaleCard } from '@/components/operation/form/locale-card';
import { FormNumber } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { FormMultiToggle } from '@/components/operation/form/form-multi-toggle';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { FormMultiSelect } from '@/components/operation/form/form-multi-select';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { FormNutrition } from '@/components/operation/form/form-nutrition';
import { VariantEditor } from './variant-editor';
import { ProductFormDeclaration } from './declaration';
import { ProductFormDesktop } from './layout.desktop';
import type { ProductFormValues } from './schema';
import type { ProductFormFields, ProductFormTab } from './types';

/**
 * ÜRÜN FORMUNUN GÖVDESİ — İKİ yüzeyin ortak komponenti (ürün ekranı · asistan kuyruğu, 22.14).
 *
 * ── NEDEN DİYALOGDAN ÇIKARILDI ──────────────────────────────────────────────
 * Kuyruğun ürün önerisi için bir tur AYRI bir form yazılmıştı: alan alan seçim, kendi kutuları,
 * kendi düzeni. Kullanıcının tespiti kısaydı — *"bizim ürün formumuz bu değil ki."* Doğruydu ve
 * duplication'ın ta kendisiydi (`CLAUDE §1`): aynı ürün iki ekranda iki farklı formla düzenlenirse,
 * bir gün biri KDV seçeneğini, öteki alerjen vurgusunu ya da varyant etiketinin zorunluluğunu
 * kaybeder. Aynı devir indirim formunda zaten yaşanmıştı (`DiscountFormBody`, 22.10) — desen o.
 *
 * ── KAPTA NE KALIR, BURAYA NE GELİR ─────────────────────────────────────────
 * Burası yalnız ALANLARI kurar ve yerleştirir. Dışarıda kalanlar: RHF örneği, kaydeden eylem,
 * `Dialog` kabuğu, alt bar (durum seçici, paket uyarısı). İkisi de kendi kabuğunu kurar çünkü
 * kararları farklı: ürün ekranı "ürünü kaydet" der, kuyruk "öneriyi uygula" der ve kuyruk satırını
 * da kapatır.
 *
 * ── GALERİ SLOT, ALAN DEĞİL — AMA İKİ YÜZEYDE DE VAR ────────────────────────
 * Fotoğraf bloğu (`ProductPhotos`) CANLI yazar — yükleme, sıralama, kapak seçimi anında kaydedilir
 * ve formun "kaydet"ine bağlı değildir. Bu yüzden alan olarak değil SLOT olarak geliyor: kabı
 * kuran taraf onu kendi verileriyle (ürün kimliği, kapak adresi, yükleme kapısı) örüyor.
 *
 * Bir tur kuyruk bu slotu `null` veriyordu — "onay beklemeyen bir yazma yolu kuyruğun vaadini
 * deler" diye. Kullanıcı ekranda gördü ve kaldırttı (11.08): *"eğer ben sistemde bir form
 * kullanıyorsam o formu mümkünse bire bir kopyala. Code duplication olmasın, ama görüntüde bazı
 * şeyleri kırpma."* Vaat de zarar görmüyor: galeri ÖNERİYİ uygulamıyor, ürünün fotoğraflarını
 * yönetiyor — operatörün kendi elinin işi. Kuyruğun onaya bağladığı şey asistanın DİLEKÇESİ.
 */

interface ProductFormFieldsOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<ProductFormValues, any, any>;
  watch: UseFormWatch<ProductFormValues>;
  /** Kategori seçenekleri — adı ÇÖZÜLMÜŞ gelir; hangi dilde okunacağı kabın kararı. */
  categories: Array<{ id: string; name: string }>;
  // `onAiTranslate` KALKTI (12.08): çeviri düğmesi çok dilli alanın kendi yeteneği; buradan dört
  // alana + varyant editörüne dağıtılan zincir, düğmeyi "yazmayı unutulabilir" bir şey yapıyordu
  // (`localized-text-field` künyesi).
  /** Kapak + galeri bloğu — canlı yazdığı için SLOT (yukarıdaki künye). Kuyrukta `null`. */
  photosSlot?: ReactNode;
  /**
   * ASİSTANIN DOKUNDUĞU alanlar — kutunun başlığında işaretlenir (22.14).
   *
   * Kuyruğun içinde form ürünün BUGÜNKÜ hâliyle açılıyor ve asistanın önerisi üzerine yazılmış
   * geliyor. İşaret olmasa operatör hangi kutunun kendi kaydı, hangisinin öneri olduğunu
   * ayıramazdı — formun tamamı "zaten böyleydi" gibi okunurdu. `DiscountFormBody`nin `filled`
   * prop'uyla aynı gerekçe ve aynı ad.
   */
  filled?: ReadonlySet<keyof ProductFormValues>;
}

/**
 * Formun ALANLARINI kurar — çizmez, yerleştirmez.
 *
 * Hook, çünkü dönen şey bir görünüm değil bir SÖZLÜK (`ProductFormFields`): yerleşimi kabın seçtiği
 * düzen yapar (`ProductFormPanels`). Sekme durumu da burada TUTULMAZ — barı nereye koyacağına kap
 * karar veriyor (ürün diyaloğunda `Dialog` başlığı, kuyrukta panelin kendi satırı), o yüzden durumu
 * da kap tutar.
 */
export function useProductFormFields({
  control,
  watch,
  categories,
  photosSlot,
  filled,
}: ProductFormFieldsOptions): ProductFormFields {
  // Alerjen listesi İKİ alanda birden kullanılır (içerdikleri + çapraz bulaşma) → tek yerde kurulur.
  const allergenOptions = ProductAllergenEnum.options.map((a) => ({ value: a, label: resolveLocalizedText(ALLERGEN_LABELS[a]) }));

  /** Asistanın yazdığı alanın başlığına düşen işaret — yoksa `undefined` (etiket sade kalır). */
  const mark = (key: keyof ProductFormValues): ReactNode =>
    filled?.has(key) ? (
      <span
        title="Bu kutuyu asistan doldurdu"
        className="rounded-ops-card border border-ops-violet-line bg-ops-violet-bg px-1.5 py-[1px] font-ops-body text-ops-micro font-medium text-ops-violet"
      >
        asistan
      </span>
    ) : undefined;

  // Çok dilli alan tanımları TEK yerde; dilini dışarıdan alır (dil kartının içi).
  const nameField = (lang?: Locale) => (
    <FormLocalizedText
      control={control}
      name="name"
      label="Ürün adı"
      labelAside={mark('name')}
      required
      placeholder="Ürün adı"
      lang={lang}
      field="ad"
    />
  );
  const descriptionField = (lang?: Locale) => (
    <FormLocalizedText
      control={control}
      name="description"
      label="Ürün açıklaması"
      labelAside={mark('description')}
      multiline
      placeholder="Açıklama"
      lang={lang}
    />
  );

  // Alan elemanları tek kez kurulur; sunum yalnız YERLEŞTİRİR (ad + açıklama `content` kartında).
  return {
    image: photosSlot ?? null,
    content: (
      <LocaleCard title="İçerik" completenessOf={watch('name')}>
        {(lang) => (
          <>
            {nameField(lang)}
            {descriptionField(lang)}
          </>
        )}
      </LocaleCard>
    ),
    category: (
      <FormSelect
        control={control}
        name="categoryId"
        label="Kategori"
        required
        placeholder="Kategori seç"
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
      />
    ),
    vat: (
      <FormMultiToggle
        control={control}
        name="vatRate"
        label="KDV"
        required
        options={[
          { key: '5.5', label: '%5,5' },
          { key: '20', label: '%20' },
        ]}
      />
    ),
    dateType: (
      <FormMultiToggle
        control={control}
        name="dateType"
        label="Son tarih tipi"
        required
        options={[
          { key: 'DLC', label: 'DLC · güvenlik' },
          { key: 'DDM', label: 'DDM · kalite' },
        ]}
      />
    ),
    shelfLife: <FormNumber control={control} name="shelfLifeDays" label="Toplam raf ömrü (gün)" integer placeholder="ör. 180" />,
    allergens: (
      <FormMultiSelect
        control={control}
        name="allergens"
        label="Alerjenler"
        labelAside={mark('allergens') ?? 'ürünün İÇERDİKLERİ'}
        options={allergenOptions}
        addLabel="+ alerjen seç"
        searchPlaceholder="Alerjen ara…"
      />
    ),
    traces: (
      <FormMultiSelect
        control={control}
        name="traces"
        label="Çapraz bulaşma"
        labelAside={mark('traces') ?? 'aynı tesiste işlenenler'}
        options={allergenOptions}
        addLabel="+ alerjen seç"
        searchPlaceholder="Alerjen ara…"
      />
    ),
    nutrition: <FormNutrition control={control} name="nutrition" />,
    // İçindekiler + saklama TEK dil kartında (ad/açıklama ile aynı desen): ikisi de çok dilli, dil bir
    // kez seçilir. Ayrı ayrı sekme taşımaları hem üç sekme barı hem iki AI düğmesi doğuruyordu.
    declarationTexts: (
      <LocaleCard title="Beyan metinleri" completenessOf={watch('ingredients') ?? undefined}>
        {(lang) => (
          <>
            <FormLocalizedText
              control={control}
              name="ingredients"
              label="İçindekiler"
              labelAside={mark('ingredients')}
              multiline
              rows={5}
              emphasis
              emphasisHint="Alerjeni listede yazdığı hâliyle vurgula"
              placeholder="Un, su, tuz…"
              lang={lang}
              field="icindekiler"
            />
            <FormLocalizedText
              control={control}
              name="storageInstructions"
              label="Saklama ve hazırlama"
              labelAside={mark('storageInstructions')}
              multiline
              rows={4}
              emphasis
              emphasisHint="Önemli uyarıyı vurgula"
              placeholder="Saklama ve hazırlama"
              lang={lang}
              field="saklama"
            />
          </>
        )}
      </LocaleCard>
    ),
    // Varyant adı bir ÜRÜN ADIDIR ("1 kg kutu"), açıklama değil.
    variants: <VariantEditor control={control} />,
    // DURUM SEÇİCİ BURADA DEĞİL (kullanıcı kararı 11.08). Bir tur ortak alana taşınmıştı; kullanıcı
    // geri aldırdı ve gerekçe kurgunun kendisi: **kuyruk ürünün İÇERİĞİNİ yazar, satış eksenine
    // dokunmaz.** Ürün pasifse pasif, aktifse aktif kalır — form mevcut durumu okuyup aynısını geri
    // gönderir. Seçici ürün ekranının alt barında kalıyor; yayına almak oranın kararı.
    shippable: <FormSwitch control={control} name="shippable" label="Kargo izni" />,
    /**
     * **Saklama rejimi** (16.08) — soğuk zincirin kendisi, `shippable`in yanında ama ondan AYRI.
     *
     * Kargo izni "gönderilebilir mi", bu "nasıl saklanır" der. İkisi çoğu üründe birlikte hareket
     * eder ama aynı şey değildir: rejim vitrinin soğuk zincir işaretini ve teslim sonrası iadenin
     * varsayılan akıbetini (donukta imha, `DOMAIN §8`) belirler — ikisi de kargo iznine bağlı değil.
     * Yan yana duruyorlar ki operatör ikisini bir arada kararlaştırsın.
     */
    storage: (
      <FormSelect
        control={control}
        name="storageType"
        label="Saklama"
        required
        options={[
          { value: 'ambient', label: 'Oda sıcaklığı' },
          { value: 'chilled', label: 'Soğutulmuş (0–4 °C)' },
          { value: 'frozen', label: 'Donuk (−18 °C)' },
        ]}
      />
    ),
    autoPrice: <FormSwitch control={control} name="autoPrice" label="Otomatik fiyat" />,
    margin: <FormNumber control={control} name="targetMarginPercent" label="Hedef marj (%)" placeholder="ör. 42" />,
  };
}

/**
 * Sekme barı — form gövdesinin başlığında durur, gövde kaydırılırken kaybolmasın.
 *
 * Ayrı dışa verilmesinin sebebi kabın yerleşimi: ürün diyaloğunda `Dialog`ın `headerAside`ına,
 * kuyrukta panelin kendi başlık satırına giriyor. Barı gövdenin içine gömseydik iki kap da onu
 * istediği yere koyamazdı.
 */
export function ProductFormTabs({ value, onChange }: { value: ProductFormTab; onChange: (tab: ProductFormTab) => void }) {
  return (
    <UnderlineTabs
      value={value}
      onChange={onChange}
      className="flex-none self-end"
      items={[
        { key: 'product', label: 'Ürün' },
        { key: 'declaration', label: 'Beyan', title: 'Yasal beyan — içindekiler, besin değerleri, alerjenler' },
      ]}
    />
  );
}

/**
 * İki sekmenin gövdesi — AYNI ızgara hücresinde üst üste.
 *
 * Kabın yüksekliği UZUN olana göre sabitlenir, sekme değişince ekran zıplamaz. Pasif sekme
 * `invisible`: DOM'da KALIR (sökülürse RHF kayıtları düşer ve "Beyan"da yazılan metin sekme
 * değişince kaybolur) ama tıklanamaz ve sekme sırasına girmez.
 */
export function ProductFormPanels({ fields, tab }: { fields: ProductFormFields; tab: ProductFormTab }) {
  return (
    <div className="grid">
      <div className="col-start-1 row-start-1" aria-hidden={tab !== 'product'} inert={tab !== 'product'}>
        <div className={tab === 'product' ? '' : 'invisible'}>
          <ProductFormDesktop fields={fields} />
        </div>
      </div>
      <div className="col-start-1 row-start-1" aria-hidden={tab !== 'declaration'} inert={tab !== 'declaration'}>
        <div className={tab === 'declaration' ? '' : 'invisible'}>
          <ProductFormDeclaration fields={fields} />
        </div>
      </div>
    </div>
  );
}
