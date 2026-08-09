'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { titleOf } from '@/lib/catalog/title';
import { openIntakeFormAction, receiveGoodsAction } from './receiving-actions';
import { ReceivingDesktop } from './receiving.desktop';
import { FinishDialog } from './finish-dialog';
import { FreeIntake } from './free-intake';
import type { IntakeHandoff } from './receiving-handoff';
import type { IntakeRow, ReceivingData, ReceiveOutcome } from './receiving-types';

/**
 * Mal kabulün istemci kökü (10.4).
 *
 * ── SATIRLAR SEÇİMLE OKUNUR, HEPSİ ÖNDEN DEĞİL ──────────────────────────────
 * Bekleyen sipariş listesi sunucudan geliyor ama kalemler ancak sipariş seçilince
 * (`openIntakeFormAction`). Üç siparişin de kalemlerini önden okumak, biri açılacakken üçünü
 * getirmek olurdu — ve liste büyüdükçe bedeli büyür.
 *
 * ── "GELEN" BOŞ İLE SIFIR AYRI ──────────────────────────────────────────────
 * `receivedQty: null` = henüz saymadım; `isMissing` = saydım, gelmemiş. Kabulde yalnız GİRİLMİŞ
 * satırlar gönderiliyor: boş satırı sıfırla yazmak, sayılmamış kalemi "hiç gelmedi" diye
 * kaydetmek olurdu ve fark raporu o kalemi kalıcı eksik gösterirdi.
 */
