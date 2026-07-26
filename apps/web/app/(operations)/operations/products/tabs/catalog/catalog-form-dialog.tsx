'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CollectionInsertSchema, resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { ImageUploadButton } from '@/components/operation/ui/image-upload-button';
import { SortableList } from '@/components/operation/ui/sortable-list';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormInput } from '@/components/operation/form/form-input';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { LocaleCard } from '@/components/operation/form/locale-card';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { suggestTranslationAction } from '../../actions/translate';
import { createCatalogAction, updateCatalogAction, uploadCollectionImageAction } from './actions';
import type { CatalogKind, ProductView } from '../../products-types';

// Kategori/Koleksiyon oluştur + düzenle — tek dialog, `kind` ile çatallanır (no-duplication).
//
// KATEGORİ tek kısa alan (ad) → diller doğrudan alt alta (`layout="stacked"`), sekme yok.
// KOLEKSİYON çok dilli İKİ alan taşır (ad + açıklama) → ikisi bir DİL KARTINDA toplanır: kartın içi
// seçili dilin alanı, dışı dilden bağımsız (slug/kapak/aktiflik). Kip görünür olur.
// Koleksiyon ayrıca paylaşılabilir bir vitrin sayfasıdır (DOMAIN §13): slug + kapak görseli + açıklama
// OG kartını besler. Üyeler sağ bölmede GÖRSELLİ ve SÜRÜKLE-SIRALANIR liste — sıra vitrin kürasyonudur.

interface CatalogEditTarget {
  id: string;
  name: LocalizedText;
  description: LocalizedText | null;
  slug: string;
  isActive: boolean;
  /** Kapak görselinin imzalı okuma URL'i (yoksa null). */
  imageUrl: string | null;
  /** Mevcut üyelik, vitrin sırasında. */
  productIds: string[];
}

// Form şeması koleksiyon insert şemasından TÜRETİLİR (tek kaynak): formda olmayanlar çıkarılır,
// slug/isActive daraltılır, üyelik eklenir. Tip elle yazılmaz — z.infer.
const FormSchema = CollectionInsertSchema.omit({ imageKey: true, sortOrder: true }).extend({
  isActive: z.boolean(),
  productIds: z.array(z.string()),
});
type FormValues = z.infer<typeof FormSchema>;

const COPY: Record<CatalogKind, { createTitle: string; editTitle: string; sub: string }> = {
  category: {
    createTitle: 'Yeni kategori',
    editTitle: 'Kategoriyi düzenle',
    sub: 'Ürünün yapısal grubu (düz, tek seviye)',
  },
  collection: {
    createTitle: 'Yeni koleksiyon',
    editTitle: 'Koleksiyonu düzenle',
    sub: 'Esnek pazarlama grubu · kendi paylaşım linkiyle vitrin sayfası',
  },
};

const FORM_ID = 'catalog-form';

interface CatalogFormDialogProps {
  kind: CatalogKind;
  edit?: CatalogEditTarget;
  /** Üyelik için ürün havuzu — yalnız koleksiyonda verilir. */
  products?: ProductView[];
  onClose: () => void;
}

