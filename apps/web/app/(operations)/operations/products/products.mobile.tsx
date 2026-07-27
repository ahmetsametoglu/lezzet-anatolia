'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/operation/ui/chip';
import { CameraIcon } from '@/components/operation/ui/icons';
import { Input } from '@/components/operation/form/input';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Toggle, ToggleField } from '@/components/operation/form/toggle';
import { resolveLocalizedText } from '@lezzet/types';
import { ImageUploadButton } from '@/components/operation/ui/image-upload-button';
import { updateProductNameAction, uploadProductImageAction } from './tabs/product/actions';
import { productStatus, type ProductView, type ProductsViewProps } from './products-types';

// Ürünler — mobil: sahada en sık iş. Liste (arama · süzgeç · aktiflik) + satıra dokununca hızlı
// düzenleme bottom-sheet'i (ad · aktiflik · koleksiyon · kameradan görsel). Aktiflik toggle'ı KALICI
// (server action). Yoğun giriş (çok dilli, paket, marj) web'de kalır. Ad kaydı sonraki dilim.

// ── Hızlı düzenleme bottom-sheet ─────────────────────────────────────────────
function QuickEditSheet({
  product,
  onToggleActive,
  onClose,
}: {
  product: ProductView;
  onToggleActive: (id: string, isActive: boolean) => void;
  onClose: () => void;
}) {
  const displayName = resolveLocalizedText(product.name);
  const [name, setName] = useState(displayName);
  const [active, setActive] = useState(productStatus(product) === 'active');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    startTransition(async () => {
      if (name.trim() && name.trim() !== displayName) {
        const { error: actionError } = await updateProductNameAction(product.id, name);
        if (actionError) {
          setError(actionError);
          return;
        }
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex flex-col justify-end bg-ops-scrim">
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-3.5 rounded-t-[20px] bg-ops-card p-4">
        <span className="mx-auto h-[5px] w-[42px] rounded-[3px] bg-ops-gray-500" />
        <div className="flex items-center gap-3">
          <Thumbnail src={product.imageUrl} alt={displayName} size={56} iconSize={22} />
          <div className="flex flex-col gap-0.5">
            <span className="font-ops-display text-[16px] font-semibold text-ops-ink">{displayName}</span>
            <span className="font-ops-body text-[12px] text-ops-muted">
              {product.categoryName} · {product.variants.length} varyant
            </span>
          </div>
        </div>

        <ImageUploadButton
          upload={(form) => uploadProductImageAction(product.id, form)}
          camera
          className="flex items-center justify-center gap-2 rounded-[11px] border border-ops-olive-line bg-ops-olive-bg px-3 py-3 font-ops-display text-[12.5px] font-semibold text-ops-olive-dark disabled:opacity-60"
        >
          <CameraIcon />
          Kameradan görsel çek / değiştir
        </ImageUploadButton>

        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-[11px] font-medium uppercase tracking-[0.06em] text-ops-muted">Ürün adı</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {/* Aktiflik KALICI — anında server action */}
        <ToggleField
          label="Satışta (aktif)"
          on={active}
          onChange={(next) => {
            setActive(next);
            onToggleActive(product.id, next);
          }}
        />

        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-[11px] font-medium uppercase tracking-[0.06em] text-ops-muted">Koleksiyonlar</span>
          <div className="flex flex-wrap gap-[7px]">
            {product.collectionNames.length === 0 ? (
              <span className="font-ops-body text-[12px] text-ops-faint">Koleksiyon yok</span>
            ) : (
              product.collectionNames.map((c) => (
                <Chip key={c} active tone="olive" className="!bg-ops-olive-bg !text-ops-olive-dark">
                  {c} ✕
                </Chip>
              ))
            )}
            <Chip dashed>+ ekle</Chip>
          </div>
        </div>

        {error ? <span className="text-center font-ops-body text-[11px] text-ops-red">{error}</span> : null}
        <span className="text-center font-ops-body text-[11px] leading-[1.5] text-ops-muted">
          Fiyat, çok dilli metin ve paket kurma web&apos;de — burada yalnız hızlı düzeltme.
        </span>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-xl bg-ops-ink px-4 py-3.5 text-center font-ops-display text-[15px] font-semibold text-ops-card disabled:opacity-60"
        >
          {pending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}

// ── Mobil liste ──────────────────────────────────────────────────────────────
export function ProductsMobile({
  data,
  products,
  search,
  onSearch,
  catFilter,
  onCatFilter,
  openCreate,
  onToggleActive,
  hasMore,
  loadingMore,
  onLoadMore,
}: ProductsViewProps) {
  const [sheetId, setSheetId] = useState<string | null>(null);
  // Sheet kaydı GÖRÜNEN listeden çözülür (eklenen sayfalar dahil) — ilk sayfayla sınırlı kalmasın.
  const sheetProduct = products.find((p) => p.id === sheetId) ?? null;

  return (
    <div className="flex h-full flex-col bg-ops-card">
      {/* Başlık */}
      <div className="flex items-center justify-between border-b border-ops-line px-4 py-3.5">
        <span className="font-ops-display text-[17px] font-semibold text-ops-ink">Ürünler</span>
        <button
          type="button"
          onClick={openCreate}
          className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-ops-btn bg-ops-ink font-ops-display text-lg font-semibold text-ops-card"
        >
          +
        </button>
      </div>

      {/* Arama + süzgeç (İşlevsel) */}
      <div className="flex flex-col gap-2.5 px-4 py-3">
        <SearchInput value={search} onChange={onSearch} placeholder="Ürün ara…" className="w-full" />
        <div className="flex flex-wrap gap-[7px]">
          <Chip active={catFilter === 'all'} onClick={() => onCatFilter('all')}>
            Tümü
          </Chip>
          {data.categories.map((c) => (
            <Chip key={c.id} active={catFilter === c.id} onClick={() => onCatFilter(c.id)}>
              {resolveLocalizedText(c.name)}
            </Chip>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {products.map((p) => (
          <div
            key={p.id}
            onClick={() => setSheetId(p.id)}
            className="flex w-full cursor-pointer items-center gap-3 border-b border-ops-line-soft py-2.5 text-left"
          >
            <Thumbnail src={p.imageUrl} alt={resolveLocalizedText(p.name)} size={42} iconSize={17} className="!rounded-[9px]" />
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate font-ops-body text-[13.5px] font-semibold text-ops-ink">{resolveLocalizedText(p.name)}</span>
              <span className="font-ops-body text-[11px] text-ops-muted">
                {p.categoryName} · {p.variants.length} varyant
              </span>
            </div>
            {/* Satır sheet açar; toggle ayrı iş → yayılımı durdur */}
            <span onClick={(e) => e.stopPropagation()}>
              <Toggle on={productStatus(p) === 'active'} onChange={(next) => onToggleActive(p.id, next)} label={`${resolveLocalizedText(p.name)} satışta`} />
            </span>
          </div>
        ))}
        {products.length === 0 ? (
          <div className="p-10 text-center font-ops-body text-[13px] text-ops-faint">Bu süzgeçte ürün yok.</div>
        ) : null}
        {/* Sona-yaklaşınca yükleme — masaüstü tablosuyla AYNI bileşen (tek kaynak). */}
        <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
      </div>

      {sheetProduct ? (
        <QuickEditSheet product={sheetProduct} onToggleActive={onToggleActive} onClose={() => setSheetId(null)} />
      ) : null}
    </div>
  );
}
