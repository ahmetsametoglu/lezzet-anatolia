'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fromCents, toCents } from '@lezzet/helper';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Skeleton } from '@/components/operation/ui/skeleton';
import { TrashIcon, WhatsAppIcon } from '@/components/operation/ui/icons';
import { amount, shortDate } from '@/components/operation/ui/format';
import { Input } from '@/components/operation/form/input';
import { MoneyInput } from '@/components/operation/form/money-input';
import {
  cancelOrderAction,
  loadOrderDetailAction,
  markOrderSentAction,
  removeDraftLineAction,
  updateDraftLineAction,
} from './actions';
import { statusLabel, statusTone, waitingText } from './procurement-labels';
import type { OrderDetailView, OrderLineView } from './procurement-types';

// Sipariş penceresi (09.14) — siparişin TEK ekranı: kalemleri, ilerlemesi ve gönderimi.
//
// Ayrı bir detay SAYFASI açılmadı ve bu bilinçli: sipariş bir liste satırının derinleşmesidir, ayrı
// bir yer değil — operatör listeye bakarken açar, işini yapar, kapatır. Ayrı sayfa her seferinde
// listeyi kaybettirir ve geri dönüşte süzgeci yeniden kurdurur.
//
// İki hâli var ve ikisi de aynı pencerede: **taslak** düzenlenir (adet/fiyat değişir, kalem
// çıkarılır), **gönderilmiş** okunur (ne geldi, ne bekleniyor). Ayrı iki pencere yazmak aynı
// siparişin iki tanımını doğururdu.
//
// Gönderim bloğu `DOMAIN §16`'nın ta kendisi: "sistem WhatsApp'a kopyalanacak temiz bir liste üretir,
// OTOMATİK GÖNDERMEZ". "Gönderdim" AYRI bir eylemdir, kopyalamanın yan etkisi değil — operatör
// listeyi kopyalayıp vazgeçmiş olabilir.

interface PurchaseOrderDialogProps {
  orderId: string;
  /** Sunucunun günü — "kaç gündür yolda" bundan sayılır (istemcide `new Date()` çağrılmaz). */
  today: string;
  /** İptal yalnız yöneticiye açık; muhasebe zinciri okur, durdurmaz. */
  canCancel: boolean;
  onClose: () => void;
}

