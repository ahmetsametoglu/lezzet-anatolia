'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { amount, percent } from '@/components/operation/ui/format';
import { PriceDialog } from '@/components/operation/prices/price-dialog';
import { loadProductPricesPeekAction } from '../../actions/peek';
import type { PriceRow } from '@/lib/pricing/price-rows';

// Ürünün FİYAT BAKIŞI — önizleme panelinin "Fiyatlar" düğmesi (16.08, kullanıcı kararı: sayfaya
// yönlendirme yerine diyalog). Satırlar fiyat ekranıyla AYNI kurulumdan gelir (`toPriceRows`);
// buradaki tablo yalnız diziliştir, hiçbir marj burada hesaplanmaz.
//
// TEK BOYLU ÜRÜNDE TABLO HİÇ GÖRÜNMEZ (16.08, kullanıcı kararı): seçilecek boy yokken araya giren
// tablo fazladan bir perdeydi — düğme doğrudan fiyat ekranının DÜZENLEME FORMUNU açar
// (`PriceDialog`, ortak komponent). Çok boylu üründe tablo BOY SEÇİCİ olarak kalır: form tek boyu
// düzenler, hangi boy sorusunu birinin sorması gerekir. Satıra tıklayınca aynı form açılır;
// kaydedip kapatınca bakış yeniden okunur ki tablo eski sayıyı göstermesin.

interface PricePeekDialogProps {
  productId: string;
  productName: string;
  onClose: () => void;
}

export function PricePeekDialog({ productId, productName, onClose }: PricePeekDialogProps) {
  const [rows, setRows] = useState<PriceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Düzenlenen boy KİMLİKLE tutulur, satır taze listeden türetilir (fiyat ekranının deseni).
  const [editingId, setEditingId] = useState<string | null>(null);
  // Düzenleme kapandıkça artan sayaç — bakış yeniden okunur (kaydedilen fiyat tabloya yansısın).
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadProductPricesPeekAction(productId).then(({ data, error: actionError }) => {
      if (!alive) return;
      if (actionError) setError(actionError);
      else setRows(data);
    });
    return () => {
      alive = false;
    };
  }, [productId, reload]);

  const editing = rows?.find((r) => r.variantId === editingId) ?? null;

  // Tek boy: ara tablo yok, doğrudan düzenleme formu. Kapatınca bakışın tamamı kapanır — geride
  // dönülecek bir tablo yok. Kaydetme `router.refresh()` ile listeyi zaten tazeler.
  if (rows !== null && rows.length === 1) {
    const only = rows[0]!;
    return <PriceDialog key={only.variantId} row={only} onClose={onClose} />;
  }

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={640}
      title="Fiyatlar"
      subtitle={productName}
      headerAside={
        <Link
          href={`/operations/prices?productId=${productId}`}
          className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive-dark hover:underline"
        >
          Fiyat ekranında aç →
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
      ) : rows === null ? (
        <p className="font-ops-body text-ops-xs text-ops-muted">yükleniyor…</p>
      ) : (
        <div className="overflow-hidden rounded-ops-card border border-ops-line">
          <div className="grid grid-cols-[minmax(110px,1fr)_82px_82px_82px_96px] gap-x-2 border-b border-ops-line bg-ops-subtle px-3.5 py-2 font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted">
            <span>Boy</span>
            <span className="text-right">B2C</span>
            <span className="text-right">B2B</span>
            <span className="text-right">Maliyet</span>
            <span className="text-right">Marj</span>
          </div>
          {rows.map((row) => (
            <button
              key={row.variantId}
              type="button"
              onClick={() => setEditingId(row.variantId)}
              title="Fiyatı düzenle"
              className="grid w-full cursor-pointer grid-cols-[minmax(110px,1fr)_82px_82px_82px_96px] items-center gap-x-2 border-b border-ops-line-soft px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-ops-subtle"
            >
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate font-ops-body text-ops-sm font-medium text-ops-ink">{row.variantLabel}</span>
                {!row.variantActive ? <span className="font-ops-body text-ops-micro text-ops-muted">pasif</span> : null}
              </span>
              {/* Taban satırda yazılı kural: B2C KDV DAHİL, B2B hariç — iki sayıyı yan yana
                  karşılaştıran göz bunu bilmeli; başlıkta değil hücre ipucunda söylenir. */}
              <span className="text-right font-ops-mono text-ops-sm text-ops-ink" title="KDV dahil">
                {row.b2c.amountCents === null ? '—' : amount(row.b2c.amountCents)}
              </span>
              <span className="text-right font-ops-mono text-ops-sm text-ops-ink" title="KDV hariç">
                {row.b2b.amountCents === null ? '—' : amount(row.b2b.amountCents)}
              </span>
              <span className="text-right font-ops-mono text-ops-sm text-ops-muted">
                {row.costCents === null ? '—' : amount(row.costCents)}
              </span>
              <span className="flex flex-col items-end gap-px">
                <span
                  className={`font-ops-mono text-ops-sm font-medium ${
                    row.belowTarget ? 'text-ops-amber' : 'text-ops-ink'
                  }`}
                >
                  {row.marginPercent === null ? '—' : percent(row.marginPercent)}
                </span>
                {row.belowTarget ? (
                  <span className="font-ops-body text-ops-micro text-ops-amber">hedef altı</span>
                ) : row.missingPrice ? (
                  <span className="font-ops-body text-ops-micro text-ops-muted">fiyat eksik</span>
                ) : null}
              </span>
            </button>
          ))}
          {rows.length === 0 ? (
            <p className="px-3.5 py-3 font-ops-body text-ops-xs text-ops-muted">Bu ürünün boyu yok.</p>
          ) : null}
        </div>
      )}
      {editing ? (
        <PriceDialog
          key={editing.variantId}
          row={editing}
          onClose={() => {
            setEditingId(null);
            setRows(null);
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </Dialog>
  );
}
