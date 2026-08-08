'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CollectionInsertSchema, DEFAULT_CROP_FIELDS, ImageCropFieldsSchema, pickCropFields, resolveLocalizedText, type Collection } from '@lezzet/types';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { SortableList } from '@/components/operation/ui/sortable-list';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormInput } from '@/components/operation/form/form-input';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { ImageCropField } from '@/components/operation/form/image-crop-field';
import { useImageCrop } from '@/components/operation/form/use-image-crop.hook';
import { LocaleCard } from '@/components/operation/form/locale-card';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { suggestTranslationAction } from '@/lib/ai/translate';
import {
  createCatalogAction,
  loadCollectionMembersAction,
  searchCollectionProductsAction,
  updateCatalogAction,
  uploadCatalogImageAction,
  type CollectionProductOption,
} from './actions';
import type { CatalogKind } from '../../products-types';

// Kategori/Koleksiyon oluştur + düzenle — tek dialog, `kind` ile çatallanır (no-duplication).
//
// KATEGORİ tek kısa alan (ad) → diller doğrudan alt alta (`layout="stacked"`), sekme yok. Görseli
// anasayfa kategori şeridinde görünür (masaüstü web 3:2 kart, mobil webde daire) → kaynak 3:2
// (`role="category"`).
// KOLEKSİYON çok dilli İKİ alan taşır (ad + açıklama) → ikisi bir DİL KARTINDA toplanır: kartın içi
// seçili dilin alanı, dışı dilden bağımsız (slug/kapak/aktiflik). Kip görünür olur.
// Koleksiyon ayrıca paylaşılabilir bir vitrin sayfasıdır (DOMAIN §13): slug + kapak + açıklama OG
// kartını besler — kapak müşteri SAYFASINDA render edilmez (`role="collection"`, 16:9).
// Üyeler sağ bölmede GÖRSELLİ ve SÜRÜKLE-SIRALANIR liste — sıra vitrin kürasyonudur.
// GÖRSEL her iki türde de aynı bileşenle yönetilir; yalnız `role` (oran) ve bağlam etiketi değişir.

// Dialogun öndolduracağı alanlar — ŞEMADAN TÜRETİLİR (elle interface yazılmaz, no-duplication): kimlik/
// içerik/aktiflik/kapak-künyesi Collection'dan pick'lenir. `imageUrl` (public URL) ve `productIds`
// (join) şemada değil, yalnızca view'a ait türev alanlardır → ayrıca eklenir.
type CatalogEditTarget = Pick<Collection, 'id' | 'name' | 'description' | 'slug' | 'isActive' | 'imageFocalX' | 'imageFocalY' | 'imageZoom'> & {
  imageUrl: string | null;
  productIds: string[];
};

// Form şeması koleksiyon insert şemasından TÜRETİLİR (tek kaynak): formda olmayanlar çıkarılır,
// isActive daraltılır, üyelik + kapak odak/zoom eklenir. Tip elle yazılmaz — z.infer.
const FormSchema = CollectionInsertSchema.omit({ imageKey: true, imageAlt: true, sortOrder: true })
  .extend({
    isActive: z.boolean(),
    productIds: z.array(z.string()),
  })
  .merge(ImageCropFieldsSchema); // kapak odak/zoom alanları ortak şemadan (elle yazılmaz)
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
  /** Üyelik bölmesi çizilsin mi — yalnız koleksiyonda. Havuz DIŞARIDAN gelmez: seçici sunucuda arar. */
  withMembers?: boolean;
  onClose: () => void;
}

