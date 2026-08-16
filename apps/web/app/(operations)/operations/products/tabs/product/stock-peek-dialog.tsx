'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { SkeletonRows } from '@/components/operation/ui/skeleton';
import { HistorySkeleton, ProductHistoryPanel } from '@/components/operation/stock/product-history-panel';
import { loadProductStockPeekAction, type ProductStockPeek } from '../../actions/peek';
import type { StockLevelRow } from '@/lib/stock/level-rows';

// Ürünün STOK BAKIŞI — önizleme panelinin "Stok" düğmesi (16.08, kullanıcı kararı: sayfaya
// yönlendirme yerine diyalog; ikinci tur: içerik STOK SAYFASININ ürün geçmişi paneli — "stok
// sayfasında nasıl açılıyorsa burada da öyle"). Panel ORTAK komponenttir
// (`components/operation/stock/product-history-panel`); parti geçmişi, akış denklemi, satış hızı
// ve depo geçişi iki yüzeyde tek gövdeden çizilir.
//
// TEK BOYLU ÜRÜNDE ARA TABLO YOK (fiyat bakışıyla aynı karar): düğme doğrudan geçmiş panelini
// açar. Çok boylu üründe boy × depo tablosu BOY SEÇİCİ olarak kalır — panel tek boyu anlatır,
// hangi boy sorusunu birinin sorması gerekir; satıra tıklayınca o boyun paneli açılır.

interface StockPeekDialogProps {
  productId: string;
  productName: string;
  /** Ürünün boy sayısı — listeden zaten biliniyor; iskeletin ŞEKLİ buna göre seçilir. */
  variantCount: number;
  onClose: () => void;
}

/** Başlıktaki tam-ekran köprüsü — bakış yetmezse stok ekranı bir tık ötede. */
function StockPageLink({ productName }: { productName: string }) {
  return (
    <Link
      href={`/operations/stock?q=${encodeURIComponent(productName)}`}
      className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive-dark hover:underline"
    >
      Stok ekranında aç →
    </Link>
  );
}

/**
 * Bir boyun geçmiş paneli DİYALOG içinde — stok sayfasının sağ sütunuyla aynı gövde.
 *
 * Sarmalayıcı negatif kenar boşluğuyla diyalog pedini sıfırlar ve SABİT yükseklik verir: panelin
 * kendi iç kaydırması ancak sınırlı bir kapta çalışır (stok sayfasında bu sınırı grid veriyor).
 * `62vh` diyaloğun tavanının (86vh) güvenli altında — iki kaydırma çubuğu üst üste binmez.
 */
function StockHistoryDialog({
  row,
  peek,
  productName,
  onClose,
}: {
  row: StockLevelRow;
  peek: ProductStockPeek;
  productName: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} maxWidth={600} title="Stok" headerAside={<StockPageLink productName={productName} />}>
      <div className="-mx-6 -my-5 h-[62vh]">
        <ProductHistoryPanel
          row={row}
          warehouseNames={new Map(peek.warehouses.map((w) => [w.id, w.name]))}
          showWarehouse={peek.showWarehouse}
          warehouseFilter=""
          warehouseFilterName={null}
          className="h-full"
        />
      </div>
    </Dialog>
  );
}

