'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ALLERGEN_LABELS, ProductAllergenEnum, resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import { type Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { UnderlineTabs } from '@/components/operation/ui/underline-tabs';
import { LocaleCard } from '@/components/operation/form/locale-card';
import { FormNumber } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { FormMultiToggle } from '@/components/operation/form/form-multi-toggle';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { FormMultiSelect } from '@/components/operation/form/form-multi-select';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { FormNutrition } from '@/components/operation/form/form-nutrition';
import { useImageCrop } from '@/components/operation/form/use-image-crop.hook';
import { ProductPhotos } from './product-photos';
import { suggestTranslationAction } from '../../actions/translate';
import { createProductAction, updateProductAction, uploadProductImageAction } from './actions';
import { VariantEditor } from './variant-editor';
import { ProductFormDeclaration } from './product-form-declaration';
import { ProductFormDesktop } from './product-form.desktop';
import { ProductFormMobile } from './product-form.mobile';
import { ProductFormSchema, buildDefaults, toActionPayload, type ProductFormValues } from './product-form-schema';
import type { ProductFormFields, ProductFormTab } from './product-form-types';
import { bundlesUsingVariants, type BundleView, type CategoryView, type ProductView } from '../../products-types';

// Ürün oluştur/düzenle — KAP (container): RHF + zodResolver, action'lar, Dialog kabuğu ve footer burada.
// Alan ELEMANLARI bir kez kurulur (fields), sunum cihaza göre çatallanır (Sapma 3): masaüstü çok bölgeli
// (.desktop), mobil tek sütun (.mobile). Aynı alanlar, farklı düzen → tekrar yok.
//
// DİL: form geneli görünmez kip YOK (eski header sekmesi kaldırıldı) — dil, çok dilli alanların
// yanında GÖRÜNÜR. Cihaza göre çatallanır, çünkü alanların komşuluğu farklı:
//   · web   → ad + açıklama aynı sütunda yan yana ⇒ TEK dil kartı (`content`) ikisini sarar
//   · mobil → ad "Temel", açıklama "Açıklama" bölümünde (tasarımın bölüm sırası) ⇒ her alan KENDİ sekmesiyle
// Alan tanımları tek yerde (nameField/descriptionField); iki şekle de aynı tanım verilir (tekrar yok).

const FORM_ID = 'product-form';

interface ProductFormDialogProps {
  mode: 'create' | 'edit';
  product: ProductView | null;
  categories: CategoryView[];
  /** Paketler — bu ürünün hangilerinde kullanıldığını göstermek için (ek sorgu yok, zaten gelmiş). */
  bundles: BundleView[];
  device: Device;
  onClose: () => void;
}

