'use client';

import { useEffect, useState } from 'react';
import { ORDER_STATUS_LABELS, type RecallHit } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Input } from '@/components/operation/form/input';
import { shortDate } from '@/components/operation/ui/format';
import { recallByLotAction } from './actions';
import type { RecallResult } from './stock-types';

// Geri çağırma (rappel) sorgusu — "bu partiden çıkan mal kime gitti".
//
// ACİL BİR İŞTİR: tedarikçi bir lotu geri çağırdığında cevap dakikalar içinde verilmelidir. Bu yüzden
// tek alan, tek düğme ve doğrudan sonuç; ne süzgeç ne sekme. Telefon numarası sonuçta DURUR, çünkü
// bu listenin devamı müşteriyi aramaktır.
//
// Zincir HAZIRLIK KAYITLARINDAN gelir (`OrderItemBatch`): depocunun onayladığı gerçek, tahmin değil.

interface RecallDialogProps {
  /** Satırdan gelen parti numarası — kutu dolu açılır ve sorgu kendiliğinden koşar. */
  initialLot?: string;
  onClose: () => void;
}

export function RecallDialog({ initialLot = '', onClose }: RecallDialogProps) {
  const [lot, setLot] = useState(initialLot);
  const [result, setResult] = useState<RecallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!lot.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { data, error: actionError } = await recallByLotAction(lot);
    setBusy(false);
    if (actionError || !data) {
      setError(actionError ?? 'Sorgu çalıştırılamadı.');
      setResult(null);
      return;
    }
    setResult(data);
  };

  // Satırdan gelindiyse sorgu KENDİ KOŞAR: operatör lot'a bastıysa sonucu istiyor demektir,
  // dolu kutunun yanındaki düğmeye bir kez daha bastırmak boş bir adım olurdu.
  useEffect(() => {
    if (!initialLot) return;
    // Yalnız açılışta: sonraki aramalar operatörün kendi tuşuyla koşar.
    void run();
  }, [initialLot]);

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={620}
      title="Lot / geri çağırma sorgusu"
      subtitle="Lot numarasından siparişlere ve müşterilere — hazırlık kayıtlarından türetilir"
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            Bir adım geri (hangi tedarikçiden, hangi girişle geldi) parti detayındadır.
          </span>
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
        </>
      }
    >
      <div className="flex items-end gap-2.5">
        <Input
          mono
          className="flex-1"
          placeholder="ör. LOT-2451-A"
          value={lot}
          aria-label="Lot numarası"
          onChange={(e) => setLot(e.target.value)}
          onKeyDown={(e) => {
            // Enter sorguyu çalıştırır: acil bir işte fareye uzanmak zaman kaybıdır.
            if (e.key === 'Enter') void run();
          }}
        />
        <Button variant="dark" onClick={() => void run()} disabled={busy || !lot.trim()}>
          {busy ? 'Aranıyor…' : 'Sorgula'}
        </Button>
      </div>

      {error ? <span className="font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}

      {result === null ? (
        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
          Numaranın parçası da yeter — telefonda okunan numara eksik girilebilir. Stoğu bitmiş partiler de aranır:
          geri çağırmada asıl aranan zaten satılıp gitmiş maldır.
        </span>
      ) : (
        <RecallOutcome result={result} />
      )}
    </Dialog>
  );
}

interface RecallOutcomeProps {
  result: RecallResult;
}

function RecallOutcome({ result }: RecallOutcomeProps) {
  if (result.batches.length === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-ops-card border border-ops-line bg-ops-subtle px-4 py-3.5">
        <span className="font-ops-body text-ops-base font-semibold text-ops-ink">Bu numarayla parti bulunamadı</span>
        <span className="font-ops-body text-ops-xs text-ops-muted">
          Numarayı kontrol edin — lot numarası girişte boş bırakılmış olabilir.
        </span>
      </div>
    );
  }

  const customers = new Set(result.hits.map((h) => h.customerId)).size;

  return (
    <div className="flex flex-col gap-3">
      {result.truncated ? (
        <span className="font-ops-body text-ops-xs text-ops-amber">
          Çok sayıda parti eşleşti, liste kırpıldı — numarayı daraltın.
        </span>
      ) : null}

      {/* Eşleşen partiler: hangi ürünün hangi partisi olduğu doğrulanmadan müşteri listesi okunmamalı. */}
      <div className="flex flex-col gap-1.5">
        <span className="font-ops-display text-ops-xs font-semibold uppercase tracking-[0.05em] text-ops-muted">
          Eşleşen parti ({result.batches.length})
        </span>
        {result.batches.map((b) => (
          <div key={b.id} className="flex items-center gap-2 rounded-ops-btn border border-ops-line bg-ops-white px-3 py-2">
            <span className="mr-auto truncate font-ops-body text-ops-sm text-ops-ink">{b.title}</span>
            <span className="font-ops-mono text-ops-xs text-ops-muted">{b.lotNumber}</span>
            <span className="font-ops-mono text-ops-xs text-ops-muted">{shortDate(b.expiryDate)}</span>
            <span className="font-ops-mono text-ops-xs text-ops-muted" title="Elde kalan">
              {b.physicalQty} ad.
            </span>
          </div>
        ))}
      </div>

      {result.hits.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-ops-card border border-ops-olive-line bg-ops-olive-bg px-4 py-3.5">
          <span className="font-ops-body text-ops-base font-semibold text-ops-olive-dark">Bu partiden hiç mal çıkmamış</span>
          <span className="font-ops-body text-ops-xs text-ops-body">
            Hazırlık kaydı yok — parti hâlâ depoda. Geri çağırma müşteriye ulaşmayı gerektirmiyor.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-ops-xs font-semibold uppercase tracking-[0.05em] text-ops-muted">
            {result.hits.length} sipariş · {customers} müşteri
          </span>
          <div className="overflow-hidden rounded-ops-card border border-ops-line">
            {result.hits.map((h) => (
              <HitRow key={h.orderId} hit={h} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface HitRowProps {
  hit: RecallHit;
}

/** Tek sipariş satırı — müşteriye ULAŞMAK için gereken her şey burada: ad, telefon, tarih, miktar. */
function HitRow({ hit }: HitRowProps) {
  return (
    <div className="flex items-center gap-3 border-b border-ops-line-soft px-3 py-2.5 last:border-b-0">
      <div className="mr-auto flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-base text-ops-ink">{hit.customerName || 'Adsız müşteri'}</span>
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {/* Referans yoksa sipariş henüz kalıcı bir numara almamıştır; müşteri adı yine ayırt eder. */}
          {hit.referenceNo ?? 'referans yok'} · {shortDate(hit.orderCreatedAt)} · {hit.qty} ad.
        </span>
      </div>
      {hit.customerPhone ? (
        <a
          href={`tel:${hit.customerPhone}`}
          className="cursor-pointer font-ops-mono text-ops-xs text-ops-olive-dark hover:underline"
        >
          {hit.customerPhone}
        </a>
      ) : (
        <span className="font-ops-body text-ops-xs text-ops-faint">telefon yok</span>
      )}
      <Badge tone="neutral">{ORDER_STATUS_LABELS[hit.orderStatus]}</Badge>
    </div>
  );
}
