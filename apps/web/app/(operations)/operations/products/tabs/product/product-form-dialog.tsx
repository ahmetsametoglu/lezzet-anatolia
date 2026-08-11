'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PRODUCT_STATUS_LABELS, resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FormMultiToggle } from '@/components/operation/form/form-multi-toggle';
import { useImageCrop } from '@/components/operation/form/use-image-crop.hook';
import { ProductFormPanels, ProductFormTabs, useProductFormFields } from '@/components/operation/form/product-form';
import { ProductPhotos } from '@/components/operation/form/product-form/photos';
import { ProductFormSchema, buildDefaults, toActionPayload, type ProductFormValues } from '@/components/operation/form/product-form/schema';
import type { ProductFormTab } from '@/components/operation/form/product-form/types';
import { suggestTranslationAction, type TranslateField } from '@/lib/ai/translate';
import { updateProductAction } from '@/lib/catalog/product-actions';
import { uploadProductImageAction } from '@/lib/catalog/product-photo-actions';
import { createProductAction } from './actions';
import { bundlesUsingVariants, type BundleView, type CategoryView, type ProductView } from '../../products-types';

// Ürün oluştur/düzenle — KAP (container): RHF + zodResolver, action'lar, Dialog kabuğu ve footer burada.
// Alan ELEMANLARI bir kez kurulur (fields), sunum masaüstü düzeninde (.desktop) yerleştirilir.
// Operasyon web'i masaüstü-yalnız; mobil deneyim native uygulamada (`docs/uygulama`).
//
// DİL: form geneli görünmez kip YOK (eski header sekmesi kaldırıldı) — dil, çok dilli alanların
// yanında GÖRÜNÜR: ad + açıklama aynı sütunda yan yana ⇒ TEK dil kartı (`content`) ikisini sarar.
// Alan tanımları tek yerde (nameField/descriptionField).

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
  // Sekme YEREL durum, URL'e yazılmaz: diyalog içi bir görünüm tercihi, paylaşılabilir bir adres değil.
  const [tab, setTab] = useState<ProductFormTab>('product');

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: buildDefaults(editing ? product : null),
    mode: 'onChange',
  });
  const { control, handleSubmit, formState } = form;

  /**
   * AI çeviri: TR metinden FR/DE önerir; dönüş eksik dilleri doldurur.
   *
   * **Alan türü geçiliyor** (04.08, arka uç bildirimi): ton ve uzunluk ondan çıkıyor. Ürün ADI iki
   * kelimelik bir vitrin metnidir, SAKLAMA TALİMATI bir yönergedir, İÇİNDEKİLER ise yasal bir
   * listedir — üçünü aynı ölçüde çevirmek, birini mutlaka bozar. Varsayılan `aciklama` idi ve
   * dördü de onunla gidiyordu.
   */
  const aiTranslate = (field: TranslateField) => (text: LocalizedText) => suggestTranslationAction(text, field);

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

  // Görsel: kaynak 3:2, odak + zoom kırpması form değeri; düzenleme ayrı diyalogda. Kayıt yoksa yükleme
  // yapılamaz (R2 anahtarı slug'a bağlı) → istem gösterilir. Alt metin AYRI alan değil: boşsa müşteri
  // yüzeyinde ürün adına düşer (kopya tutulmaz) — bu yüzden formda alt-metin alanı yok.
  // Galeri (ek fotoğraflar) aynı blokta: kapak büyük, altında şerit. Galeri CANLI yönetilir —
  // gerekçesi ProductPhotos'ta. Forma SLOT olarak giriyor: canlı yazan bir blok, formun alanı değil.
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

  // Alan elemanları ORTAK gövdeden (22.14): aynı form asistan kuyruğunda da açılıyor. Burada yalnız
  // kabın verdikleri var — kategoriler, AI çeviri kapısı ve canlı yazan galeri slotu.
  const fields = useProductFormFields({
    control,
    watch: form.watch,
    categories: categories.map((c) => ({ id: c.id, name: resolveLocalizedText(c.name) })),
    onAiTranslate: aiTranslate,
    photosSlot: imageField,
  });

  // Alt bar SOL tarafı = aksiyon bölgesi (zorunlu-alan metni değil): satış durumu kaydetmenin hemen
  // yanında durur — katalog/paket dialoglarıyla aynı desen.
  //
  // ÜRÜN ↔ PAKET BAĞI görünür kılınır. Paket ancak tüm kalemleri satılabilirse satılabilir; ürünü
  // pasife almak, o ürünü içeren paketleri de vitrinden düşürür. Bağ ekranda hiç yazmıyordu, yani
  // operatör sonucu ancak sonradan (satış durunca) öğreniyordu. Sayı HER ZAMAN görünür, uyarı ise
  // yalnız gerçekten zarar verecek anda: satıştaki bir paketi olan ürünü satıştan çıkarırken.
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

  // Üç durum TEK seçicide: "Satışta / Pasif / Aday" aynı bilginin değerleri. Önceden yalnız aktiflik
  // anahtarı vardı ve aday ürün çıkmazdaydı — anahtarı açmak `isActive` yazıyordu ama adaylık onu
  // ezdiği için ekranda hiçbir şey değişmiyordu. Vaat edilen "Etkinleştir" düğmesinin yerini bu alıyor.
  //
  // Seçici BURADA kalır, ortak alan DEĞİLDİR (kullanıcı kararı 11.08): asistan kuyruğu ürünün
  // içeriğini yazar, satış eksenine dokunmaz — yayına almak bu ekranın kararı ve paket bağı da
  // (üstteki `bundleNote`) yalnız burada okunuyor.
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
              // Etiketler TEK kaynaktan (`PRODUCT_STATUS_LABELS`): seçicideki kelime ile listedeki
              // rozetin kelimesi ayrışmıştı ("Satışta" ↔ "Aktif"). Açıklama (`title`) burada kalır —
              // o bir arayüz ipucudur, durumun adı değil.
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

  // Sekmeler BAŞLIKTA durur — gövde kaydırılırken kaybolmasın. Barın kendisi ortak (`ProductFormTabs`),
  // yeri kabın kararı: kuyrukta panelin kendi başlık satırına giriyor.
  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={1180}
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
