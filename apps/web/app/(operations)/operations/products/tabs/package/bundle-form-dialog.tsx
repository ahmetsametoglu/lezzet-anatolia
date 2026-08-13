'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resolveLocalizedText } from '@lezzet/types';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FormMultiToggle } from '@/components/operation/form/form-multi-toggle';
import { useImageCrop } from '@/components/operation/form/use-image-crop.hook';
import { BundleFormBody } from '@/components/operation/form/bundle-form/body';
import {
  BundleFormSchema,
  buildBundleDefaults,
  bundleBlock,
  toBundlePayload,
  type BundleFormValues,
} from '@/components/operation/form/bundle-form/schema';
import type { BundleView, VariantOption } from '@/components/operation/form/bundle-form/types';
import {
  createBundleAction,
  loadBundleFormAction,
  searchBundleVariantsAction,
  updateBundleAction,
  uploadBundleImageAction,
} from '@/lib/catalog/bundle-actions';

// Paket oluştur/düzenle — KAP: RHF + zodResolver, action'lar, Dialog kabuğu ve footer burada.
// Referans ürün form diyaloğu; ondan AYRILAN tek yer sekme yokluğu: paketin alanı çok daha az
// (ad · açıklama · görsel · fiyat · kişilik · kalemler), ürün formunu ikiye bölen yasal beyan yığını
// burada yok.

const FORM_ID = 'bundle-form';

interface BundleFormDialogProps {
  bundle: BundleView | null;
  onClose: () => void;
}