export function StockPeekDialog({ productId, productName, variantCount, onClose }: StockPeekDialogProps) {
  const [peek, setPeek] = useState<ProductStockPeek | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Açık geçmiş paneli KİMLİKLE tutulur, satır taze listeden türetilir (fiyat bakışının deseni).
  const [openId, setOpenId] = useState<string | null>(null);

  // Okuma açılışta (sipariş hızlı bakışının deseni): liste her ürünün stok kırılımını taşıyamaz.
  useEffect(() => {
    let alive = true;
    void loadProductStockPeekAction(productId).then(({ data, error: actionError }) => {
      if (!alive) return;
      if (actionError) setError(actionError);
      else setPeek(data);
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  // ── Bekleme hâli: gelecek içeriğin ŞEKLİNDE iskelet (skeleton künyesi — çıplak metin yasak).
  // Boy sayısı listeden zaten biliniyor: tek boylu ürün geçmiş paneline gidecek, iskeleti de
  // panelinki; çok boylu ürün seçici tabloya gidecek, iskeleti satır dizisi.
  if (error === null && peek === null) {
    if (variantCount === 1) {
      return (
        <Dialog open onClose={onClose} maxWidth={600} title="Stok" headerAside={<StockPageLink productName={productName} />}>
          <div className="-mx-6 -my-5 h-[62vh] overflow-hidden bg-ops-subtle px-5 py-3.5">
            <HistorySkeleton />
          </div>
        </Dialog>
      );
    }
    return (
      <Dialog open onClose={onClose} maxWidth={640} title="Stok" subtitle={productName} headerAside={<StockPageLink productName={productName} />}>
        <SkeletonRows rows={Math.min(Math.max(variantCount, 2), 6)} />
      </Dialog>
    );
  }

  // Tek boy: seçilecek bir şey yok — geçmiş paneli DOĞRUDAN açılır, kapatınca bakış tamamen kapanır.
  if (peek !== null && peek.rows.length === 1) {
    return <StockHistoryDialog row={peek.rows[0]!} peek={peek} productName={productName} onClose={onClose} />;
  }

  const openRow = peek?.rows.find((r) => r.variantId === openId) ?? null;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={640}
      title="Stok"
      subtitle={productName}
      headerAside={<StockPageLink productName={productName} />}
      footer={
        <Button variant="secondary" className="ml-auto" onClick={onClose}>
          Kapat
        </Button>
      }
    >
      {error ? (
        <p className="font-ops-body text-ops-xs text-ops-red">{error}</p>
      ) : peek === null ? null : (
        <div className="overflow-hidden rounded-ops-card border border-ops-line">
          {/* Kolonlar depolar — depo bir boyut değil DEĞİŞMEZ: özet tek sayıya indirgenmez,
              "Toplam" yalnız "hiç var mı" okumasıdır ve satış kararının sayısı değildir. */}
          <div
            className="grid gap-x-2 border-b border-ops-line bg-ops-subtle px-3.5 py-2 font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted"
            style={{ gridTemplateColumns: `minmax(120px,1fr) repeat(${peek.warehouses.length}, 76px) 76px` }}
          >
            <span>Boy</span>
            {peek.warehouses.map((w) => (
              <span key={w.id} className="text-right" title={w.name}>
                {w.code}
              </span>
            ))}
            <span className="text-right">Toplam</span>
          </div>
          {peek.rows.map((row) => (
            <button
              key={row.variantId}
              type="button"
              onClick={() => setOpenId(row.variantId)}
              title="Boyun stok geçmişini aç"
              className="grid w-full cursor-pointer items-center gap-x-2 border-b border-ops-line-soft px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-ops-subtle"
              style={{ gridTemplateColumns: `minmax(120px,1fr) repeat(${peek.warehouses.length}, 76px) 76px` }}
            >
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate font-ops-body text-ops-sm font-medium text-ops-ink">{row.variantLabel}</span>
                {!row.variantActive ? <span className="font-ops-body text-ops-micro text-ops-muted">pasif</span> : null}
              </span>
              {peek.warehouses.map((w) => {
                const cell = row.warehouses.find((s) => s.warehouseId === w.id);
                return (
                  <span key={w.id} className="flex flex-col items-end gap-px">
                    <span className="font-ops-mono text-ops-sm text-ops-ink">{cell?.availableQty ?? 0}</span>
                    {cell && cell.reservedQty > 0 ? (
                      <span className="font-ops-mono text-ops-micro text-ops-faint">{cell.reservedQty} rez.</span>
                    ) : null}
                  </span>
                );
              })}
              <span className="flex flex-col items-end gap-px">
                <span className={`font-ops-mono text-ops-sm font-medium ${row.belowMin ? 'text-ops-amber' : 'text-ops-ink'}`}>
                  {row.availableQty}
                </span>
                {row.belowMin ? (
                  <span className="font-ops-body text-ops-micro text-ops-amber">eşik {row.minStockQty}</span>
                ) : null}
              </span>
            </button>
          ))}
          {peek.rows.length === 0 ? (
            <p className="px-3.5 py-3 font-ops-body text-ops-xs text-ops-muted">Bu ürünün boyu yok.</p>
          ) : null}
        </div>
      )}
      {openRow && peek ? (
        <StockHistoryDialog
          key={openRow.variantId}
          row={openRow}
          peek={peek}
          productName={productName}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </Dialog>
  );
}