export function CatalogFormDialog({ kind, edit, products, onClose }: CatalogFormDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[kind];
  const isEdit = edit !== undefined;
  const isCollection = kind === 'collection';
  const showMembers = isCollection && products !== undefined;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: edit?.name ?? {},
      description: edit?.description ?? null,
      slug: edit?.slug ?? '',
      isActive: edit?.isActive ?? true,
      productIds: edit?.productIds ?? [],
    },
    mode: 'onChange',
  });

  // Dil kartının doluluk ipucu ada bakar (zorunlu alan); üyelik listesi seçili id'lerden kurulur.
  const nameValue = form.watch('name');
  const productIds = form.watch('productIds');
  const setProductIds = (ids: string[]) => form.setValue('productIds', ids, { shouldDirty: true });

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const members = productIds.map((id) => productById.get(id)).filter((p): p is ProductView => Boolean(p));

  const onSubmit = form.handleSubmit(async ({ name, description, slug, isActive, productIds: ids }) => {
    setError(null);
    const payload = {
      name,
      isActive,
      ...(isCollection ? { description: description ?? null } : {}),
      ...(showMembers ? { productIds: ids } : {}),
    };
    const { error: actionError } = isEdit
      ? await updateCatalogAction(kind, edit.id, payload)
      : await createCatalogAction(kind, { ...payload, ...(isCollection ? { slug } : {}) });
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
    onClose();
  });

  // Alt bar SOL tarafı = aksiyon bölgesi: aktiflik anahtarı (kayda eşlik eden karar), zorunlu-alan
  // metni değil. Oluşturmada da görünür — pasif (taslak) olarak yaratmak mümkün.
  const footer = (
    <DialogFooter
      formId={FORM_ID}
      onCancel={onClose}
      submitting={form.formState.isSubmitting}
      error={error}
      actions={<FormSwitch control={form.control} name="isActive" label="Aktif (vitrinde görünür)" bare />}
    />
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? copy.editTitle : copy.createTitle}
      subtitle={copy.sub}
      footer={footer}
      maxWidth={showMembers ? 1140 : 460}
    >
      {/* Üç sütun (koleksiyon): kapak+link · içerik · üyeler. Kategoride tek sütun (yalnız ad). */}
      <form id={FORM_ID} onSubmit={onSubmit} className={showMembers ? 'grid grid-cols-[300px_minmax(0,1fr)_290px] gap-6' : 'flex flex-col gap-4'}>
        {/* ── 1. Paylaşım kimliği: kapak görseli + link (ikisi de OG kartını tanımlar) ── */}
        {showMembers ? (
          <div className="flex flex-col gap-4">
            {/* Oran ≈ OG kartı (1.91): kare kutu 1.73:1 kaynağın ~%42'sini kırpıyordu. */}
            <FieldShell label="Kapak" labelAside="OG kartı">
              {isEdit ? (
                <div className="group relative w-full overflow-hidden rounded-[10px]">
                  <Thumbnail src={edit.imageUrl} alt="" fluid ratio={1.91} iconSize={26} />
                  <ImageUploadButton
                    upload={(fd) => uploadCollectionImageAction(edit.id, fd)}
                    className="absolute inset-0 flex cursor-pointer items-center justify-center bg-[rgba(30,33,27,0)] font-ops-display text-[11.5px] font-semibold text-transparent transition-colors duration-150 group-hover:bg-[rgba(30,33,27,0.5)] group-hover:text-white"
                  >
                    {edit.imageUrl ? 'Değiştir' : 'Yükle'}
                  </ImageUploadButton>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Thumbnail src={null} alt="" fluid ratio={1.91} iconSize={26} />
                  <span className="font-ops-body text-[10.5px] leading-[1.5] text-ops-faint">
                    Kaydedince eklenebilir — depo anahtarı slug&apos;a bağlı.
                  </span>
                </div>
              )}
            </FieldShell>

            {/* Paylaşım linki: oluşturmada seçilebilir, düzenlemede SABİT (paylaşılmış link kırılmasın) */}
            {isEdit ? (
              <FieldShell label="Paylaşım linki" labelAside="sabit">
                <span className="break-all font-ops-mono text-[12.5px] text-ops-body">/{edit.slug}</span>
              </FieldShell>
            ) : (
              <FormInput control={form.control} name="slug" label="Paylaşım linki (slug)" labelAside="boşsa addan üretilir" placeholder="ör. bayram-sofrasi" mono />
            )}
          </div>
        ) : null}

        {/* ── 2. İçerik bölmesi ── */}
        <div className="flex flex-col gap-4">
          {isCollection ? (
            <LocaleCard title="İçerik" completenessOf={nameValue}>
              {(lang) => (
                <>
                  <FormLocalizedText control={form.control} name="name" label="Ad" required placeholder="Ad" lang={lang} onAiTranslate={suggestTranslationAction} />
                  <FormLocalizedText
                    control={form.control}
                    name="description"
                    label="Açıklama (paylaşım kartında görünür)"
                    multiline
                    rows={3}
                    placeholder="Açıklama"
                    lang={lang}
                    onAiTranslate={suggestTranslationAction}
                  />
                </>
              )}
            </LocaleCard>
          ) : (
            <FormLocalizedText control={form.control} name="name" label="Ad" required placeholder="Ad" layout="stacked" onAiTranslate={suggestTranslationAction} />
          )}

        </div>

        {/* ── 3. Üyelik bölmesi (yalnız koleksiyon) ── */}
        {showMembers ? (
          <div className="flex min-h-0 flex-col gap-2.5 border-l border-ops-line pl-6">
            <div className="flex items-baseline gap-2">
              <span className="font-ops-display text-[10px] font-medium uppercase tracking-[0.08em] text-ops-muted">Ürünler</span>
              <span className="font-ops-mono text-[12px] text-ops-strong">{members.length}</span>
              <span className="ml-auto font-ops-body text-[10.5px] text-ops-faint">sıra = vitrin sırası</span>
            </div>

            {/* Çerçeve YOK — satır ayraçları listeyi zaten okunur kılıyor, kutu içinde kutu olmasın. */}
            <div className="min-h-0 max-h-[340px] overflow-y-auto">
              {members.length === 0 ? (
                <div className="py-6 text-center font-ops-body text-[12px] text-ops-faint">
                  Henüz ürün yok — aşağıdan ekle.
                </div>
              ) : (
                <SortableList
                  items={members}
                  getId={(p) => p.id}
                  onReorder={setProductIds}
                  renderItem={(p, handle) => (
                    <div className="flex items-center gap-2.5 border-b border-ops-line-soft px-1 py-2 last:border-b-0">
                      {handle}
                      <Thumbnail src={p.imageUrl} alt="" size={30} iconSize={13} className="!rounded-[6px]" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-ops-body text-[12.5px] font-semibold text-ops-ink">{resolveLocalizedText(p.name)}</span>
                        <span className="truncate font-ops-body text-[10.5px] text-ops-muted">{p.categoryName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProductIds(productIds.filter((id) => id !== p.id))}
                        aria-label="Koleksiyondan çıkar"
                        className="flex-none cursor-pointer px-1 font-ops-body text-[13px] text-ops-faint hover:text-ops-red"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                />
              )}
            </div>

            {/* Ekleme: aramalı menü paylaşılan MultiSelect'ten; seçim yukarıda liste olarak sunulduğu
                için çipleri gizleriz (hideSelected) — arama/menü mantığı tek yerde kalır. */}
            <MultiSelect
              options={products.map((p) => ({ value: p.id, label: resolveLocalizedText(p.name), imageUrl: p.imageUrl }))}
              selected={productIds}
              onChange={setProductIds}
              hideSelected
              addLabel="+ ürün ekle"
              searchPlaceholder="Ürün ara…"
            />
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
