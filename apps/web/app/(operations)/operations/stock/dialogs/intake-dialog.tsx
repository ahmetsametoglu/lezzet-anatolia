'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { IntakeFormBody } from '@/components/operation/form/intake-form/body';
import {
  countedLines,
  emptyIntakeLine,
  intakeBlock,
  type IntakeFormValues,
} from '@/components/operation/form/intake-form/schema';
import { titleOf } from '@/lib/catalog/title';
import {
  createSupplierAction,
  openIntakeFormAction,
  receiveIntakeAction,
  searchIntakeVariantsAction,
} from '@/lib/warehouse/intake-actions';
import type { ReceiveOutcome } from '@/lib/warehouse/intake-types';
import type { IntakeTabData } from '../stock-types';

/**
 * **MAL KABUL FORMU — liste üstünde diyalog** (22.26).
 *
 * Eski `/operations/receiving` sayfası formu sağ sütunda kalıcı tutuyordu; ikisi sürekli birbirinin
 * yerini daraltıyordu. Karar formu bu ekranın kendi deseniyle (teklif diyaloğu, lot sorgusu) aynı
 * yere geldi ve tasarımın kuralı da bu: *"kararlar liste üstünde açılan formlarda verilir"*.
 *
 * ── İKİ KİP, TEK FORM ───────────────────────────────────────────────────────
 * `purchaseOrderId` doluysa kalemler siparişten yüklenir ("beklenen ↔ gelen" + "gelmedi" beyanı);
 * boşsa irsaliyesiz kabuldür ve satırlar katalogdan aranarak eklenir. İkisi de AYNI satır editörünü
 * kullanıyor (`intake-form/body`) — 22.25'in kapattığı çift uygulama.
 *
 * ── ADET ÖNDEN DOLDURULMAZ ──────────────────────────────────────────────────
 * Ismarlanan adet ayrı bir kolonda okunur ama "gelen" hanesine yazılmaz: kabulün bütün amacı fiilen
 * geleni saymaktır ve dolu bir hane, saymadan onaylamayı teklif ederdi.
 */
interface IntakeDialogProps {
  /** `null` = irsaliyesiz (boş formla) kabul; dolu = o siparişin kalemleri. */
  purchaseOrderId: string | null;
  intake: IntakeTabData;
  /** Alış fiyatı kolonu — depo-üstü rolde açık, depoya bağlı personelde kapalı (rol sınırı). */
  showCost: boolean;
  onClose: () => void;
  onDone: (outcome: ReceiveOutcome) => void;
}

export function IntakeDialog({ purchaseOrderId, intake, showCost, onClose, onDone }: IntakeDialogProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [loading, setLoading] = useState(purchaseOrderId !== null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Bu diyalogda açılan tedarikçiler — sunucudan gelen listeye EKLENİR, onu ezmez.
   *
   * Sayfa tazelenince (`router.refresh`) kalıcı liste zaten onu içerecek; ama kabul daha
   * kaydedilmeden seçilebilmesi gerekiyor ve bir tur beklemek akışı kırardı.
   */
  const [extraSuppliers, setExtraSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [values, setValues] = useState<IntakeFormValues>({
    // **Depo ÖN SEÇİLİ ama VARSAYILAN DEĞİL:** bağlamda tek depo seçiliyse o gelir (soru zaten
    // cevaplanmış), yoksa boş kalır ve form soruyu sorar (`CLAUDE §1`).
    warehouseId: intake.warehouseId ?? '',
    supplierId: '',
    documentNo: '',
    date: '',
    lines: [],
  });

  useEffect(() => {
    if (!purchaseOrderId) return;
    let alive = true;
    setLoading(true);
    void openIntakeFormAction(purchaseOrderId)
      .then(({ data, error: failed }) => {
        if (!alive) return;
        if (failed || !data) {
          setError(failed ?? 'Sipariş kalemleri okunamadı.');
          return;
        }
        setValues((current) => ({
          ...current,
          lines: data.map((row) => ({
            ...emptyIntakeLine(row.variantId, titleOf(row.productName, row.variantLabel), row.expectedQty),
          })),
        }));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [purchaseOrderId]);

  const blocked = intakeBlock(values);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const { data, error: failed } = await receiveIntakeAction({
        warehouseId: values.warehouseId,
        purchaseOrderId,
        supplierId: values.supplierId || null,
        date: values.date || null,
        // Belge numarası kabulün NOTUNA yazılır: `stock_intake`in ayrı bir numara kolonu yok ve
        // açmıyoruz — irsaliye numarası bizim ürettiğimiz bir kimlik değil, karşı tarafın kâğıdı.
        note: values.documentNo.trim() ? `İrsaliye/fatura: ${values.documentNo.trim()}` : null,
        lines: countedLines(values).map((line) => ({
          variantId: line.variantId,
          qty: line.qty as number,
          expiryDate: line.expiryDate,
          lotNumber: line.lotNumber,
          location: line.location,
          unitCost: line.unitCost,
        })),
      });

      if (failed || !data) {
        setError(failed ?? 'Kabul kaydedilemedi.');
        return;
      }
      onDone(data);
      router.refresh();
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={purchaseOrderId ? 'Siparişten mal kabul' : 'İrsaliyesiz mal kabul'}
      subtitle={
        purchaseOrderId
          ? 'Gelen adedi sayarak girin; gelmeyen kalemi “gelmedi” işaretleyin — boş satır “saymadım” demektir.'
          : 'Katalogdan ürün arayıp satır ekleyin; her satırın son kullanma tarihi zorunludur.'
      }
      maxWidth={showCost ? 1080 : 940}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {/* Engel SEBEBİYLE yazılır: kilitli ama sebepsiz bir düğme, operatörü neyi düzelteceğini
              aramaya bırakır. */}
          <span className="font-ops-body text-ops-xs text-ops-muted">{error ?? blocked ?? ''}</span>
          <div className="flex flex-none items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Vazgeç
            </Button>
            <Button size="sm" onClick={submit} disabled={busy || loading || blocked !== null}>
              {busy ? 'Yazılıyor…' : 'Kabulü tamamla'}
            </Button>
          </div>
        </div>
      }
    >
      {loading ? (
        <p className="px-1 py-6 font-ops-body text-ops-sm text-ops-muted">Sipariş kalemleri yükleniyor…</p>
      ) : (
        <IntakeFormBody
          values={values}
          onChange={setValues}
          onSearch={(term) => searchIntakeVariantsAction(term).then(({ data }) => data ?? [])}
          suppliers={[...intake.suppliers, ...extraSuppliers]}
          warehouses={intake.warehouseOptions}
          showCost={showCost}
          onCreateSupplier={async (name, phone) => {
            const { data, error: failed } = await createSupplierAction(name, phone);
            // Hata sessiz KALMIYOR: satır açık kalır ve sebep alt barda görünür — "ekledim ama
            // seçilmedi" hâli, kaydı yanlış tedarikçiye yazmanın en kolay yolu olurdu.
            if (failed || !data) {
              setError(failed ?? 'Tedarikçi eklenemedi.');
              return null;
            }
            // Yeni tedarikçi listeye de giriyor: aynı formda ikinci kez arandığında bulunmalı.
            setExtraSuppliers((prev) => [...prev, data]);
            return data;
          }}
          disabled={busy}
        />
      )}
    </Dialog>
  );
}