export function CatalogFormDialog({ kind, edit, withMembers, onClose }: CatalogFormDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[kind];
  const isEdit = edit !== undefined;
  const isCollection = kind === 'collection';
  const showMembers = isCollection && withMembers === true;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: edit?.name ?? {},
      description: edit?.description ?? null,
      slug: edit?.slug ?? '',
      isActive: edit?.isActive ?? true,
      productIds: edit?.productIds ?? [],
      ...(edit ? pickCropFields(edit) : DEFAULT_CROP_FIELDS),
    },
    mode: 'onChange',
  });

  // Dil kartının doluluk ipucu ada bakar (zorunlu alan); üyelik listesi seçili id'lerden kurulur.
  const nameValue = form.watch('name');
  const productIds = form.watch('productIds');
  const setProductIds = (ids: string[]) => form.setValue('productIds', ids, { shouldDirty: true });
  const [crop, setCrop] = useImageCrop(form);

  // Üyelerin künyesi SUNUCUDAN, kimlikten çözülür. Eskiden ekranın yüklenmiş ilk sayfasından
  // çözülüyordu: havuzda olmayan üye listeden düşüyor, sıralama kaydedilince koleksiyondan da
  // siliniyordu. Künyesi henüz gelmemiş bir üye ARTIK DA DÜŞMEZ — kimliğiyle çizilir.
  const [known, setKnown] = useState<Map<string, CollectionProductOption>>(new Map());
  const [found, setFound] = useState<CollectionProductOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!showMembers) return;
    const ids = edit?.productIds ?? [];
    if (ids.length === 0) return;
    void loadCollectionMembersAction(ids).then(({ data }) => {
      if (data) setKnown((prev) => new Map([...prev, ...data.map((p) => [p.id, p] as const)]));
    });
  }, [showMembers, edit?.productIds]);

  const onMemberSearch = (term: string) => {
    setSearching(true);
    void searchCollectionProductsAction(term).then(({ data }) => {
      setFound(data ?? []);
      if (data) setKnown((prev) => new Map([...prev, ...data.map((p) => [p.id, p] as const)]));
      setSearching(false);
    });
  };

  const members = productIds.map((id) => known.get(id) ?? { id, name: {}, imageUrl: null, categoryName: '' });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { name, description, slug, isActive, productIds: ids } = values;
    // Kırpma künyesi İKİ türde de gider (kategori görseli + koleksiyon OG kapağı); açıklama/üyelik
    // yalnız koleksiyonda anlamlı.
    const payload = {
      name,
      isActive,
      ...pickCropFields(values),
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

  // Görsel alanı TEK yerde kurulur; yerleşim `kind`'a göre farklı yere koyar (tekrar yok). Rol oranı
  // belirler: kategori 3:2 (anasayfa şeridi · mobil webde daire), koleksiyon 16:9.
  // Yükleme kayıt gerektirir (R2 anahtarı slug'a bağlı) → oluşturmada istem gösterilir.
  //
  // **Koleksiyon etiketi 08.08'de genişledi.** Eskiden "paylaşım kartı (OG)" yazıyordu ve o gün
  // doğruydu — 05.7 kararı koleksiyon görselinin müşteri sayfasında HİÇ render edilmediğini,
  // yalnız OG kartını beslediğini söylüyordu. `Musteri - Anasayfa.dc.html`'in 08.08 senkronu ana
  // sayfaya iki slotluk Koleksiyonlar bölümü ekledi ve kapak orada 16:7 band olarak çizim yüzeyine
  // çıktı (`design/KARARLAR.md`). Aynı kapak iki yerde iki kırpımla kullanılıyor; yeni bir görsel
  // alanı AÇILMADI. Etiket dar kalsaydı operatör kapağı "kimsenin görmediği bir paylaşım
  // detayı" sanır ve kadrajına özen göstermezdi — oysa artık vitrinin ilk ekranında duruyor.
  const imageField = (
    <ImageCropField
      role={isCollection ? 'collection' : 'category'}
      src={isEdit ? edit.imageUrl : null}
      crop={crop}
      onCropChange={setCrop}
      upload={isEdit ? (fd) => uploadCatalogImageAction(kind, edit.id, fd) : undefined}
      uploadDisabledHint="Kaydedince eklenebilir — depo anahtarı slug'a bağlı."
      caption={isCollection ? 'ana sayfa bandı + paylaşım kartı' : 'müşteride görünüm'}
    />
  );

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
      {/* Üç sütun (koleksiyon): kapak+link · içerik · üyeler. Kategoride tek sütun: görsel + ad. */}
      <form id={FORM_ID} onSubmit={onSubmit} className={showMembers ? 'grid grid-cols-[300px_minmax(0,1fr)_290px] gap-6' : 'flex flex-col gap-4'}>
        {/* ── 1. Görsel (+ koleksiyonda paylaşım linki) ── */}
        {showMembers ? (
          <div className="flex flex-col gap-4">
            {imageField}

            {/* Paylaşım linki: oluşturmada seçilebilir, düzenlemede SABİT (paylaşılmış link kırılmasın) */}
            {isEdit ? (
              <FieldShell label="Paylaşım linki" labelAside="sabit">
                <span className="break-all font-ops-mono text-ops-sm text-ops-body">/{edit.slug}</span>
              </FieldShell>
            ) : (
              <FormInput control={form.control} name="slug" label="Paylaşım linki (slug)" labelAside="boşsa addan üretilir" placeholder="ör. bayram-sofrasi" mono />
            )}
          </div>
        ) : (
          imageField
        )}

        {/* ── 2. İçerik bölmesi ── */}
        <div className="flex flex-col gap-4">
          {isCollection ? (
            <LocaleCard title="İçerik" completenessOf={nameValue}>
              {(lang) => (
                <>
                  {/* Alan türü geçiliyor: kategori/koleksiyon ADI kısa bir vitrin metni, açıklaması
                      ise paylaşım kartında okunan bir cümle — ikisi aynı ölçüde çevrilmemeli. */}
                  <FormLocalizedText control={form.control} name="name" label="Ad" required placeholder="Ad" lang={lang} onAiTranslate={(t) => suggestTranslationAction(t, 'ad')} />
                  <FormLocalizedText
                    control={form.control}
                    name="description"
                    label="Açıklama (paylaşım kartında görünür)"
                    multiline
                    rows={3}
                    placeholder="Açıklama"
                    lang={lang}
                    onAiTranslate={(t) => suggestTranslationAction(t, 'aciklama')}
                  />
                </>
              )}
            </LocaleCard>
          ) : (
            <FormLocalizedText control={form.control} name="name" label="Ad" required placeholder="Ad" layout="stacked" onAiTranslate={(t) => suggestTranslationAction(t, 'ad')} />
          )}

        </div>

        {/* ── 3. Üyelik bölmesi (yalnız koleksiyon) ── */}
        {showMembers ? (
          <div className="flex min-h-0 flex-col gap-2.5 border-l border-ops-line pl-6">
            <div className="flex items-baseline gap-2">
              <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">Ürünler</span>
              <span className="font-ops-mono text-ops-sm text-ops-strong">{members.length}</span>
              <span className="ml-auto font-ops-body text-ops-micro text-ops-faint">sıra = vitrin sırası</span>
            </div>

            {/* Çerçeve YOK — satır ayraçları listeyi zaten okunur kılıyor, kutu içinde kutu olmasın. */}
            <div className="min-h-0 max-h-[340px] overflow-y-auto">
              {members.length === 0 ? (
                <div className="py-6 text-center font-ops-body text-ops-sm text-ops-faint">
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
                        <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">
                          {resolveLocalizedText(p.name) || 'yükleniyor…'}
                        </span>
                        <span className="truncate font-ops-body text-ops-micro text-ops-muted">{p.categoryName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProductIds(productIds.filter((id) => id !== p.id))}
                        aria-label="Koleksiyondan çıkar"
                        className="flex-none cursor-pointer px-1 font-ops-body text-ops-base text-ops-faint hover:text-ops-red"
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
              options={found.map((p) => ({ value: p.id, label: resolveLocalizedText(p.name), imageUrl: p.imageUrl }))}
              selected={productIds}
              onChange={setProductIds}
              hideSelected
              onSearch={onMemberSearch}
              loading={searching}
              addLabel="+ ürün ekle"
              searchPlaceholder="Ürün ara…"
              emptyText="Eşleşen ürün yok"
            />
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
