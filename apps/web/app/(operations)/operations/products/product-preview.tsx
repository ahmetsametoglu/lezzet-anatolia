import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/operation/badge';
import { AlertIcon, CheckIcon, ImageIcon, InfoIcon } from '@/components/operation/icons';
import { ALL_LANGS, type LangCode, type ProductView } from './products-types';

// Seçili ürün paneli — Ürünler ekranının sağ sütunu. SALT görünüm: türetilmiş bilgi gösterir,
// düzenleme modal'da (Düzenle) yapılır. Fiyat/stok burada düzenlenmez, kendi ekranlarına köprü verir.

function StatusBadge({ product }: { product: ProductView }) {
  if (product.status === 'candidate') return <Badge tone="blue">Aday</Badge>;
  if (product.status === 'passive') return <Badge tone="neutral">Pasif</Badge>;
  return <Badge tone="olive">Aktif</Badge>;
}

// Bir dilin içerik kartı: dolu (olive) ya da eksik (amber, öneri hazır).
function LangCard({ code, filled }: { code: LangCode; filled: boolean }) {
  return (
    <div
      className={[
        'flex flex-1 flex-col gap-0.5 rounded-ops-card border px-2.5 py-2',
        filled ? 'border-[#cdd8b6] bg-[#f2f6ea]' : 'border-[#ecd9b4] bg-[#fdf7ec]',
      ].join(' ')}
    >
      <span className={['font-ops-display text-[11px] font-semibold', filled ? 'text-ops-olive-dark' : 'text-ops-amber'].join(' ')}>
        {code}
      </span>
      <span className={['font-ops-body text-[10.5px]', filled ? 'text-[#6a8a3a]' : 'text-[#b98a3a]'].join(' ')}>
        {filled ? 'dolu' : 'eksik — öneri hazır'}
      </span>
    </div>
  );
}

function Spec({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-ops-card border border-ops-line bg-white px-[11px] py-[9px]">
      <span className="font-ops-display text-[10px] font-medium uppercase tracking-[0.06em] text-ops-muted">{label}</span>
      <span className={['font-ops-body text-[13px] font-medium', warn ? 'text-ops-amber' : 'text-ops-ink'].join(' ')}>{value}</span>
    </div>
  );
}

// Duruma göre bilgi kutusu: aday (mavi) / içerik eksik (amber) / tam (olive).
function DeclarationNote({ product }: { product: ProductView }) {
  const missing = ALL_LANGS.filter((l) => !product.filledLangs.includes(l));

  let cls: string;
  let icon: ReactNode;
  let text: string;
  if (product.status === 'candidate') {
    cls = 'border-[#bcd0e0] bg-[#eef4f9] text-[#2f5a78] [--ic:#3a6b8a]';
    icon = <InfoIcon />;
    text =
      'Aday ürün — satılamaz, yalnız keşifte görünür. Varyant · stok · fiyat tamamlanınca "Etkinleştir" ile satılabilir yapılır.';
  } else if (missing.length > 0) {
    cls = 'border-[#ecd9b4] bg-[#fdf7ec] text-[#8a6410] [--ic:#9a6416]';
    icon = <AlertIcon />;
    text = `Çok dilli içerik eksik — ${missing.join(', ')} açıklaması boş. Müşteri sayfasındaki içeriği besler; tamamlanana dek işaretli kalır.`;
  } else {
    cls = 'border-[#cdd8b6] bg-[#f2f6ea] text-[#3f5a2a] [--ic:#4a6121]';
    icon = <CheckIcon />;
    text = 'İçerik tam, üç dil dolu, satışta. Fiyat kanala göre Fiyatlar ekranında, partiler Stok ekranında yönetilir.';
  }
  return (
    <div className={['flex items-start gap-2.5 rounded-[9px] border px-3.5 py-[11px]', cls].join(' ')}>
      <span className="flex-none text-[color:var(--ic)]">{icon}</span>
      <span className="font-ops-body text-[12px] leading-[1.5]">{text}</span>
    </div>
  );
}

