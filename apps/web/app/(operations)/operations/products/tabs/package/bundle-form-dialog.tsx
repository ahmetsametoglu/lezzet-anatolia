'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { fromCents } from '@lezzet/helper';
import { resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import type { Device } from '@/lib/device';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { LocaleCard } from '@/components/operation/form/locale-card';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { FormMultiToggle } from '@/components/operation/form/form-multi-toggle';
import { FormNumber } from '@/components/operation/form/form-input';
import { FormMoney, PercentField } from '@/components/operation/form/money-input';
import { ImageCropField } from '@/components/operation/form/image-crop-field';
import { useImageCrop } from '@/components/operation/form/use-image-crop.hook';
import { FormSection } from '../../components/form-section';
import { suggestTranslationAction } from '@/lib/ai/translate';
import {
  createBundleAction,
  loadBundleFormAction,
  searchBundleVariantsAction,
  updateBundleAction,
  uploadBundleImageAction,
} from './actions';
import { BundleItemsEditor } from './bundle-items-editor';
import { priceFromDiscountPercent } from '@lezzet/domain-core';
import { bundlePricing } from './bundle-pricing';
import { BundleFormSchema, buildBundleDefaults, bundleBlock, toBundlePayload, type BundleFormValues } from './bundle-form-schema';
import type { BundleView, VariantOption } from '../../products-types';

// Paket oluştur/düzenle — KAP: RHF + zodResolver, action'lar, Dialog kabuğu ve footer burada.
// Referans ürün form diyaloğu; ondan AYRILAN tek yer sekme yokluğu: paketin alanı çok daha az
// (ad · açıklama · görsel · fiyat · kişilik · kalemler), ürün formunu ikiye bölen yasal beyan yığını
// burada yok. Cihaz forku da yok — brief kararı: "paket kurma ve çok dilli yoğun giriş WEB'de kalır",
// mobilde yalnız liste ve hızlı düzeltme var.

const FORM_ID = 'bundle-form';

interface BundleFormDialogProps {
  bundle: BundleView | null;
  device: Device;
  onClose: () => void;
}

export function BundleFormDialog({ bundle, device, onClose }: BundleFormDialogProps) {
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

  const aiTranslate = (text: LocalizedText): Promise<LocalizedText> => suggestTranslationAction(text);

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

  // TEK okuma: kaydetme engeli de fiyat türetmesi de aynı değerlerden beslenir.
  const values = form.watch();
  const poolById = useMemo(() => new Map((pool ?? []).map((p) => [p.variantId, p])), [pool]);
  const pricing = bundlePricing(
    (values.items ?? []).map((i) => ({ variantId: i.variantId, qty: i.qty, allocatedUnitPrice: i.allocatedUnitPrice })),
    poolById,
    values.totalPrice ?? 0,
  );

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
            { key: 'active', label: 'Satışta', tone: 'olive', title: 'Vitrinde görünür' },
            { key: 'passive', label: 'Pasif', tone: 'neutral', title: 'Vitrinde gizli — silinmiş değil' },
          ]}
        />
      }
    />
  );

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={device === 'mobile' ? 520 : 1160}
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
      <form id={FORM_ID} onSubmit={onSubmit} className="grid gap-5 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <FormSection title="İçerik">
              <LocaleCard title="Ad ve açıklama" completenessOf={values.name}>
                {(lang) => (
                  <>
                    <FormLocalizedText
                      control={control}
                      name="name"
                      label="Paket adı"
                      required
                      placeholder="ör. Bayram Sofrası"
                      lang={lang}
                      onAiTranslate={aiTranslate}
                    />
                    <FormLocalizedText
                      control={control}
                      name="description"
                      label="Kısa açıklama"
                      multiline
                      rows={3}
                      placeholder="Hangi durum için uygun"
                      lang={lang}
                      onAiTranslate={aiTranslate}
                    />
                  </>
                )}
              </LocaleCard>
            </FormSection>
  
            <FormSection title="Görsel">
              <ImageCropField
                role="package"
                src={bundle?.imageUrl ?? null}
                crop={crop}
                onCropChange={setCrop}
                upload={editing ? (fd) => uploadBundleImageAction(bundle.id, fd) : undefined}
                uploadDisabledHint="Görsel için paketi önce kaydedin (adres adından türüyor)."
              />
            </FormSection>
          </div>
  
          <div className="flex flex-col gap-4">
            <FormSection title="Fiyat ve sunum">
              <div className="grid grid-cols-3 gap-3">
                <FormMoney
                  control={control}
                  name="totalPrice"
                  label="Paket fiyatı (€)"
                  required
                  placeholder="ör. 49,90"
                />
                {/* İndirim yüzdesi AYNI kararın ikinci yazımı — saklanan bir alan değil, fiyattan türer
                    ve yazılınca fiyatı doldurur. Operatör kimi zaman "34,90 olsun", kimi zaman "%10
                    vereyim" diye düşünür; ikisini de yazabilmeli ve ikisi asla çelişmemeli. */}
                <PercentField
                  label="İndirim (%)"
                  labelAside="fiyatla bağlı"
                  // EKSİ yüzde gösterilmez: paket ayrı ayrı almaktan pahalıysa ortada indirim YOKTUR,
                  // "-66,3" ise geçerli bir değermiş gibi durur (üstelik kutuya eksi yazılamıyor da).
                  // O hâli şerit anlatıyor: "19,90 € pahalı".
                  value={pricing.discountPercent != null && pricing.discountPercent >= 0 ? pricing.discountPercent : null}
                  disabled={pricing.listTotalCents == null}
                  placeholder={pricing.listTotalCents == null ? '—' : 'ör. 10'}
                  onChange={(percent) => {
                    if (percent == null) return;
                    // Hesap MOTORDAN (`priceFromDiscountPercent`): aynı "%10", teklif ve özel fiyat
                    // ekranlarıyla aynı kuruşu vermeli.
                    const next = priceFromDiscountPercent(pricing.listTotalCents, percent);
                    if (next === null) return;
                    setValue('totalPrice', fromCents(next), { shouldValidate: true, shouldDirty: true });
                  }}
                />
                <FormNumber
                  control={control}
                  name="serves"
                  label="Kaç kişilik"
                  integer
                  placeholder="ör. 6"
                  labelAside="isteğe bağlı"
                />
              </div>
              <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
                Müşteri yalnız paket fiyatını görür (KDV dahil) ve o fiyat sabittir — kupon ve genel indirim pakete
                uygulanmaz. İndirim yüzdesi kalemlerin tek fiyatları toplamına göre hesaplanır; birini yazarsan öbürü
                dolar. “Kaç kişilik” boş bırakılırsa müşteri tarafında o künye satırı hiç çizilmez.
              </span>
            </FormSection>
  
            {/* Paylar burada TÜRETİLİR: editör yalnız alan yazar (`setValue`), formun sahibi bu dialog. */}
            <BundleItemsEditor
              control={control}
              pool={pool}
              setValue={setValue}
              onSearch={searchVariants}
              searching={searching}
            />
          </div>
        </form>
      )}
    </Dialog>
  );
}