export function BundleFormDialog({ bundle, onClose }: BundleFormDialogProps) {
  const editing = bundle !== null;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<BundleFormValues>({
    resolver: zodResolver(BundleFormSchema),
    defaultValues: buildBundleDefaults(bundle),
    mode: 'onChange',
  });

  /**
   * Formun verisi DİYALOG AÇILINCA okunur: bu paketin kalemleri + varyant havuzu (birim fiyat ve
   * maliyetle). Liste sayfası bunları taşımıyor — taşısaydı hiç form açmayacak operatör de katalogun
   * tamamının fiyatlarını indirirdi.
   *
   * Gövde veri gelene kadar ÇİZİLMEZ: kalem editörü boş satırlarla mount olsaydı, veri sonradan
   * düştüğünde otomatik dağıtım tetiklenir ve kayıtlı payları üzerine yazardı — formu açmak veriyi
   * değiştirmemeli.
   */
  // Bilinen seçenekler: açılışta paketin KENDİ kalemleri, sonra arama sonuçlarıyla birikir.
  // Katalogun tamamı hiç indirilmez; ama bir kez görülen boy (kalem satırında adı/fiyatı yazan)
  // arama değişse de unutulmaz — yoksa yeni bir terim yazınca satırlar adsız kalırdı.
  const [pool, setPool] = useState<VariantOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const mergeOptions = (incoming: VariantOption[]) =>
    setPool((current) => {
      const byId = new Map((current ?? []).map((o) => [o.variantId, o]));
      for (const option of incoming) byId.set(option.variantId, option);
      return [...byId.values()];
    });
  const searchVariants = (term: string) => {
    if (!term.trim()) return;
    setSearching(true);
    void searchBundleVariantsAction(term)
      .then(({ data }) => mergeOptions(data ?? []))
      .finally(() => setSearching(false));
  };
  useEffect(() => {
    let alive = true;
    void loadBundleFormAction(bundle?.id ?? null).then((res) => {
      if (!alive) return;
      if (!res.data) {
        setError(res.error);
        return;
      }
      setPool(res.data.options);
      form.reset(buildBundleDefaults(bundle, res.data.items));
    });
    return () => {
      alive = false;
    };
    // Bağımlılık yalnız paket kimliği: `form` her render'da aynı örnek, `bundle` nesnesi ise liste
    // tazelendikçe kimliği değişmeden yeniden doğuyor — onu bağımlılığa koymak formu döngüye sokardı.
  }, [bundle?.id]);
  const { control, handleSubmit, formState, setValue } = form;


  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const payload = toBundlePayload(values);
    const { error: actionError } = editing ? await updateBundleAction(bundle.id, payload) : await createBundleAction(payload);
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
    onClose();
  });

  // Görsel: 3:2 kaynak + odak/zoom (form değeri). Kayıt yoksa yükleme yapılamaz — R2 anahtarı slug'a
  // bağlı, slug da kayıtla doğuyor.
  const [crop, setCrop] = useImageCrop(form);

  // TEK okuma: kaydetme engeli buradan beslenir. Fiyat türetmesi (`bundlePricing`) artık GÖVDEDE —
  // orada çiziliyor, burada kullanılan bir yeri yoktu ve iki kez hesaplanması boşunaydı.
  const values = form.watch();

  // Kaydetmenin engeli ŞEMANIN sorduğu soruyla aynı fonksiyondan gelir — düğme kilitlenir ve sebebi
  // yanında yazar. Eskiden düğme etkin görünüyordu ama şema geçersiz olduğu için submit yutuluyordu:
  // basılıyor, hiçbir şey olmuyordu. Ölü tıklama, hatayı hiç göstermemekten daha kötüdür.
  const block = bundleBlock(values);

  const footer = (
    <DialogFooter
      formId={FORM_ID}
      onCancel={onClose}
      submitting={formState.isSubmitting}
      error={error}
      // Veri gelene kadar kaydetmek de yok: yarım form kaydedilirse kalemler boş yazılırdı.
      blockedReason={pool === null ? 'Yükleniyor…' : (block?.message ?? null)}
      actions={
        <FormMultiToggle
          control={control}
          name="status"
          label="Durum"
          bare
          className="w-[168px]"
          options={[
            // İpucu metinleri "vitrin" DEMİYOR (05.18 · kullanıcı uyarısı 08.08): satışta olmak
            // yayın kararıdır, ana sayfada görünmek ayrı bir işaret (İÇERİK bölmesindeki anahtar).
            // Eskisi ikisini tek cümlede topluyordu — "satışa açtım, neden ana sayfada yok".
            { key: 'active', label: 'Satışta', tone: 'olive', title: 'Müşteri satın alabilir' },
            { key: 'passive', label: 'Pasif', tone: 'neutral', title: 'Müşteride gizli — silinmiş değil' },
          ]}
        />
      }
    />
  );

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={1160}
      title={editing ? 'Paket düzenle' : 'Yeni paket'}
      subtitle={
        editing
          ? (resolveLocalizedText(bundle.name) || 'Paket')
          : 'Birden çok ürünü tek fiyata sun — yeni ürün yaratmaz, sepette kalemlere açılır'
      }
      footer={footer}
    >
      {pool === null ? (
        /* Yükleniyor — gövde ÇİZİLMEZ: kalem editörü boş satırlarla mount olsaydı, veri sonradan
           düştüğünde otomatik dağıtım kayıtlı payların üzerine yazardı. Formu açmak veriyi
           değiştirmemeli. */
        <div className="flex min-h-[320px] items-center justify-center">
          <span className="font-ops-body text-ops-base text-ops-muted">Paket bilgileri yükleniyor…</span>
        </div>
      ) : (
        <form id={FORM_ID} onSubmit={onSubmit}>
          {/* Gövde ORTAK (22.18): asistan kuyruğu da aynı formu kendi içinde açıyor. Burada kalan
              her şey diyaloğa ait — kabuk, altlık, kaydeden eylem ve kapanış. */}
          <BundleFormBody
            control={control}
            setValue={setValue}
            values={values}
            pool={pool}
            onSearch={searchVariants}
            searching={searching}
            crop={crop}
            onCropChange={setCrop}
            imageUrl={bundle?.imageUrl ?? null}
            upload={editing ? (fd) => uploadBundleImageAction(bundle.id, fd) : undefined}
          />
        </form>
      )}
    </Dialog>
  );
}