export function PurchaseOrderDialog({ orderId, today, canCancel, onClose }: PurchaseOrderDialogProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<OrderDetailView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Kalemler pencere AÇILINCA okunur: elli satırlık listede her siparişin kalemlerini peşinen
  // çekmek, biri açılsın diye ellisinin bedelini ödemek olurdu.
  const load = useCallback(() => {
    void loadOrderDetailAction(orderId).then((result) => {
      if (result.error) setError(result.error);
      else setDetail(result.data);
    });
  }, [orderId]);
  useEffect(load, [load]);

  /**
   * Kalem değişti: pencere kendini yeniden okur VE liste tazelenir.
   *
   * İkisi de gerekli — pencere kendi gerçeğinin sahibi (adet, tutar, metin), ama arkadaki satırın
   * "3 kalem · 48,00 €" özeti de değişti. Yalnız birini yapmak, kapatınca eski özeti gösterirdi.
   */
  const afterLineChange = () => {
    load();
    router.refresh();
  };

  const run = (fn: () => Promise<{ error: string | null }>, after: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void fn()
      .then((result) => (result.error ? setError(result.error) : after()))
      .finally(() => setBusy(false));
  };

  const onCopy = () => {
    if (!detail?.message) return;
    void navigator.clipboard.writeText(detail.message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Numara biçimi normalize edilir (kuryenin "yoldayım" bağlantısıyla aynı dert): `wa.me` yalnız
  // rakam ister. Ayırt edilemeyecek kadar kısa numarada bağlantı üretilmez.
  const waDigits = detail?.supplierPhone?.replace(/\D/g, '') ?? '';
  const waHref =
    waDigits.length >= 8 && detail?.message ? `https://wa.me/${waDigits}?text=${encodeURIComponent(detail.message)}` : null;

  const isDraft = detail?.status === 'draft';
  const waiting = detail ? waitingText(detail, today) : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={detail ? `Tedarik siparişi — ${detail.supplierName}` : 'Tedarik siparişi'}
      subtitle={isDraft ? 'Kalemleri düzenleyin, sonra listeyi siz gönderin' : 'Listeyi siz gönderirsiniz; sistem göndermez'}
      maxWidth={720}
      footer={
        <>
          {error ? <span className="mr-auto font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
          {canCancel && detail && detail.status !== 'received' && detail.status !== 'cancelled' ? (
            <Button variant="danger" onClick={() => run(() => cancelOrderAction(orderId), onClose)} disabled={busy} className="mr-auto">
              Siparişi iptal et
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          {isDraft ? (
            <Button
              variant="primary"
              onClick={() => run(() => markOrderSentAction(orderId), onClose)}
              // Kalemsiz sipariş gönderilmez: tedarikçiye boş bir liste gitmesinin anlamı yok.
              disabled={busy || detail.lines.length === 0}
            >
              Gönderdim, işaretle
            </Button>
          ) : null}
        </>
      }
    >
      {detail === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Künye: hangi hâlde, ne zaman açıldı, ne zamandır bekliyor. */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone={statusTone(detail.status)}>{statusLabel(detail.status)}</Badge>
            <span className="font-ops-body text-ops-xs text-ops-muted">{shortDate(detail.createdAt)} tarihinde açıldı</span>
            {waiting ? (
              <span className="font-ops-body text-ops-xs font-semibold text-ops-strong" title="Gönderim damgasından bu yana">
                {waiting}
              </span>
            ) : null}
            {detail.note ? <span className="font-ops-body text-ops-xs text-ops-muted">· {detail.note}</span> : null}
          </div>

          <OrderLines
            lines={detail.lines}
            editable={isDraft}
            busy={busy}
            onQty={(itemId, qty) => run(() => updateDraftLineAction({ orderId, itemId, qty }), afterLineChange)}
            onPrice={(itemId, unitPriceCents) =>
              run(() => updateDraftLineAction({ orderId, itemId, unitPriceCents }), afterLineChange)
            }
            onRemove={(itemId) => run(() => removeDraftLineAction({ orderId, itemId }), afterLineChange)}
          />

          {/* Gönderim bloğu — iptal edilmiş siparişte çizilmez: gönderilecek bir şey kalmadı. */}
          {detail.status !== 'cancelled' ? (
            <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-3.5">
              <p className="font-ops-body text-ops-sm leading-relaxed text-ops-muted">
                Aşağıdaki liste tedarikçinin kendi kodlarıyla hazırlandı. Kopyalayıp WhatsApp, e-posta ya da telefonla
                iletin; ilettikten sonra “Gönderdim” deyin — sipariş o zaman beklenenler listesine geçer.
              </p>
              <div className="rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3">
                <pre className="whitespace-pre-wrap break-words font-ops-mono text-ops-sm text-ops-ink">
                  {detail.message || 'Siparişte kalem yok.'}
                </pre>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={onCopy} disabled={!detail.message}>
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
            </section>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

interface OrderLinesProps {
  lines: OrderLineView[];
  /** Taslakta düzenlenir; gönderilmiş siparişte OKUNUR — kayıt tedarikçiye gideni yansıtmalı. */
  editable: boolean;
  busy: boolean;
  onQty: (itemId: string, qty: number) => void;
  onPrice: (itemId: string, unitPriceCents: number | null) => void;
  onRemove: (itemId: string) => void;
}

function OrderLines({ lines, editable, busy, onQty, onPrice, onRemove }: OrderLinesProps) {
  if (lines.length === 0) {
    return (
      <p className="rounded-ops-card border border-dashed border-ops-line-strong px-3.5 py-5 text-center font-ops-body text-ops-sm text-ops-muted">
        Bu siparişte kalem yok.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {lines.map((line) => (
        <li key={line.itemId} className="flex items-center gap-2.5 rounded-ops-card border border-ops-line px-3 py-2">
          <div className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate font-ops-body text-ops-sm font-medium text-ops-ink">{line.title}</span>
            <span className="truncate font-ops-mono text-ops-xs text-ops-muted">
              {/* Kod yoksa sebebi yazılır: liste bizim adımızla gidecek, eşleme tedarikçi kartından eklenir. */}
              {line.supplierCode ?? 'kod eşlemesi yok'}
              {/* Hedef depo bir NİYET beyanıdır (K6) — "buraya gelecek" değil "buraya isteniyor". */}
              {line.targetWarehouseCode ? ` · ${line.targetWarehouseCode} için` : ''}
            </span>
          </div>

          {editable ? (
            <>
              <QtyCell value={line.qty} disabled={busy} onCommit={(qty) => onQty(line.itemId, qty)} />
              <PriceCell
                valueCents={line.unitPriceCents}
                disabled={busy}
                onCommit={(cents) => onPrice(line.itemId, cents)}
              />
              <button
                type="button"
                onClick={() => onRemove(line.itemId)}
                disabled={busy}
                title="Kalemi siparişten çıkar"
                className="cursor-pointer rounded-ops-btn p-1.5 text-ops-faint transition-colors hover:bg-ops-red-bg hover:text-ops-red"
              >
                <TrashIcon />
              </button>
            </>
          ) : (
            <>
              <span className="font-ops-mono text-ops-sm text-ops-ink" title="Ismarlanan">
                {line.qty}
              </span>
              {/* Gelen / bekleyen: kapanan kalem olive, bekleyen amber (sipariş listesinin tonu). */}
              <span
                className={`w-24 text-right font-ops-mono text-ops-xs ${line.missingQty <= 0 ? 'text-ops-olive-dark' : 'text-ops-amber'}`}
                title={line.missingQty <= 0 ? 'Bu kalem kapandı' : `${line.missingQty} adet bekleniyor`}
              >
                {line.receivedQty} geldi
              </span>
              <span className="w-20 text-right font-ops-mono text-ops-xs text-ops-muted">
                {line.unitPriceCents === null ? '—' : amount(line.unitPriceCents)}
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Adet hücresi — yazarken serbest, ODAKTAN ÇIKINCA kaydeder.
 *
 * Her tuşta kaydetmek "1" yazarken 1 adetlik bir sipariş kaydeder ve arkasından "12"yi. Karar
 * bittiğinde kaydetmek doğru an; değişmediyse hiç tur atılmaz.
 */
function QtyCell({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (qty: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const next = Number(draft);
    if (!Number.isInteger(next) || next <= 0) {
      setDraft(String(value)); // geçersiz giriş sessizce geri alınır — kayıt bozulmaz
      return;
    }
    if (next !== value) onCommit(next);
  };

  return (
    <Input
      inputSize="sm"
      mono
      // Satır içi kutu: kabuğun `w-full`'ü KAPALI, yoksa satırı kaplayıp ürün adını 0 piksele düşürür.
      fullWidth={false}
      className="w-16 flex-none text-right"
      inputMode="numeric"
      aria-label="Sipariş adedi"
      disabled={disabled}
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/**
 * Beklenen alış — adet hücresiyle aynı "odaktan çıkınca kaydet" kuralı.
 *
 * **Boş bırakmak anlamlı ve korunur:** `null` = "kaçtan geleceğini bilmiyorum", sipariş tutarı
 * eksik kalır ve liste bunu "≈" ile söyler. Sıfır yazmak bedava alım demek olurdu (`CLAUDE.md §1`).
 *
 * Cent ↔ euro dönüşümü BURADA, tek sınırda (`STACK §8`): kutu euro konuşur, kayıt cent.
 */
function PriceCell({
  valueCents,
  disabled,
  onCommit,
}: {
  valueCents: number | null;
  disabled: boolean;
  onCommit: (cents: number | null) => void;
}) {
  const [euro, setEuro] = useState<number | null>(valueCents === null ? null : fromCents(valueCents));
  useEffect(() => setEuro(valueCents === null ? null : fromCents(valueCents)), [valueCents]);

  return (
    <MoneyInput
      fullWidth={false}
      className="w-24 flex-none"
      disabled={disabled}
      placeholder="alış"
      ariaLabel="Beklenen alış fiyatı"
      title="Beklenen alış — boş bırakılırsa sipariş tutarı eksik kalır"
      value={euro}
      onChange={setEuro}
      onBlur={() => {
        const next = euro === null ? null : toCents(euro);
        if (next !== valueCents) onCommit(next);
      }}
    />
  );
}
