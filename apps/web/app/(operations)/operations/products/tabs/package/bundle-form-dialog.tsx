'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import type { Device } from '@/lib/device';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { LocaleCard } from '@/components/operation/form/locale-card';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { FormMultiToggle } from '@/components/operation/form/form-multi-toggle';
import { FormNumber } from '@/components/operation/form/form-input';
import { FormMoney } from '@/components/operation/form/money-input';
import { ImageCropField } from '@/components/operation/form/image-crop-field';
import { useImageCrop } from '@/components/operation/form/use-image-crop.hook';
import { FormSection } from '../product/form-section';
import { suggestTranslationAction } from '../../actions/translate';
import { createBundleAction, updateBundleAction, uploadBundleImageAction } from './actions';
import { BundleItemsEditor } from './bundle-items-editor';
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
  pool: VariantOption[];
  device: Device;
  onClose: () => void;
}

export function BundleFormDialog({ bundle, pool, device, onClose }: BundleFormDialogProps) {
  const editing = bundle !== null;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<BundleFormValues>({
    resolver: zodResolver(BundleFormSchema),
    defaultValues: buildBundleDefaults(bundle),
    mode: 'onChange',
  });
  const { control, handleSubmit, formState } = form;

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

  // Kaydetmenin engeli ŞEMANIN sorduğu soruyla aynı fonksiyondan gelir — düğme kilitlenir ve sebebi
  // yanında yazar. Eskiden düğme etkin görünüyordu ama şema geçersiz olduğu için submit yutuluyordu:
  // basılıyor, hiçbir şey olmuyordu. Ölü tıklama, hatayı hiç göstermemekten daha kötüdür.
  const block = bundleBlock(form.watch());

  const footer = (
    <DialogFooter
      formId={FORM_ID}
      onCancel={onClose}
      submitting={formState.isSubmitting}
      error={error}
      blockedReason={block?.message ?? null}
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
      maxWidth={device === 'mobile' ? 520 : 1040}
      title={editing ? 'Paket düzenle' : 'Yeni paket'}
      subtitle={
        editing
          ? (resolveLocalizedText(bundle.name) || 'Paket')
          : 'Birden çok ürünü tek fiyata sun — yeni ürün yaratmaz, sepette kalemlere açılır'
      }
      footer={footer}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <FormSection title="İçerik">
            <LocaleCard title="Ad ve açıklama" completenessOf={form.watch('name')}>
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
            <div className="grid grid-cols-2 gap-3">
              <FormMoney
                control={control}
                name="totalPrice"
                label="Paket fiyatı (€, KDV dahil)"
                required
                placeholder="ör. 49,90"
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
            <span className="font-ops-body text-[11px] leading-[1.5] text-ops-muted">
              Müşteri yalnız bu fiyatı görür. Paket fiyatı sabittir — kupon ve genel indirim pakete uygulanmaz.
              “Kaç kişilik” boş bırakılırsa müşteri tarafında o künye satırı hiç çizilmez.
            </span>
          </FormSection>

          {/* Paylar burada TÜRETİLİR: editör yalnız alan yazar (`setValue`), formun sahibi bu dialog. */}
          <BundleItemsEditor control={control} pool={pool} setValue={form.setValue} />
        </div>
      </form>
    </Dialog>
  );
}
