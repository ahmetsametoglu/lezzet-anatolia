'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fromCents, toCents } from '@lezzet/helper';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Input } from '@/components/operation/form/input';
import { MoneyField, PercentField } from '@/components/operation/form/money-input';
import { DateRangeField } from '@/components/operation/form/date-field';
import { parseDay, toDay } from '@/components/operation/form/calendar-math';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { Select } from '@/components/operation/form/select';
import { Toggle } from '@/components/operation/form/toggle';
import { saveDiscountAction } from './actions';
import type { DiscountScope, DiscountTrigger, DiscountType } from '@lezzet/types';
import type { CategoryOption, DiscountRow } from './prices-types';

// İndirim / kupon formu — kupon ve kampanya AYNI form. Ayrımları tek anahtarda (tetik) ve o anahtar
// formun en üstünde: seçim, altındaki alanların anlamını değiştirir (kod alanı yalnız kuponda var).
//
// DEĞER TEK KUTU, iki taban: yüzde mi sabit tutar mı olduğunu tip anahtarı söyler. İki ayrı kutu
// koymak "hangisini doldurayım" sorusunu doğururdu; boş kalan kutu da bir yanlış anlama kaynağıdır.
//
// KOŞULLAR opsiyoneldir ve boş bırakılan koşul YOKTUR — 0 ile karıştırılmamalı. Bu yüzden alanlar
// sıfırla değil BOŞ başlar ve yer tutucular "sınırsız" der.
//
// Kaydetmenin son emniyeti DB kısıtlarıdır (0031): kodsuz kupon, hedefsiz kapsam, ters tarih ve
// tekrarlanan kod veritabanında reddedilir. Form aynı kuralı gösterir ama gerçeğin sahibi tektir.

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

  const [name, setName] = useState(editing?.name ?? '');
  const [trigger, setTrigger] = useState<DiscountTrigger>(editing?.trigger ?? 'coupon');
  const [code, setCode] = useState(editing?.code ?? '');
  const [type, setType] = useState<DiscountType>(editing?.type ?? 'percent');
  // Tek alan, iki taban: yüzdede sayı, sabit tutarda KURUŞ tutulur.
  const [value, setValue] = useState<number | null>(
    editing === null ? null : editing.type === 'fixed' ? fromCents(editing.value) : editing.value,
  );
  const [scope, setScope] = useState<DiscountScope>(editing?.scope ?? 'cart');
  const [targetId, setTargetId] = useState<string>('');
  const [minBasket, setMinBasket] = useState<number | null>(
    editing?.minBasketCents == null ? null : fromCents(editing.minBasketCents),
  );
  const [firstOrderOnly, setFirstOrderOnly] = useState(editing?.firstOrderOnly ?? false);
  const [validFrom, setValidFrom] = useState(toDayValue(editing?.validFrom ?? null));
  const [validTo, setValidTo] = useState(toDayValue(editing?.validTo ?? null));
  const [maxUses, setMaxUses] = useState<string>(editing?.maxUses?.toString() ?? '');
  const [perCustomerLimit, setPerCustomerLimit] = useState<string>(editing?.perCustomerLimit?.toString() ?? '');
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targets = scope === 'category' ? categories : scope === 'collection' ? collections : [];

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error: actionError } = await saveDiscountAction({
      id: editing?.id ?? null,
      name,
      trigger,
      code,
      type,
      valueCents: value === null ? 0 : type === 'fixed' ? toCents(value) : value,
      scope,
      targetId: scope === 'cart' ? null : targetId || null,
      minBasketCents: minBasket === null ? null : toCents(minBasket),
      firstOrderOnly,
      validFrom: validFrom ? new Date(validFrom).toISOString() : null,
      // Bitiş GÜNÜN SONU: "31 Tem'e kadar" yazan operatör 31 Temmuz akşamını kasteder, sabahını değil.
      validTo: validTo ? new Date(`${validTo}T23:59:59`).toISOString() : null,
      // Kişisel kupon bu formdan AÇILMAZ: sahibi puan kullanımıdır (modül 16). Elle açılması
      // gerektiğinde müşteri ekranından bağlanacak — burada sessizce `null`.
      customerId: null,
      maxUses: maxUses.trim() ? Number(maxUses) : null,
      perCustomerLimit: perCustomerLimit.trim() ? Number(perCustomerLimit) : null,
      isActive,
    });
    setBusy(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
    onClose();
  };

  const blocked = !name.trim()
    ? 'Ad girilmeli'
    : trigger === 'coupon' && !code.trim()
      ? 'Kupon kodu girilmeli'
      : value === null || value <= 0
        ? 'İndirim değeri girilmeli'
        : scope !== 'cart' && !targetId
          ? 'Kapsam hedefi seçilmeli'
          : null;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={560}
      title={isEdit ? 'İndirimi düzenle' : 'Yeni indirim / kupon'}
      subtitle={trigger === 'coupon' ? 'Müşteri kodu yazarak kullanır' : 'Koşullar tutunca kendiliğinden uygulanır'}
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : 'Tek-en-büyük: indirimler üst üste binmez'}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || blocked !== null} title={blocked ?? undefined}>
            {busy ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Oluştur'}
          </Button>
        </>
      }
    >
      <Field label="Tetik">
        <MultiToggle
          value={trigger}
          onChange={setTrigger}
          label="Tetik"
          options={[
            { key: 'coupon', label: 'Kupon (kodlu)' },
            { key: 'automatic', label: 'Otomatik kampanya' },
          ]}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ad" hint="Listede tanıyacağınız ad">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Bayram indirimi" />
        </Field>
        {trigger === 'coupon' ? (
          <Field label="Kod" hint="Müşterinin yazacağı; harf ayrımsız tekil">
            {/* Kod HER ZAMAN büyük harfe çevrilir: müşteri "bayram10" yazsa da aynı kupon bulunur,
                ama listede tek bir yazım görünsün. */}
            <Input
              value={code}
              mono
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ör. BAYRAM10"
            />
          </Field>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="İndirim tipi">
          <MultiToggle
            value={type}
            onChange={setType}
            label="İndirim tipi"
            options={[
              { key: 'percent', label: 'Yüzde' },
              { key: 'fixed', label: 'Sabit tutar' },
            ]}
          />
        </Field>
        {type === 'percent' ? (
          <PercentField label="Değer (%)" labelAside="zorunlu" id="discount-value" value={value} onChange={setValue} placeholder="ör. 10" />
        ) : (
          <MoneyField label="Değer (€)" required id="discount-value" value={value} onChange={setValue} placeholder="ör. 5,00" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Kapsam" hint="Kupon daima sepet kapsamındadır">
          <Select
            value={scope}
            onChange={(next) => {
              setScope(next as DiscountScope);
              setTargetId('');
            }}
            options={[
              { value: 'cart', label: 'Sepet (tümü)' },
              { value: 'category', label: 'Kategori' },
              { value: 'collection', label: 'Koleksiyon' },
            ]}
          />
        </Field>
        {scope !== 'cart' ? (
          <Field label={scope === 'category' ? 'Kategori' : 'Koleksiyon'}>
            <Select
              value={targetId}
              onChange={setTargetId}
              placeholder="Seç"
              options={targets.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Field>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label="Asgari sepet (€)"
          labelAside="boş = koşul yok"
          id="discount-min-basket"
          value={minBasket}
          onChange={setMinBasket}
          placeholder="ör. 50,00"
        />
        <Field label="Yalnız ilk sipariş">
          <div className="flex items-center gap-2.5 rounded-ops-card border border-ops-line px-3 py-2">
            <Toggle on={firstOrderOnly} onChange={setFirstOrderOnly} label="Yalnız ilk sipariş" />
            <span className="font-ops-body text-ops-xs text-ops-muted">
              {firstOrderOnly ? 'Yalnız ilk siparişte geçerli' : 'Her siparişte geçerli'}
            </span>
          </div>
        </Field>
      </div>

      {/* Geçerlilik TEK alan: başlangıç ve bitiş ayrı kutularda dururken ikisi arasındaki ilişki
          (ters aralık) ancak kaydederken görülüyordu. Aralık seçicide ters seçim zaten kurulamaz. */}
      <DateRangeField
        label="Geçerlilik"
        labelAside="boş = hemen başlar, süresiz"
        from={validFrom}
        to={validTo}
        onChange={(nextFrom, nextTo) => {
          setValidFrom(nextFrom);
          setValidTo(nextTo);
        }}
        placeholder="Süresiz"
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Toplam kullanım sınırı" hint="boş = sınırsız">
          <Input value={maxUses} mono inputMode="numeric" onChange={(e) => setMaxUses(digits(e.target.value))} placeholder="ör. 100" />
        </Field>
        <Field label="Müşteri başına sınır" hint="boş = sınırsız">
          <Input
            value={perCustomerLimit}
            mono
            inputMode="numeric"
            onChange={(e) => setPerCustomerLimit(digits(e.target.value))}
            placeholder="ör. 1"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-ops-card border border-ops-line px-3.5 py-2.5">
        <div className="flex flex-col gap-px">
          <span className="font-ops-body text-ops-sm font-medium text-ops-ink">Aktif</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            Kapalı kural hiç uygulanmaz ama listede kalır — geçmişi silinmez
          </span>
        </div>
        <Toggle on={isActive} onChange={setIsActive} label="Aktif" />
      </div>

      <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Tek-en-büyük kuralı: birden çok indirim uygun olsa bile müşteriye yalnız en büyüğü uygulanır — müşterinin
        genel indirim oranı da aynı havuzda yarışır. Paketlere ve yaklaşan tarihli teklife hiçbir genel indirim
        binmez; o kalemler kendi özel fiyatındadır.
      </span>
    </Dialog>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

/** Etiket + ipucu + alan — form kitindeki `MoneyField` deseninin, serbest kontroller için karşılığı. */
function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="font-ops-body text-ops-xs font-medium text-ops-body">{label}</span>
        {hint ? <span className="font-ops-body text-ops-micro text-ops-faint">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

/**
 * DB'deki ISO damgadan takvim GÜNÜNÜ alır. Ayrıştırma tek yerde (`calendar-math`): burada ikinci
 * bir dönüşüm yazmak, kaydedilen gün ile gösterilen günü ayrı dilimlerde farklı gösterebilirdi.
 */
function toDayValue(iso: string | null): string {
  const date = parseDay(iso);
  return date ? toDay(date) : '';
}

/** Sayı alanına yalnız rakam: "3 adet" gibi bir metin sessizce NaN'a dönerdi. */
function digits(raw: string): string {
  return raw.replace(/\D/g, '');
}
