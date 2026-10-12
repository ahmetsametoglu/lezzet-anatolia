'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { COUNTRY_LABELS, PRODUCT_STATUS_LABELS, resolveLocalizedText } from '@lezzet/types';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormMultiToggle } from '@/components/operation/form/form-multi-toggle';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { useImageCrop } from '@/components/operation/form/use-image-crop.hook';
import { ProductFormPanels, ProductFormTabs, useProductFormFields } from '@/components/operation/form/product-form';
import { ProductPhotos } from '@/components/operation/form/product-form/photos';
import { ProductFormSchema, buildDefaults, toActionPayload, type ProductFormValues } from '@/components/operation/form/product-form/schema';
import type { ProductFormTab } from '@/components/operation/form/product-form/types';
// Yazan kapılar ortak (`lib/catalog`): aynı form asistan kuyruğunda da açılıp kaydediliyor.
import { createProductAction, updateProductAction } from '@/lib/catalog/product-actions';
import { uploadProductImageAction } from '@/lib/catalog/product-photo-actions';
import { setProductCountryVatAction } from '../../actions/country-vat';
import { bundlesUsingVariants, type BundleView, type CategoryView, type ProductView } from '../../products-types';
import { VAT_COUNTRIES, choiceOf, countryVatOptions, countryVatWrite, type VatCountry } from './country-vat';

// Ürün oluştur/düzenle kabı: form durumu, action'lar, dialog kabuğu ve alt bar burada; alanlar ortak gövdeden.

const FORM_ID = 'product-form';

interface ProductFormDialogProps {
  mode: 'create' | 'edit';
  product: ProductView | null;
  categories: CategoryView[];
  /** Paketler — bu ürünün hangilerinde kullanıldığını göstermek için (ek sorgu yok, zaten gelmiş). */
  bundles: BundleView[];
  onClose: () => void;
}

export function ProductFormDialog({ mode, product, categories, bundles, onClose }: ProductFormDialogProps) {
  const editing = mode === 'edit' && product !== null;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Sekme yerel durum: diyalog içi görünüm tercihi, paylaşılabilir bir adres değil.
  const [tab, setTab] = useState<ProductFormTab>('product');

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: buildDefaults(editing ? product : null),
    mode: 'onChange',
  });
  const { control, handleSubmit, formState } = form;

  // Ülke oranları ürün formunun şemasında değil, ayrı kapıdan yazılır; kuyruk bu alanı göstermez.
  const savedRate = (country: VatCountry) => product?.countryRates.find((row) => row.country === country)?.vatRate ?? null;
  const [vatChoices, setVatChoices] = useState(
    () => new Map(VAT_COUNTRIES.map((country) => [country, choiceOf(editing ? savedRate(country) : null)])),
  );

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const payload = toActionPayload(values);
    const { error: actionError } = editing ? await updateProductAction(product.id, payload) : await createProductAction(payload);
    if (actionError) {
      setError(actionError);
      return;
    }
    if (editing) {
      for (const country of VAT_COUNTRIES) {
        const write = countryVatWrite(savedRate(country), vatChoices.get(country) ?? '');
        if (write === null) continue;
        const { error: vatError } = await setProductCountryVatAction(product.id, country, write.rate);
        if (vatError) {
          setError(vatError);
          return;
        }
      }
    }
    router.refresh();
    onClose();
  });

  // Kayıt yoksa yükleme yapılamaz (depolama anahtarı ürüne bağlı). Galeri canlı yazdığı için forma
  // alan olarak değil slot olarak girer.
  const [crop, setCrop] = useImageCrop(form);
  const imageField = (
    <ProductPhotos
      productId={editing ? product.id : null}
      coverUrl={editing ? product.imageUrl : null}
      coverCrop={crop}
      onCoverCropChange={setCrop}
      uploadCover={editing ? (fd) => uploadProductImageAction(product.id, fd) : undefined}
    />
  );

  const countryVatField = VAT_COUNTRIES.map((country) => (
    // Sağ ray dar: açıklama seçeneklerin ipucundadır, yeni üründe yalnız neden kapalı olduğu yazar.
    <FieldShell key={country} label={`${COUNTRY_LABELS[country]} KDV`} labelAside={editing ? undefined : 'kayıttan sonra'}>
      <MultiToggle
        label={`${COUNTRY_LABELS[country]} KDV`}
        value={vatChoices.get(country) ?? ''}
        options={countryVatOptions(country, editing ? savedRate(country) : null, !editing)}
        onChange={(choice) => setVatChoices((prev) => new Map(prev).set(country, choice))}
      />
    </FieldShell>
  ));

  const fields = useProductFormFields({
    control,
    watch: form.watch,
    categories: categories.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
    photosSlot: imageField,
    countryVatSlot: countryVatField,
  });

  // Paket ancak tüm kalemleri satılabilirse satılabilir: ürünü satıştan çıkarmak onu içeren paketleri
  // de düşürür. Uyarı yalnız satıştaki bir paket etkilenecekken çıkar.
  const usedIn = bundlesUsingVariants(
    bundles,
    (product?.variants ?? []).map((v) => v.id),
  );
  const activeUsedIn = usedIn.filter((b) => b.isActive);
  const leavingSale = form.watch('status') !== 'active' && (product?.status ?? 'active') === 'active';
  const bundleNames = (list: BundleView[]) => list.map((b) => resolveLocalizedText(b.name)).join(' · ');
  const bundleNote =
    usedIn.length === 0 ? null : (
      <span
        className={`truncate font-ops-body text-ops-xs ${leavingSale && activeUsedIn.length > 0 ? 'font-semibold text-ops-amber' : 'text-ops-muted'}`}
        title={bundleNames(usedIn)}
      >
        {leavingSale && activeUsedIn.length > 0
          ? `Satıştan çıkarırsan ${activeUsedIn.length} paket de satılamaz: ${bundleNames(activeUsedIn)}`
          : `${usedIn.length} pakette kullanılıyor`}
      </span>
    );

  // Durum seçicisi ortak alan değil: asistan kuyruğu içeriği yazar, satışa almak bu ekranın kararıdır.
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
              { key: 'active', label: PRODUCT_STATUS_LABELS.active, tone: 'olive', title: 'Katalogda görünür ve satılabilir' },
              {
                key: 'passive',
                label: PRODUCT_STATUS_LABELS.passive,
                tone: 'neutral',
                title: 'Katalogda gizli — arşiv değil, geri açılabilir',
              },
              {
                key: 'candidate',
                label: PRODUCT_STATUS_LABELS.candidate,
                tone: 'blue',
                title: 'Satılamaz; yalnız keşif akışında görünür',
              },
            ]}
          />
          {bundleNote}
        </>
      }
    />
  );

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={1480}
      maxHeightVh={94}
      title={editing ? 'Ürün düzenle' : 'Yeni ürün'}
      subtitle={editing ? resolveLocalizedText(product.name) || 'Ürün' : 'Zorunlu alanları doldurun; beyanlar sonradan tamamlanabilir'}
      headerAside={<ProductFormTabs value={tab} onChange={setTab} />}
      footer={footer}
    >
      <form id={FORM_ID} onSubmit={onSubmit}>
        <ProductFormPanels fields={fields} tab={tab} />
      </form>
    </Dialog>
  );
}
