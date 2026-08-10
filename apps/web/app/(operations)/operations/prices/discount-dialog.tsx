'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { saveDiscountAction } from '@/lib/prices/discount-actions';
import {
  DiscountFormBody,
  discountBlocked,
  discountInputOf,
  discountValuesOf,
  emptyDiscountValues,
  type DiscountFormValues,
} from '@/components/operation/form/discount-form';
import type { CategoryOption, DiscountRow } from './prices-types';

/**
 * İndirim / kupon penceresi — KABUK. Alanlar, kurallar ve dönüşüm `discount-form`'da (22.10).
 *
 * Gövde ayrıldı çünkü aynı form asistan kuyruğunun içinde de çiziliyor: öneri onaylanırken operatör
 * fiyat ekranına gitmiyor, formu kuyrukta görüyor. Burada kalanlar yalnız PENCEREYE ait olanlar —
 * başlık, alt bar, kaydetme çağrısı ve kapanış. Bir alan eklemek gerektiğinde `discount-form`
 * düzenlenir ve iki yüzeyde birden görünür; bu ayrımın bütün amacı bu.
 *
 * Kupon ve kampanya AYNI form: ayrımları tek anahtarda (tetik) ve o anahtar formun en üstünde.
 */

interface DiscountDialogProps {
  /** Dolu → düzenleme; boş → yeni kural. */
  editing: DiscountRow | null;
  categories: CategoryOption[];
  collections: CategoryOption[];
  onClose: () => void;
}

export function DiscountDialog({ editing, categories, collections, onClose }: DiscountDialogProps) {
  const router = useRouter();
  const isEdit = editing !== null;

  const [values, setValues] = useState<DiscountFormValues>(() =>
    editing === null ? emptyDiscountValues() : discountValuesOf(editing),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const blocked = discountBlocked(values);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error: actionError } = await saveDiscountAction(discountInputOf(values, editing?.id ?? null));
    setBusy(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={560}
      title={isEdit ? 'İndirimi düzenle' : 'Yeni indirim / kupon'}
      subtitle={
        values.trigger === 'coupon' ? 'Müşteri kodu yazarak kullanır' : 'Koşullar tutunca kendiliğinden uygulanır'
      }
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {error ? (
              <span className="font-semibold text-ops-red">{error}</span>
            ) : (
              'Tek-en-büyük: indirimler üst üste binmez'
            )}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || blocked !== null}
            title={blocked ?? undefined}
          >
            {busy ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Oluştur'}
          </Button>
        </>
      }
    >
      <DiscountFormBody
        values={values}
        onChange={setValues}
        categories={categories}
        collections={collections}
        codeUsage={editing?.codes}
        disabled={busy}
      />
    </Dialog>
  );
}
