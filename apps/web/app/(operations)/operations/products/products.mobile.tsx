'use client';

import { useState } from 'react';
import { Chip } from '@/components/operation/chip';
import { CameraIcon, ImageIcon } from '@/components/operation/icons';
import { SearchInput } from '@/components/operation/search-input';
import { Toggle, ToggleField } from '@/components/operation/toggle';
import type { ProductView, ProductsViewProps } from './products-types';

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
  const [name, setName] = useState(product.name);
  const [active, setActive] = useState(product.status === 'active');

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(34,39,43,0.35)]">
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-3.5 rounded-t-[20px] bg-ops-card p-4">
        <span className="mx-auto h-[5px] w-[42px] rounded-[3px] bg-[#d4d7ce]" />
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 flex-none place-items-center rounded-[10px] border border-[#e0e2da] bg-[#e9eae4] text-[#b3b7ac]">
            <ImageIcon size={22} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-ops-display text-[16px] font-semibold text-ops-ink">{product.name}</span>
            <span className="font-ops-body text-[12px] text-ops-muted">
              {product.category} · {product.variantCount} varyant
            </span>
          </div>
        </div>

        <button
          type="button"
          className="flex items-center justify-center gap-2 rounded-[11px] border border-[#cdd8b6] bg-[#f2f6ea] px-3 py-3 font-ops-display text-[12.5px] font-semibold text-ops-olive-dark"
        >
          <CameraIcon />
          Kameradan görsel çek / değiştir
        </button>

        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-[11px] font-medium uppercase tracking-[0.06em] text-ops-muted">Ürün adı</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-[9px] border border-ops-line-strong px-[13px] py-[11px] font-ops-body text-[13.5px] text-ops-ink outline-none focus:border-ops-olive"
          />
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
            {product.collections.length === 0 ? (
              <span className="font-ops-body text-[12px] text-ops-faint">Koleksiyon yok</span>
            ) : (
              product.collections.map((c) => (
                <Chip key={c} active tone="olive" className="!bg-ops-olive-bg !text-ops-olive-dark">
                  {c} ✕
                </Chip>
              ))
            )}
            <Chip dashed>+ ekle</Chip>
          </div>
        </div>

        <span className="text-center font-ops-body text-[11px] leading-[1.5] text-ops-muted">
          Fiyat, çok dilli metin ve paket kurma web&apos;de — burada yalnız hızlı düzeltme.
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-ops-ink px-4 py-3.5 text-center font-ops-display text-[15px] font-semibold text-ops-card"
        >
          Kapat
        </button>
      </div>
    </div>
  );
}

// ── Mobil liste ──────────────────────────────────────────────────────────────
export function ProductsMobile({
  data,
  visibleProducts,
  search,
  onSearch,
  catFilter,
  onCatFilter,
  openCreate,
  onToggleActive,
}: ProductsViewProps) {
  const [sheetId, setSheetId] = useState<string | null>(null);
  const sheetProduct = data.products.find((p) => p.id === sheetId) ?? null;

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
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {visibleProducts.map((p) => (
          <div
            key={p.id}
            onClick={() => setSheetId(p.id)}
            className="flex w-full cursor-pointer items-center gap-3 border-b border-ops-line-soft py-2.5 text-left"
          >
            <div className="grid h-[42px] w-[42px] flex-none place-items-center rounded-[9px] border border-[#e0e2da] bg-[#e9eae4] text-[#b3b7ac]">
              <ImageIcon size={17} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate font-ops-body text-[13.5px] font-semibold text-ops-ink">{p.name}</span>
              <span className="font-ops-body text-[11px] text-ops-muted">
                {p.category} · {p.variantCount} varyant
              </span>
            </div>
            {/* Satır sheet açar; toggle ayrı iş → yayılımı durdur */}
            <span onClick={(e) => e.stopPropagation()}>
              <Toggle on={p.status === 'active'} onChange={(next) => onToggleActive(p.id, next)} label={`${p.name} satışta`} />
            </span>
          </div>
        ))}
        {visibleProducts.length === 0 ? (
          <div className="p-10 text-center font-ops-body text-[13px] text-ops-faint">Bu süzgeçte ürün yok.</div>
        ) : null}
      </div>

      {sheetProduct ? (
        <QuickEditSheet product={sheetProduct} onToggleActive={onToggleActive} onClose={() => setSheetId(null)} />
      ) : null}
    </div>
  );
}
