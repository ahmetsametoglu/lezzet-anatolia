'use client';

import { Dialog } from '@/components/operation/ui/dialog';
import { Button } from '@/components/operation/ui/button';
import { money } from '@/components/operation/ui/format';
import type { OrderDetailView } from '../order-detail-types';

// İPTAL ONAYI — kendi diyalogumuz, tarayıcının `confirm()` kutusu DEĞİL.
//
// Tarayıcı kutusu üç şeyi birden kaybettiriyordu: (1) operasyonun görsel dili — koyu temada bile
// sistem grisi bir kutu açılıyordu; (2) SONUÇ — `confirm` yalnız bir cümle taşır, oysa iptalin üç
// ayrı etkisi var ve ikisi paradır; (3) hata yolu — kutu kapanır, işlem düşerse operatör nedenini
// kutuda değil sayfanın bir köşesinde arar.
//
// Pencere seçim SUNMAZ (kısmi karşılama/iade pencerelerinin aksine): iptalde seçilecek adet, akıbet
// ya da yol yoktur. Tek işi kararın sonucunu yazıp onayı almaktır.

interface CancelDialogProps {
  order: OrderDetailView;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
}

export function CancelDialog({ order, onClose, onConfirm, busy, error }: CancelDialogProps) {
  const collected = order.payment.collectedCents;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={520}
      title={`Siparişi iptal et — ${order.referenceNo ?? '—'}`}
      subtitle={`${order.customerName} · ${money(order.payment.totalCents)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? 'İptal ediliyor…' : 'Siparişi iptal et'}
          </Button>
        </>
      }
    >
      <div className="rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3.5 py-2.5 font-ops-body text-ops-xs font-medium leading-[1.55] text-ops-red">
        Bu geri alınmaz. Sipariş kapanır ve yeniden açılmaz — müşteri aynı malı isterse yeni sipariş
        girilir.
      </div>

      {error ? (
        <div className="rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3.5 py-2.5 font-ops-body text-ops-xs font-semibold text-ops-red">
          {error}
        </div>
      ) : null}

      {/* Sonuç üç satır: hazırlık, mal, para. Onay isteyen pencere ne olacağını SAYARAK söyler. */}
      <div className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3">
        <Outcome label="Hazırlık" value="durur — depo kuyruğundan düşer" />
        <Outcome label="Ayrılan stok" value="serbest kalır, başkasına satılabilir" />
        <Outcome
          label="Para"
          value={
            collected > 0
              ? `${money(collected)} tahsil edilmiş — tamamı iade borcuna döner`
              : 'tahsilat yok — iade doğmaz'
          }
          tone={collected > 0 ? 'red' : undefined}
        />
      </div>

      {/* BEKLEYEN(07.11): sağlayıcıya iade çağrısı — aşağıdaki cümle bu eksiğin operatöre söylenmiş
          hâlidir, bağlandığında cümle de kalkar. */}
      {collected > 0 ? (
        <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
          İade hareketi paranın girdiği hesaba yazılır. Kartla ödenmişse hareket Stripe hesabına düşer;
          karta dönüş çağrısı henüz bağlı değil, sağlayıcı panelinden yapılır.
        </span>
      ) : null}
    </Dialog>
  );
}

function Outcome({ label, value, tone }: { label: string; value: string; tone?: 'red' }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="w-[92px] flex-none font-ops-body text-ops-xs text-ops-muted">{label}</span>
      <span className={`min-w-0 flex-1 font-ops-body text-ops-xs ${tone === 'red' ? 'text-ops-red' : 'text-ops-ink'}`}>
        {value}
      </span>
    </div>
  );
}
