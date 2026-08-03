'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BottomSheet } from '@/components/operation/ui/bottom-sheet';
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
import { type ProductView, type ProductsViewProps } from './products-types';

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
  const [active, setActive] = useState(product.status === 'active');
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
    // Ortak alt tabaka (03.08): bu kalıp burada ve Talepler'de ayrı ayrı yazılmıştı ve ayrışmıştı
    // (z-index, köşe yarıçapı token'ı, tutamak ölçüsü). Tanım artık `ui/bottom-sheet`'te.
    <BottomSheet label="Ürün hızlı bakış" onClose={onClose}>
      <>
        <div className="flex items-center gap-3">
          <Thumbnail src={product.imageUrl} alt={displayName} size={56} iconSize={22} />
          <div className="flex flex-col gap-0.5">
            <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{displayName}</span>
            <span className="font-ops-body text-ops-sm text-ops-muted">
              {product.categoryName} · {product.variants.length} varyant
            </span>
          </div>
        </div>

        <ImageUploadButton
          upload={(form) => uploadProductImageAction(product.id, form)}
          camera
          className="flex items-center justify-center gap-2 rounded-[11px] border border-ops-olive-line bg-ops-olive-bg px-3 py-3 font-ops-display text-ops-sm font-semibold text-ops-olive-dark disabled:opacity-60"
        >
          <CameraIcon />
          Kameradan görsel çek / değiştir
        </ImageUploadButton>

        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-ops-xs font-medium uppercase tracking-[0.06em] text-ops-muted">Ürün adı</span>
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

        {/* Koleksiyonlar burada YALNIZ GÖRÜNÜR. Çiplerde "✕" ve "+ ekle" duruyordu ama hiçbiri
            bağlı değildi — dokunulunca hiçbir şey olmuyordu; işlev vaat eden ölü kontrol, olmayan
            bir yetenekten daha kötüdür.

            Üyelik koleksiyon TARAFINDAN kurulur ve bu keyfi değil: üyelik dizisi aynı zamanda
            VİTRİN SIRASIDIR (kürasyon). Ürün tarafından "ekle" demek, sıranın neresine gireceğine
            karar vermeden eklemek olurdu. */}
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-ops-xs font-medium uppercase tracking-[0.06em] text-ops-muted">Koleksiyonlar</span>
          <div className="flex flex-wrap gap-[7px]">
            {product.collectionNames.length === 0 ? (
              <span className="font-ops-body text-ops-sm text-ops-faint">Koleksiyon yok</span>
            ) : (
              product.collectionNames.map((c) => (
                <Chip key={c} active tone="olive" className="!bg-ops-olive-bg !text-ops-olive-dark">
                  {c}
                </Chip>
              ))
            )}
          </div>
          <span className="font-ops-body text-ops-micro text-ops-muted">
            Üyelik ve vitrin sırası koleksiyonun kendi formunda kurulur (web).
          </span>
        </div>

        {error ? <span className="text-center font-ops-body text-ops-xs text-ops-red">{error}</span> : null}
        <span className="text-center font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
          Fiyat, çok dilli metin ve paket kurma web&apos;de — burada yalnız hızlı düzeltme.
        </span>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-xl bg-ops-ink px-4 py-3.5 text-center font-ops-display text-ops-lead font-semibold text-ops-card disabled:opacity-60"
        >
          {pending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </>
    </BottomSheet>
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
        <span className="font-ops-display text-ops-section font-semibold text-ops-ink">Ürünler</span>
        <button
          type="button"
          onClick={openCreate}
          className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-ops-btn bg-ops-ink font-ops-display text-ops-section font-semibold text-ops-card"
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
            <Thumbnail src={p.imageUrl} alt={resolveLocalizedText(p.name)} size={42} iconSize={17} className="!rounded-ops-card" />
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{resolveLocalizedText(p.name)}</span>
              <span className="font-ops-body text-ops-xs text-ops-muted">
                {p.categoryName} · {p.variants.length} varyant
              </span>
            </div>
            {/* Satır sheet açar; toggle ayrı iş → yayılımı durdur */}
            <span onClick={(e) => e.stopPropagation()}>
              <Toggle on={p.status === 'active'} onChange={(next) => onToggleActive(p.id, next)} label={`${resolveLocalizedText(p.name)} satışta`} />
            </span>
          </div>
        ))}
        {products.length === 0 ? (
          <div className="p-10 text-center font-ops-body text-ops-base text-ops-faint">Bu süzgeçte ürün yok.</div>
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
