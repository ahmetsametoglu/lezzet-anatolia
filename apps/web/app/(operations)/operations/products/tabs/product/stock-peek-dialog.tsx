'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { loadProductStockPeekAction, type ProductStockPeek } from '../../actions/peek';

// Ürünün STOK BAKIŞI — önizleme panelinin "Stok" düğmesi (16.08, kullanıcı kararı: sayfaya
// yönlendirme yerine diyalog). Salt görünüm: boy × depo kullanılabilir adet + asgari stok uyarısı.
// Parti/SKT ayrıntısı bilerek YOK — o derinlik stok ekranının işi; başlıktaki köprü oraya götürür.

interface StockPeekDialogProps {
  productId: string;
  productName: string;
  onClose: () => void;
}

export function StockPeekDialog({ productId, productName, onClose }: StockPeekDialogProps) {
  const [peek, setPeek] = useState<ProductStockPeek | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={640}
      title="Stok"
      subtitle={productName}
      headerAside={
        <Link
          href={`/operations/stock?q=${encodeURIComponent(productName)}`}
          className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive-dark hover:underline"
        >
          Stokta aç →
        </Link>
      }
      footer={
        <Button variant="secondary" className="ml-auto" onClick={onClose}>
          Kapat
        </Button>
      }
    >
      {error ? (
        <p className="font-ops-body text-ops-xs text-ops-red">{error}</p>
      ) : peek === null ? (
        <p className="font-ops-body text-ops-xs text-ops-muted">yükleniyor…</p>
      ) : (
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
          {peek.rows.map((row) => {
            const belowMin = row.minStockQty !== null && row.totalAvailable < row.minStockQty;
            return (
              <div
                key={row.variantId}
                className="grid items-center gap-x-2 border-b border-ops-line-soft px-3.5 py-2.5 last:border-b-0"
                style={{ gridTemplateColumns: `minmax(120px,1fr) repeat(${peek.warehouses.length}, 76px) 76px` }}
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate font-ops-body text-ops-sm font-medium text-ops-ink">{row.label}</span>
                  {!row.isActive ? <span className="font-ops-body text-ops-micro text-ops-muted">pasif</span> : null}
                </span>
                {row.byWarehouse.map((cell) => (
                  <span key={cell.warehouseId} className="flex flex-col items-end gap-px">
                    <span className="font-ops-mono text-ops-sm text-ops-ink">{cell.availableQty}</span>
                    {cell.reservedQty > 0 ? (
                      <span className="font-ops-mono text-ops-micro text-ops-faint">{cell.reservedQty} rez.</span>
                    ) : null}
                  </span>
                ))}
                <span className="flex flex-col items-end gap-px">
                  <span className={`font-ops-mono text-ops-sm font-medium ${belowMin ? 'text-ops-amber' : 'text-ops-ink'}`}>
                    {row.totalAvailable}
                  </span>
                  {belowMin ? (
                    <span className="font-ops-body text-ops-micro text-ops-amber">eşik {row.minStockQty}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
          {peek.rows.length === 0 ? (
            <p className="px-3.5 py-3 font-ops-body text-ops-xs text-ops-muted">Bu ürünün boyu yok.</p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