interface ProductPreviewProps {
  product: ProductView | null;
  onEdit: () => void;
}

export function ProductPreview({ product, onEdit }: ProductPreviewProps) {
  return (
    <div className="flex min-h-0 flex-col overflow-y-auto bg-ops-subtle">
      {/* Sticky başlık */}
      <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-ops-line bg-ops-subtle px-5 py-[11px]">
        <span className="font-ops-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ops-muted">
          Seçili ürün · önizleme
        </span>
        <span className="rounded-md bg-ops-line px-2 py-0.5 font-ops-display text-[10px] font-medium text-ops-muted">
          salt görünüm · Düzenle ile aç
        </span>
      </div>

      {product === null ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center font-ops-body text-[13px] text-ops-faint">
          Ayrıntı için bir ürün seçin
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 px-5 py-4">
          {/* Kimlik */}
          <div className="flex items-center gap-3">
            <div className="grid h-[66px] w-[66px] flex-none place-items-center rounded-[10px] border border-[#e0e2da] bg-[#e9eae4] text-[#b3b7ac]">
              <ImageIcon />
            </div>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="font-ops-display text-[17px] font-semibold text-ops-ink">{product.name}</span>
              <span className="font-ops-body text-[12px] text-ops-muted">
                {product.category} · slug: {product.slug}
              </span>
              <div className="mt-0.5 flex gap-1.5">
                <StatusBadge product={product} />
                <Badge tone="neutral">{product.variantCount} varyant</Badge>
              </div>
            </div>
          </div>

          {/* Çok dilli içerik */}
          <div className="flex flex-col gap-2">
            <span className="font-ops-display text-[10.5px] font-medium uppercase tracking-[0.1em] text-ops-muted">
              Çok dilli içerik
            </span>
            <div className="flex gap-2">
              {ALL_LANGS.map((code) => (
                <LangCard key={code} code={code} filled={product.filledLangs.includes(code)} />
              ))}
            </div>
            <span className="font-ops-body text-[11px] text-ops-olive">✦ AI çeviri önerisi — eksik dilleri doldur</span>
          </div>

          {/* Özellikler */}
          <div className="grid grid-cols-2 gap-[9px]">
            <Spec label="KDV" value={`%${product.vatRate}`} />
            <Spec label="Tarih tipi" value={product.dateType === 'DLC' ? 'DLC (güvenlik)' : 'DDM (kalite)'} />
            <Spec label="Raf ömrü" value={product.shelfLifeDays != null ? `${product.shelfLifeDays} gün` : '—'} />
            <Spec label="Kargo izni" value={product.shippable ? 'Açık' : 'Kapalı · soğuk zincir'} warn={!product.shippable} />
            <Spec label="Net ağırlık" value={product.netWeightG != null ? `${product.netWeightG} g` : '—'} />
            <Spec label="Koleksiyon" value={product.collections.length > 0 ? product.collections.join(', ') : '—'} />
          </div>

          {/* Durum notu */}
          <DeclarationNote product={product} />

          {/* Köprüler + Düzenle */}
          <div className="flex gap-2 border-t border-ops-line pt-3">
            <Link
              href="/operations/prices"
              className="flex-1 rounded-ops-btn border border-[#cdd8b6] py-[9px] text-center font-ops-display text-[12px] font-semibold text-ops-olive hover:bg-ops-olive-bg"
            >
              Fiyatlar →
            </Link>
            <Link
              href="/operations/stock"
              className="flex-1 rounded-ops-btn border border-[#cdd8b6] py-[9px] text-center font-ops-display text-[12px] font-semibold text-ops-olive hover:bg-ops-olive-bg"
            >
              Stok →
            </Link>
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 cursor-pointer rounded-ops-btn bg-ops-ink py-[9px] text-center font-ops-display text-[12px] font-semibold text-ops-card hover:bg-[#33372e]"
            >
              Düzenle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