export function ReceivingClient({ data, handoff = null }: { data: ReceivingData; handoff?: IntakeHandoff | null }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /**
   * Öneriden gelindiyse satırlar DOLU başlar — ama `receivedQty` yine `null`: SKT ve lot etiketten
   * kopyadır, adet ise SAYIMDIR ve onu bir fatura fotoğrafından doldurmak, depocuya saymadan
   * onaylamayı teklif etmek olurdu (`receiving-handoff` künyesi).
   */
  const [rows, setRows] = useState<IntakeRow[]>(handoff?.rows ?? []);
  const [finishing, setFinishing] = useState(false);
  const [outcome, setOutcome] = useState<ReceiveOutcome | null>(null);
  /**
   * Siparişsiz kabul modu. Sipariş seçimiyle **birbirini dışlar**: aynı formda hem PO kalemleri
   * hem serbest satırlar olsaydı, kaydederken hangisinin siparişe sayılacağı belirsiz kalırdı —
   * ve fark raporu o belirsizliği sessizce bir tarafa yazardı.
   */
  // Öneri bir siparişe bağlı değilse serbest kabul modunda açılır: kalemler faturadan geliyor,
  // karşılaştırılacak bir sipariş yok.
  const [freeMode, setFreeMode] = useState(Boolean(handoff));
  const [supplierId, setSupplierId] = useState(handoff?.supplierId ?? '');

  const select = (purchaseOrderId: string | null) => {
    setSelectedId(purchaseOrderId);
    setFreeMode(false);
    setRows([]);
    setError(null);
    setOutcome(null);
    if (!purchaseOrderId) return;

    setLoading(true);
    void openIntakeFormAction(purchaseOrderId)
      .then(({ data: lines, error: failed }) => {
        if (failed || !lines) {
          setError(failed ?? 'Sipariş kalemleri okunamadı.');
          return;
        }
        setRows(
          lines.map((line) => ({
            variantId: line.variantId,
            title: titleOf(line.productName, line.variantLabel),
            expectedQty: line.expectedQty,
            // Adet ÖNDEN DOLDURULMUYOR: beklenen adedi "gelen" hanesine yazmak, depocuya saymadan
            // onaylamayı teklif etmektir — kabulün bütün amacı fiilen geleni saymaktır.
            receivedQty: null,
            expiryDate: '',
            lotNumber: '',
            location: '',
            isMissing: false,
          })),
        );
      })
      .finally(() => setLoading(false));
  };

  const patchRow = (variantId: string, patch: Partial<IntakeRow>) =>
    setRows((current) => current.map((row) => (row.variantId === variantId ? { ...row, ...patch } : row)));

  const finish = (warehouseId: string) => {
    setError(null);
    startTransition(async () => {
      const { data: result, error: failed } = await receiveGoodsAction({
        warehouseId,
        // Siparişsiz kabulde PO YOK ve tedarikçi elle seçilmiş: kapı bu yolda fark üretmiyor,
        // çünkü karşılaştırılacak bir sipariş yok.
        purchaseOrderId: freeMode ? null : selectedId,
        supplierId: freeMode ? supplierId || null : null,
        note: null,
        // Yalnız GİRİLMİŞ satırlar: boş bırakılan ("henüz saymadım") ve "gelmedi" işaretli satırlar
        // gönderilmiyor. İkincisinin kaydı adet DEĞİL, farkın kendisidir — PO kapanışında eksik
        // olarak zaten görünür.
        lines: rows
          .filter((row) => !row.isMissing && row.receivedQty !== null && row.receivedQty > 0)
          .map((row) => ({
            variantId: row.variantId,
            qty: row.receivedQty as number,
            expiryDate: row.expiryDate,
            lotNumber: row.lotNumber.trim() || null,
            location: row.location.trim() || null,
          })),
        // Öneriden gelindiyse kuyruk satırı bu kayıtla kapanır VE faturadan okunan birim maliyet
        // sunucuda kayda eklenir — istemci onu hiç görmez (rol duvarı).
        proposalId: handoff?.proposalId,
      });

      if (failed || !result) {
        setError(failed ?? 'Kabul kaydedilemedi.');
        return;
      }

      setFinishing(false);
      setOutcome(result);
      router.refresh();
    });
  };

  return (
    <>
      <ReceivingDesktop
        handoff={handoff}
        data={data}
        selectedId={selectedId}
        onSelect={select}
        rows={rows}
        onRow={patchRow}
        busy={busy}
        error={error}
        loading={loading}
        onFinish={() => setFinishing(true)}
        freeMode={freeMode}
        onFreeMode={() => {
          setFreeMode(true);
          setSelectedId(null);
          setRows([]);
          setError(null);
          setOutcome(null);
        }}
        free={
          <FreeIntake
            suppliers={data.suppliers}
            rows={rows}
            supplierId={supplierId}
            onSupplier={setSupplierId}
            onAddRow={(variantId, title) =>
              setRows((current) =>
                // Aynı varyant iki kez eklenmez: farklı son tarih ayrı satır olurdu ama o zaman
                // ayrı bir varyant satırı değil, ikinci bir GİRİŞ gerekir — bugün bu ekran tek
                // satır/varyant çalışıyor ve ikizini sessizce eklemek adetleri toplardı.
                current.some((row) => row.variantId === variantId)
                  ? current
                  : [
                      ...current,
                      { variantId, title, expectedQty: null, receivedQty: null, expiryDate: '', lotNumber: '', location: '', isMissing: false },
                    ],
              )
            }
            onRow={patchRow}
            onRemoveRow={(variantId) => setRows((current) => current.filter((row) => row.variantId !== variantId))}
            busy={busy}
            onFinish={() => setFinishing(true)}
          />
        }
      />

      {finishing ? (
        <FinishDialog
          rows={rows}
          // **Öneri deposu ÖN SEÇİLİ** (22.5): faturayı okuyan araç malın hangi kapıdan gireceğini
          // zaten söylüyor ve yöneticide bu alan boş başlıyor. Seçim yine DEĞİŞTİRİLEBİLİR —
          // varsayılan üretmiyoruz, önerinin söylediğini gösteriyoruz.
          warehouseId={handoff?.warehouseId ?? data.warehouseId}
          warehouseName={data.warehouseName}
          warehouseOptions={data.warehouseOptions}
          busy={busy}
          error={error}
          onClose={() => setFinishing(false)}
          onConfirm={finish}
        />
      ) : null}

      {outcome ? <OutcomeNotice outcome={outcome} onClose={() => setOutcome(null)} /> : null}
    </>
  );
}

/**
 * Kabul sonrası özet — uyarılar ve farklar.
 *
 * Kabul TAMAMLANDI; bu pencere bir onay istemiyor, olan biteni söylüyor. Kısa raf ömrü uyarısı
 * burada görünüyor çünkü kabul anında engellemedi (DOMAIN §4) ama kayda geçti — depocunun bunu
 * bilmesi, aynı tedarikçiden gelen sonraki paleti daha dikkatli açmasını sağlar.
 */
function OutcomeNotice({ outcome, onClose }: { outcome: ReceiveOutcome; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[420px] flex-col gap-2 rounded-ops-card border border-ops-olive-line bg-ops-white px-4 py-3 shadow-lg">
      <span className="font-ops-display text-ops-sm font-semibold text-ops-olive-dark">
        Kabul tamamlandı — {outcome.batches} parti yazıldı
      </span>
      {outcome.warnings.length > 0 ? (
        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
          {outcome.warnings.length} partide kısa raf ömrü uyarısı var; kabul engellenmedi.
        </span>
      ) : null}
      {outcome.differences.length > 0 ? (
        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-body">
          {outcome.differences.length} kalemde fark kayda geçti.
        </span>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        className="cursor-pointer self-end font-ops-body text-ops-xs font-semibold text-ops-muted hover:text-ops-ink"
      >
        Kapat
      </button>
    </div>
  );
}