export function ProductFormDialog({ mode, product, categories, bundles, device, onClose }: ProductFormDialogProps) {
  const editing = mode === 'edit' && product !== null;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Sekme YEREL durum, URL'e yazılmaz: diyalog içi bir görünüm tercihi, paylaşılabilir bir adres değil.
  const [tab, setTab] = useState<ProductFormTab>('product');

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: buildDefaults(editing ? product : null),
    mode: 'onChange',
  });
  const { control, handleSubmit, formState } = form;

  // AI çeviri: TR metinden FR/DE önerir (arka uç stub — UI hazır). Dönüş eksik dilleri doldurur.
  const aiTranslate = (text: LocalizedText): Promise<LocalizedText> => suggestTranslationAction(text);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const payload = toActionPayload(values);
    const { error: actionError } = editing ? await updateProductAction(product.id, payload) : await createProductAction(payload);
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
    onClose();
  });

  // Alerjen listesi İKİ alanda birden kullanılır (içerdikleri + çapraz bulaşma) → tek yerde kurulur.
  const allergenOptions = ProductAllergenEnum.options.map((a) => ({ value: a, label: resolveLocalizedText(ALLERGEN_LABELS[a]) }));

  // Çok dilli alan tanımları TEK yerde; `lang` verilmezse alan kendi sekmesini gösterir (mobil),
  // verilirse dilini dışarıdan alır (web'de dil kartının içi).
  const nameField = (lang?: Locale) => (
    <FormLocalizedText control={control} name="name" label="Ürün adı" required placeholder="Ürün adı" lang={lang} onAiTranslate={aiTranslate} />
  );
  const descriptionField = (lang?: Locale) => (
    <FormLocalizedText control={control} name="description" label="Ürün açıklaması" multiline placeholder="Açıklama" lang={lang} onAiTranslate={aiTranslate} />
  );

  // Görsel: kaynak 3:2, odak + zoom kırpması form değeri; düzenleme ayrı diyalogda. Kayıt yoksa yükleme
  // yapılamaz (R2 anahtarı slug'a bağlı) → istem gösterilir. Alt metin AYRI alan değil: boşsa müşteri
  // yüzeyinde ürün adına düşer (kopya tutulmaz) — bu yüzden formda alt-metin alanı yok.
  // Galeri (ek fotoğraflar) aynı blokta: kapak büyük, altında şerit. Galeri CANLI yönetilir —
  // gerekçesi ProductPhotos'ta.
  const [crop, setCrop] = useImageCrop(form);
  const imageField = (
    <ProductPhotos
      productId={editing ? product.id : null}
      coverUrl={editing ? product.imageUrl : null}
      coverCrop={crop}
      onCoverCropChange={setCrop}
      uploadCover={editing ? (fd) => uploadProductImageAction(product.id, fd) : undefined}
      camera={device === 'mobile'}
    />
  );

  // Alan elemanları tek kez kurulur; sunumlar yalnız YERLEŞTİRİR (web `content`, mobil `name`+`description`).
  const fields: ProductFormFields = {
    image: imageField,
    name: nameField(),
    description: descriptionField(),
    content: (
      <LocaleCard title="İçerik" completenessOf={form.watch('name')}>
        {(lang) => (
          <>
            {nameField(lang)}
            {descriptionField(lang)}
          </>
        )}
      </LocaleCard>
    ),
    category: <FormSelect control={control} name="categoryId" label="Kategori" required placeholder="Kategori seç" options={categories.map((c) => ({ value: c.id, label: resolveLocalizedText(c.name) }))} />,
    vat: <FormMultiToggle control={control} name="vatRate" label="KDV" required options={[{ key: '5.5', label: '%5,5' }, { key: '20', label: '%20' }]} />,
    dateType: <FormMultiToggle control={control} name="dateType" label="Son tarih tipi" required options={[{ key: 'DLC', label: 'DLC · güvenlik' }, { key: 'DDM', label: 'DDM · kalite' }]} />,
    shelfLife: <FormNumber control={control} name="shelfLifeDays" label="Toplam raf ömrü (gün)" integer placeholder="ör. 180" />,
    allergens: <FormMultiSelect control={control} name="allergens" label="Alerjenler" labelAside="ürünün İÇERDİKLERİ" options={allergenOptions} addLabel="+ alerjen seç" searchPlaceholder="Alerjen ara…" />,
    traces: <FormMultiSelect control={control} name="traces" label="Çapraz bulaşma" labelAside="aynı tesiste işlenenler" options={allergenOptions} addLabel="+ alerjen seç" searchPlaceholder="Alerjen ara…" />,
    nutrition: <FormNutrition control={control} name="nutrition" />,
    // İçindekiler + saklama TEK dil kartında (ad/açıklama ile aynı desen): ikisi de çok dilli, dil bir
    // kez seçilir. Ayrı ayrı sekme taşımaları hem üç sekme barı hem iki AI düğmesi doğuruyordu.
    declarationTexts: (
      <LocaleCard title="Beyan metinleri" completenessOf={form.watch('ingredients') ?? undefined}>
        {(lang) => (
          <>
            <FormLocalizedText
              control={control}
              name="ingredients"
              label="İçindekiler"
              multiline
              rows={5}
              emphasis
              emphasisHint="Alerjeni listede yazdığı hâliyle vurgula"
              placeholder="Un, su, tuz…"
              lang={lang}
              onAiTranslate={aiTranslate}
            />
            <FormLocalizedText
              control={control}
              name="storageInstructions"
              label="Saklama ve hazırlama"
              multiline
              rows={4}
              emphasis
              emphasisHint="Önemli uyarıyı vurgula"
              placeholder="Saklama ve hazırlama"
              lang={lang}
              onAiTranslate={aiTranslate}
            />
          </>
        )}
      </LocaleCard>
    ),
    variants: <VariantEditor control={control} onAiTranslate={aiTranslate} />,
    shippable: <FormSwitch control={control} name="shippable" label="Kargo izni" />,
    autoPrice: <FormSwitch control={control} name="autoPrice" label="Otomatik fiyat" />,
    margin: <FormNumber control={control} name="targetMarginPercent" label="Hedef marj (%)" placeholder="ör. 42" />,
    priceNote: (
      <span className="font-ops-body text-[11px] leading-[1.5] text-ops-muted">
        Fiyatın kendisi kanala/müşteriye göre Fiyatlar ekranında çözülür — burada yalnız marj hedefi ve otomatik davranış tanımlanır.
      </span>
    ),
  };

  // Alt bar SOL tarafı = aksiyon bölgesi (zorunlu-alan metni değil): satış durumu kaydetmenin hemen
  // yanında durur — katalog/paket dialoglarıyla aynı desen.
  //
  // ÜRÜN ↔ PAKET BAĞI görünür kılınır. Paket ancak tüm kalemleri satılabilirse satılabilir; ürünü
  // pasife almak, o ürünü içeren paketleri de vitrinden düşürür. Bağ ekranda hiç yazmıyordu, yani
  // operatör sonucu ancak sonradan (satış durunca) öğreniyordu. Sayı HER ZAMAN görünür, uyarı ise
  // yalnız gerçekten zarar verecek anda: satıştaki bir paketi olan ürünü satıştan çıkarırken.
  const usedIn = bundlesUsingVariants(bundles, (product?.variants ?? []).map((v) => v.id));
  const activeUsedIn = usedIn.filter((b) => b.isActive);
  const leavingSale = form.watch('status') !== 'active' && (product?.status ?? 'active') === 'active';
  const bundleNames = (list: BundleView[]) => list.map((b) => resolveLocalizedText(b.name)).join(' · ');
  const bundleNote =
    usedIn.length === 0 ? null : (
      <span
        className={`truncate font-ops-body text-[11.5px] ${leavingSale && activeUsedIn.length > 0 ? 'font-semibold text-ops-amber' : 'text-ops-muted'}`}
        title={bundleNames(usedIn)}
      >
        {leavingSale && activeUsedIn.length > 0
          ? `Satıştan çıkarırsan ${activeUsedIn.length} paket de satılamaz: ${bundleNames(activeUsedIn)}`
          : `${usedIn.length} pakette kullanılıyor`}
      </span>
    );

  // Üç durum TEK seçicide: "Satışta / Pasif / Aday" aynı bilginin değerleri. Önceden yalnız aktiflik
  // anahtarı vardı ve aday ürün çıkmazdaydı — anahtarı açmak `isActive` yazıyordu ama adaylık onu
  // ezdiği için ekranda hiçbir şey değişmiyordu. Vaat edilen "Etkinleştir" düğmesinin yerini bu alıyor.
  const footer = (
    <DialogFooter
      formId={FORM_ID}
      onCancel={onClose}
      submitting={formState.isSubmitting}
      error={error}
      actions={
        <>
          <FormMultiToggle
            control={control}
            name="status"
            label="Durum"
            bare
            className="w-[248px]"
            options={[
              { key: 'active', label: 'Satışta', tone: 'olive', title: 'Katalogda görünür ve satılabilir' },
              { key: 'passive', label: 'Pasif', tone: 'neutral', title: 'Katalogda gizli — arşiv değil, geri açılabilir' },
              { key: 'candidate', label: 'Aday', tone: 'blue', title: 'Satılamaz; yalnız keşif akışında görünür' },
            ]}
          />
          {bundleNote}
        </>
      }
    />
  );

  // Sekmeler başlıkta durur — gövde kaydırılırken kaybolmasın. İki sekme de AYNI formun içinde:
  // gizlenen sekmenin alanları DOM'da kalır (`hidden`), çünkü sökülürlerse RHF kayıtları düşer ve
  // "Beyan"da yazılan metin sekme değişince kaybolur. Kaydet ikisini birden gönderir.
  const tabs = (
    <UnderlineTabs
      value={tab}
      onChange={setTab}
      className="flex-none self-end"
      items={[
        { key: 'product', label: 'Ürün' },
        { key: 'declaration', label: 'Beyan', title: 'Yasal beyan — içindekiler, besin değerleri, alerjenler' },
      ]}
    />
  );

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={device === 'mobile' ? 520 : 1180}
      title={editing ? 'Ürün düzenle' : 'Yeni ürün'}
      subtitle={editing ? (resolveLocalizedText(product.name) || 'Ürün') : 'Zorunlu alanları doldurun; beyanlar sonradan tamamlanabilir'}
      headerAside={tabs}
      footer={footer}
    >
      {/* İki sekme AYNI ızgara hücresinde üst üste durur → kabın yüksekliği UZUN olana göre sabitlenir,
          sekme değişince diyalog zıplamaz. Pasif sekme `invisible`: DOM'da kalır (sökülürse RHF kayıtları
          düşer ve yazılan metin kaybolur) ama tıklanamaz ve sekme sırasına girmez. */}
      <form id={FORM_ID} onSubmit={onSubmit} className="grid">
        <div className="col-start-1 row-start-1" aria-hidden={tab !== 'product'} inert={tab !== 'product'}>
          <div className={tab === 'product' ? '' : 'invisible'}>
            {device === 'mobile' ? <ProductFormMobile fields={fields} /> : <ProductFormDesktop fields={fields} />}
          </div>
        </div>
        <div className="col-start-1 row-start-1" aria-hidden={tab !== 'declaration'} inert={tab !== 'declaration'}>
          <div className={tab === 'declaration' ? '' : 'invisible'}>
            <ProductFormDeclaration fields={fields} stacked={device === 'mobile'} />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
