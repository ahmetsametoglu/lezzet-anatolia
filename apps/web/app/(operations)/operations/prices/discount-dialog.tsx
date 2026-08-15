'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { ToggleField } from '@/components/operation/form/toggle';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
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
      // İki sütunlu gövde (15.08, kullanıcı bildirimi: tek sütun "çok karışık") — genişlik ona göre.
      maxWidth={880}
      title={isEdit ? 'İndirimi düzenle' : 'Yeni indirim / kupon'}
      subtitle={
        values.trigger === 'coupon' ? 'Müşteri kodu yazarak kullanır' : 'Koşullar tutunca kendiliğinden uygulanır'
      }
      // Tetik BAŞLIKTA (15.08, kullanıcı kararı): kupon/kampanya seçimi formun bir alanı değil,
      // formun kimliği — başlık ve alt başlıkla aynı satırda döner, gövde `showTriggerToggle=false`.
      headerAside={
        <MultiToggle
          value={values.trigger}
          onChange={(next) => setValues({ ...values, trigger: next })}
          label="Tetik"
          size="sm"
          options={[
            { key: 'coupon', label: 'Kupon (kodlu)' },
            { key: 'automatic', label: 'Otomatik kampanya' },
          ]}
        />
      }
      footer={
        <>
          {/* Aktif anahtarı FOOTER'DA, kitin `bare` çeşidiyle (15.08, kullanıcı kararı — ToggleField
              künyesi zaten "dialog alt barı" diyor): kayıt kararıyla aynı satırda durur. */}
          <ToggleField
            bare
            label="Aktif"
            on={values.isActive}
            onChange={(next) => setValues({ ...values, isActive: next })}
          />
          <span className="mr-auto pl-3 font-ops-body text-ops-xs text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : null}
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
        columns={2}
        showActiveToggle={false}
        showTriggerToggle={false}
      />
    </Dialog>
  );
}
