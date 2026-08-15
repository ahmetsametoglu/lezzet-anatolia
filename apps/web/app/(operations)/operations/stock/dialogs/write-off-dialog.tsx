'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Combobox } from '@/components/operation/form/combobox';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input, Textarea } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { num, shortDate } from '@/components/operation/ui/format';
import { recordWriteOffAction } from '@/lib/warehouse/writeoff-actions';
import type { WarehouseReason } from '@lezzet/application';
import type { WriteOffBatch } from '../stock-types';

/**
 * **STOKTAN DÜŞ — tutanak formu** (22.26; eski `/operations/adjustments` sayfası).
 *
 * ── OLAY = BİR KÂĞIT ────────────────────────────────────────────────────────
 * Satırlar önce burada birikir, kayıt TEK çağrıda yazılır ve hepsi tek belge numarasını paylaşır
 * (`IMH-STR-26-0012`). Bir tepsi bozulunca üç parti birden gider ve denetmenin elindeki kâğıt
 * tektir; her partiyi ayrı göndermek o kâğıdı sistemde üç kayda dağıtırdı.
 *
 * **Sebep ve not OLAYIN, satırın değil** — arka uç imzası da öyle (`{ lines, reason, note }`).
 * Satır başına sebep, aynı imhanın parçalarını farklı gerekçelere bölerdi.
 *
 * ── PARA YOK ────────────────────────────────────────────────────────────────
 * Fire maliyeti bu yüzeyde görünmez (tasarımın kuralı) ve veri de taşımıyor: `WriteOffBatch` alış
 * fiyatını hiç almıyor. Ekran isteseydi bile gösteremez.
 */
interface WriteOffDialogProps {
  batches: WriteOffBatch[];
  /** Satırdan gelen kısayolla açıldıysa o parti seçili başlar. */
  initialStockId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}

const REASONS: Array<{ value: WarehouseReason; label: string }> = [
  { value: 'expired', label: 'Son tarihi geçti' },
  { value: 'damaged', label: 'Hasar' },
  { value: 'count_diff', label: 'Sayım farkı' },
  { value: 'lost', label: 'Kayıp' },
];

