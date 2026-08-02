'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Skeleton } from '@/components/operation/ui/skeleton';
import { WhatsAppIcon } from '@/components/operation/ui/icons';
import { buildOrderMessageAction, cancelOrderAction, markOrderSentAction } from './actions';
import type { PurchaseOrderRowView } from './procurement-types';

// Sipariş gönderim penceresi (09.14) — sayfanın ASIL vaadi: `DOMAIN §16` "sistem WhatsApp'a/e-postaya
// kopyalanacak temiz bir liste üretir, OTOMATİK GÖNDERMEZ; tedarikçi ilişkisi insan ilişkisidir".
//
// Üç yol da AYNI metni taşır (kopyala · WhatsApp · yazdır) ve metni SUNUCU kurar: üç yerde ayrı
// biçimlendirilseydi tedarikçiye üç farklı liste giderdi.
//
// "Gönderildi" AYRI bir eylemdir, kopyalamanın yan etkisi değil: operatör listeyi kopyalayıp
// vazgeçmiş olabilir. Damgayı basan şey onun beyanıdır.

interface OrderSendDialogProps {
  order: PurchaseOrderRowView;
  /** Tedarikçinin telefonu — yoksa WhatsApp yolu hiç çizilmez (çalışmayan düğme gösterilmez). */
  supplierPhone: string | null;
  /** İptal yalnız yöneticiye açık; muhasebe zinciri okur, durdurmaz. */
  canCancel: boolean;
  onClose: () => void;
}

export function OrderSendDialog({ order, supplierPhone, canCancel, onClose }: OrderSendDialogProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Liste diyalog AÇILINCA okunur: elli satırlık listede her siparişin kalemlerini peşinen çekmek,
  // biri açılsın diye ellisinin bedelini ödemek olurdu (sipariş hızlı bakışının deseni).
  useEffect(() => {
    let cancelled = false;
    void buildOrderMessageAction(order.id).then((result) => {
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setText(result.data?.text ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  const onCopy = () => {
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const onMarkSent = () => {
    if (busy) return;
    setBusy(true);
    void markOrderSentAction(order.id)
      .then((result) => (result.error ? setError(result.error) : onClose()))
      .finally(() => setBusy(false));
  };

  const onCancelOrder = () => {
    if (busy) return;
    setBusy(true);
    void cancelOrderAction(order.id)
      .then((result) => (result.error ? setError(result.error) : onClose()))
      .finally(() => setBusy(false));
  };

  // Numara biçimi normalize edilir (kuryenin "yoldayım" bağlantısıyla aynı dert): `wa.me` yalnız
  // rakam ister. Ayırt edilemeyecek kadar kısa numarada bağlantı üretilmez.
  const waDigits = supplierPhone?.replace(/\D/g, '') ?? '';
  const waHref = waDigits.length >= 8 && text ? `https://wa.me/${waDigits}?text=${encodeURIComponent(text)}` : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Tedarik siparişi — ${order.supplierName}`}
      subtitle="Listeyi siz gönderirsiniz; sistem göndermez"
      maxWidth={540}
      footer={
        <>
          {error ? <span className="mr-auto font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
          {canCancel && order.status !== 'received' && order.status !== 'cancelled' ? (
            <Button variant="danger" onClick={onCancelOrder} disabled={busy} className="mr-auto">
              Siparişi iptal et
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          {order.status === 'draft' ? (
            <Button variant="primary" onClick={onMarkSent} disabled={busy}>
              Gönderdim, işaretle
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="font-ops-body text-ops-sm leading-relaxed text-ops-muted">
          Aşağıdaki liste tedarikçinin kendi kodlarıyla hazırlandı. Kopyalayıp WhatsApp, e-posta ya da telefonla
          iletin; ilettikten sonra “Gönderdim” deyin — sipariş o zaman beklenenler listesine geçer.
        </p>

        {/* Metin kutusu: seçilebilir ve tek parça — operatör dilerse elle de kopyalar. */}
        <div className="rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3">
          {text === null && !error ? (
            <span className="flex flex-col gap-2">
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-3 w-2/3" />
            </span>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-ops-mono text-ops-sm text-ops-ink">{text}</pre>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onCopy} disabled={!text}>
            {copied ? 'Kopyalandı' : 'Panoya kopyala'}
          </Button>
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="flex cursor-pointer items-center gap-2 rounded-ops-btn border border-ops-line-strong px-3.5 py-2 font-ops-display text-ops-sm font-semibold text-ops-strong transition-colors hover:border-ops-olive"
            >
              <WhatsAppIcon />
              WhatsApp’tan gönder
            </a>
          ) : (
            // Sebep yazılır: eksik olan tedarikçinin telefonu, ve nerede doldurulacağı belli.
            <span className="self-center font-ops-body text-ops-xs text-ops-muted">
              WhatsApp için tedarikçi kartına telefon girin.
            </span>
          )}
        </div>

        {order.status !== 'draft' ? (
          <p className="font-ops-body text-ops-xs text-ops-muted">
            Bu sipariş gönderilmiş olarak işaretli; liste yeniden paylaşılabilir ama damga bir kez basılır.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
