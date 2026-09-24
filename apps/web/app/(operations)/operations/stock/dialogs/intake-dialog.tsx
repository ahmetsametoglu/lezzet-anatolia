'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { SkeletonMetric, SkeletonRows } from '@/components/operation/ui/skeleton';
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
 * Mal kabul formu, liste üstünde diyalog: siparişli kipte kalemler siparişten yüklenir, irsaliyesiz kipte katalogdan aranarak eklenir.
 * Ismarlanan adet ayrı kolonda okunur ama "gelen" hanesine yazılmaz, çünkü dolu hane saymadan onaylamayı teklif ederdi.
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
        // Fiyat salt okunur gösterilir: kabulün siparişten yazacağı değer, düzenlenmez ve geri gönderilmez.
        setValues((current) => ({
          ...current,
          lines: data.rows.map((row) => {
            const cents = data.unitCostsCents?.[row.variantId];
            return {
              ...emptyIntakeLine(row.variantId, titleOf(row.productName, row.variantLabel), row.expectedQty),
              unitCost: cents === undefined ? null : cents / 100,
            };
          }),
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
          storageAreaId: line.storageAreaId,
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
        /* Formun şekli önden çizilir: kalemler gelince diyalog birden dolup operatörün basmak üzere olduğu düğmeyi aşağı itmesin. */
        <div className="flex flex-col gap-4 px-1 py-2" aria-hidden="true">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonMetric key={i} boxed={false} />
            ))}
          </div>
          <SkeletonRows rows={3} />
        </div>
      ) : (
        <IntakeFormBody
          values={values}
          onChange={setValues}
          onSearch={(term) => searchIntakeVariantsAction(term).then(({ data }) => data ?? [])}
          suppliers={[...intake.suppliers, ...extraSuppliers]}
          warehouses={intake.warehouseOptions}
          storageAreas={intake.storageAreas}
          showCost={showCost}
          costReadOnly
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