export function WriteOffDialog({ batches, initialStockId, onClose, onDone }: WriteOffDialogProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Tutanağa girmiş satırlar ↔ üstünde kurulan taslak. İkisi AYRI durum: taslak henüz tutanağa
  // girmemiştir ve "Ekle"ye basılmadan gönderilmemelidir — yoksa yarım yazılmış bir adet kayda geçerdi.
  const [lines, setLines] = useState<Array<{ stockId: string; qty: number }>>([]);
  const [draftStockId, setDraftStockId] = useState(initialStockId);
  const [draftQty, setDraftQty] = useState('');
  const [reason, setReason] = useState<WarehouseReason | ''>('');
  const [note, setNote] = useState('');

  const batchOf = new Map(batches.map((batch) => [batch.stockId, batch]));
  const selected = batchOf.get(draftStockId) ?? null;
  const qty = Number(draftQty);

  /**
   * İKİ AYRI ENGEL, iki ayrı düğme. "Ekle" satırın kendi kurallarına bakar, "Stoktan düş" tutanağın
   * bütününe — tek engel cümlesi olsaydı, satırı tamamlanmış bir tutanakta "parti seçin" yazardı.
   *
   * Engel SEBEBİYLE söyleniyor: kilitli ama sebepsiz bir düğme, operatörü neyi düzelteceğini
   * aramaya bırakır. Adet tavanı ekranda da kontrol ediliyor ama SON SÖZ veritabanının
   * (`adjust_stock_batch`) — burası yalnız gereksiz bir turu önlüyor.
   */
  const lineBlock = !selected
    ? 'Parti seçin.'
    : lines.some((line) => line.stockId === draftStockId)
      ? 'Bu parti tutanakta zaten var — satırı kaldırıp yeniden ekleyin.'
      : !Number.isInteger(qty) || qty <= 0
        ? 'Düşülecek adedi girin.'
        : qty > selected.physicalQty
          ? `Partide ${num(selected.physicalQty)} adet var; daha fazlası düşülemez.`
          : null;

  const formBlock = lines.length === 0 ? 'En az bir satır ekleyin.' : !reason ? 'Sebep seçin — zorunlu.' : null;

  const addLine = () => {
    if (lineBlock || !selected) return;
    setLines((prev) => [...prev, { stockId: draftStockId, qty }]);
    setDraftStockId('');
    setDraftQty('');
  };

  const submit = () => {
    if (formBlock || !reason) return;
    setError(null);
    startTransition(async () => {
      const { data, error: failed } = await recordWriteOffAction({ lines, reason, note: note.trim() || null });
      if (failed || !data) {
        // Satırlar KORUNUR: kapı "hiçbiri yazılmadı" diyor (tek işlem) ve operatörün beş satırlık
        // tutanağı bir hata mesajı uğruna silinemez.
        setError(failed ?? 'Kayıt yazılamadı.');
        return;
      }
      // Belge numarası GÖSTERİLİYOR: denetmenin elindeki kâğıt bu numarayla eşleşiyor ve operatör
      // onu kaydettiği an not edebilmeli.
      const satir = `${data.lines} satır`;
      onDone(data.referenceNo ? `Kayıt yazıldı — belge no ${data.referenceNo} · ${satir}` : `Kayıt yazıldı — ${satir}.`);
      router.refresh();
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Stoktan düş"
      subtitle="Sebep zorunlu · kayıt anında stok düşer · bütün satırlar tek belge numarasını paylaşır"
      maxWidth={720}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="font-ops-body text-ops-xs text-ops-muted">{error ?? formBlock ?? ''}</span>
          <div className="flex flex-none items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Vazgeç
            </Button>
            <Button size="sm" onClick={submit} disabled={busy || formBlock !== null}>
              {busy ? 'Yazılıyor…' : 'Stoktan düş'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* SATIR KURMA — parti + adet + "Ekle". Tutanağa girmeden hiçbir şey yazılmaz. */}
        <div className="flex items-end gap-3">
          {/* `min-w-0` ŞART: flex çocuğunun asgari genişliği içeriği kadardır ve parti adları uzun —
              paysız bırakıldığında satır pencereyi taşırır (`Combobox` künyesi, 14.08). */}
          <FieldShell label="Parti" labelAside="ürün · son tarih" className="min-w-0 flex-1">
            <Combobox
              value={draftStockId}
              onChange={setDraftStockId}
              // Seçenek TEK UZUN METİN değil, seçicinin kendi sütunları: ad · ikinci satır · sağda
              // adet. Hepsini etikete dizmek hem tetikleyiciyi şişiriyor hem listeyi okunmaz kılıyordu.
              options={batches.map((batch) => ({
                value: batch.stockId,
                label: batch.title,
                meta: batchMeta(batch),
                trailing: `${num(batch.physicalQty)} adet`,
              }))}
              // Kapalı hâlde seçilinin ADI görünür; son tarih ve adet aşağıdaki künyede yazılı —
              // tetikleyiciye sığdırmaya çalışmak, kırpılmış bir cümle bırakırdı.
              placeholder="Parti seçin…"
              searchPlaceholder="Ürün adı ya da son tarih"
              emptyText="Eşleşen parti yok."
              disabled={busy}
            />
          </FieldShell>
          <FieldShell label="Adet" className="flex-none">
            <Input
              type="number"
              min={1}
              className="w-[110px] text-center"
              fullWidth={false}
              value={draftQty}
              onChange={(event) => setDraftQty(event.target.value)}
              placeholder="adet"
              disabled={busy}
            />
          </FieldShell>
          <Button variant="secondary" onClick={addLine} disabled={busy || lineBlock !== null}>
            Ekle
          </Button>
        </div>
        {/* Seçili partinin künyesi — tetikleyicide yalnız AD duruyor, karar için gereken tarih/depo/
            eldeki adet burada okunur. Engel varsa onun yerini alır: iki cümle yan yana durursa
            operatör hangisinin eylem gerektirdiğini aramak zorunda kalır. */}
        {lineBlock && draftStockId ? (
          <span className="-mt-2 font-ops-body text-ops-xs text-ops-amber">{lineBlock}</span>
        ) : selected ? (
          <span className="-mt-2 font-ops-body text-ops-xs text-ops-muted">
            {batchMeta(selected)} · elde {num(selected.physicalQty)} adet
          </span>
        ) : null}

        {/* TUTANAK — eklenen satırlar. Boşken de çizilir: forma bakan kişi kaydın neye benzeyeceğini
            görmeli, ve "ekledim mi" sorusu ancak listeyle cevaplanır. */}
        <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-line bg-ops-surface-sunken px-3.5 py-3">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.08em] text-ops-muted">
            Tutanak · {num(lines.length)} satır
          </span>
          {lines.length === 0 ? (
            <span className="font-ops-body text-ops-sm text-ops-faint">Henüz satır eklenmedi.</span>
          ) : (
            lines.map((line) => {
              const batch = batchOf.get(line.stockId);
              return (
                <div key={line.stockId} className="flex items-center justify-between gap-3">
                  {/* `min-w-0` — uzun ürün adı satırı taşırmasın, kesilsin. */}
                  <span className="min-w-0 flex-1 truncate font-ops-body text-ops-sm text-ops-ink">
                    {batch ? `${batch.title} · ${batchMeta(batch)}` : 'Parti çözülemedi'}
                  </span>
                  <div className="flex flex-none items-center gap-2">
                    <span className="font-ops-mono text-ops-sm font-semibold text-ops-ink">−{num(line.qty)}</span>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((l) => l.stockId !== line.stockId))}
                      disabled={busy}
                      aria-label="Satırı çıkar"
                      className="cursor-pointer rounded-ops-btn border border-ops-line px-1.5 py-0.5 font-ops-body text-ops-micro text-ops-muted transition-colors hover:border-ops-red-line hover:text-ops-red disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldShell label="Sebep" required>
            <Select
              value={reason}
              onChange={(next) => setReason(next as WarehouseReason)}
              options={REASONS.map((r) => ({ value: r.value, label: r.label }))}
              placeholder="Sebep seçin"
              disabled={busy}
            />
          </FieldShell>
          <FieldShell label="Not" labelAside="isteğe bağlı">
            <Textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="İstisnai durumun açıklaması"
              disabled={busy}
            />
          </FieldShell>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Seçeneğin İKİNCİ satırı — son tarih · depo, geçmişse işaretli.
 *
 * Adet burada YOK: seçicinin sağ sütununa gidiyor (mono, hizalı) — sayıyı cümlenin içine gömmek
 * listeyi tararken karşılaştırmayı zorlaştırırdı.
 */
function batchMeta(batch: WriteOffBatch): string {
  const parts = [batch.isExpired ? `${shortDate(batch.expiryDate)} · geçti` : shortDate(batch.expiryDate)];
  if (batch.warehouseName) parts.push(batch.warehouseName);
  return parts.join(' · ');
}
