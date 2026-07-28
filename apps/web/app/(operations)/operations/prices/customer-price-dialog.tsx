'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { vatBaseOf } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Combobox } from '@/components/operation/form/combobox';
import { FieldShell } from '@/components/operation/form/field-shell';
import { MoneyField } from '@/components/operation/form/money-input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { money, percent } from '@/components/operation/ui/format';
import {
  removeCustomerPriceAction,
  searchCustomersAction,
  searchVariantsAction,
  setCustomerPriceAction,
} from './actions';
import type { Channel } from '@lezzet/types';
import type { CustomerOption, CustomerPriceRow, VariantOption } from './prices-types';

// Müşteriye özel fiyat — ekleme ve düzenleme AYNI diyalog.
//
// Düzenlemede müşteri ve boy KİLİTLİ: "başka müşteriye taşı" diye bir iş yok; o, birini kaldırıp
// ötekini açmaktır ve iki ayrı karardır. Kilit, yanlışlıkla başka bir anlaşmayı ezmeyi de önler.
//
// Kanal seçimi zorunlu ve tabanı ekranda yazılı: B2C fiyatı KDV DAHİL, B2B hariç (DOMAIN §5). Aynı
// müşteriye iki kanalda iki ayrı özel fiyat verilebilir — ikisi ayrı satırdır.

interface CustomerPriceDialogProps {
  /** Dolu → düzenleme (müşteri ve boy kilitli); boş → yeni özel fiyat. */
  editing: CustomerPriceRow | null;
  onClose: () => void;
}

export function CustomerPriceDialog({ editing, onClose }: CustomerPriceDialogProps) {
  const router = useRouter();
  const isEdit = editing !== null;

  const [customer, setCustomer] = useState<CustomerOption | null>(
    editing ? { id: editing.customerId, name: editing.customerName, hint: '', isCompany: editing.isCompany } : null,
  );
  const [picked, setPicked] = useState<VariantOption | null>(null);
  const [channel, setChannel] = useState<Channel>(editing?.channel ?? 'b2b');
  const [amount, setAmount] = useState<number | null>(editing ? fromCents(editing.specialCents) : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Boy araması da SUNUCUDA (müşteri aramasıyla aynı gerekçe): katalog veriyle büyür, tamamını
  // diyaloga indirmek bir gün sessizce eksik liste gösterirdi. Düzenlemede seçici hiç açılmaz —
  // boy kilitlidir ve adı satırdan gelir, yani bu okuma yalnız YENİ kayıtta yapılır.
  const [pool, setPool] = useState<VariantOption[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const searchVariants = (term: string) => {
    if (!term.trim()) {
      setPool([]);
      return;
    }
    setPoolLoading(true);
    void searchVariantsAction(term)
      .then(({ data }) => setPool(data ?? []))
      .finally(() => setPoolLoading(false));
  };

  // Müşteri araması SUNUCUDA: liste veriyle büyür, tamamını diyaloga indirmek yanlış olurdu.
  // Gecikme (debounce) `Combobox`'ın içinde — burada yalnız sonuç ve bekleme durumu tutulur.
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const search = (term: string) => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    void searchCustomersAction(term)
      .then(({ data }) => setResults(data ?? []))
      .finally(() => setSearching(false));
  };

  // Seçim KENDİ durumunda durur, arama sonuçlarından türetilmez: her yeni terim listeyi
  // değiştirir ve seçili boy ekrandan silinirdi (müşteri seçicisinin deseni).
  const selectedVariant = picked;
  const variantId = editing?.variantId ?? picked?.variantId ?? '';

  const listCents = editing?.listCents ?? null;
  const amountCents = amount === null ? null : toCents(amount);
  // Liste fiyatına göre indirim — özel fiyatın ne kadar altında olduğunu söyler. Düzenlemede liste
  // fiyatı elimizde; yeni kayıtta boy seçilene kadar bilinmiyor ve satır yazılmaz.
  const discountPercent =
    listCents === null || listCents === 0 || amountCents === null ? null : ((listCents - amountCents) / listCents) * 100;

  const submit = async () => {
    if (!customer) return;
    setBusy(true);
    setError(null);
    const { error: actionError } = await setCustomerPriceAction(customer.id, variantId, channel, amountCents ?? 0);
    setBusy(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
    onClose();
  };

  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const { error: actionError } = await removeCustomerPriceAction(editing.customerId, editing.variantId, editing.channel);
    setBusy(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
    onClose();
  };

  const blocked = !customer
    ? 'Müşteri seçilmeli'
    : !variantId
      ? 'Boy seçilmeli'
      : amount === null || amount <= 0
        ? 'Fiyat sıfırdan büyük olmalı'
        : null;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={520}
      title={isEdit ? 'Özel fiyatı düzenle' : 'Müşteriye özel fiyat'}
      subtitle={isEdit ? `${editing.customerName} · ${editing.variantTitle}` : 'Kalıcı anlaşma — çözümde en üstte gelir'}
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : 'Verilmiş siparişleri etkilemez'}
          </span>
          {/* Kaldırma yalnız düzenlemede ve hiçbir koşulda kilitlenmez: yanlış açılmış bir anlaşma
              her zaman geri alınabilmeli. */}
          {isEdit ? (
            <Button variant="secondary" onClick={() => void remove()} disabled={busy}>
              Kaldır
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || blocked !== null} title={blocked ?? undefined}>
            {busy ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Fiyatı ver'}
          </Button>
        </>
      }
    >
      {isEdit ? (
        <LockedRow label="Müşteri" value={editing.customerName} note={editing.isCompany ? 'B2B' : 'B2C'} />
      ) : (
        <FieldShell label="Müşteri" required>
          <Combobox
            value={customer?.id ?? ''}
            selectedLabel={customer?.name}
            onChange={(id) => setCustomer(results.find((c) => c.id === id) ?? null)}
            options={results.map((c) => ({
              value: c.id,
              label: c.name,
              meta: c.hint,
              trailing: c.isCompany ? 'B2B' : 'B2C',
            }))}
            onSearch={search}
            loading={searching}
            placeholder="Müşteri seç"
            searchPlaceholder="Ad, telefon ya da e-posta ara…"
            emptyText="Eşleşen müşteri yok. Kaydı olmayan müşteri önce Müşteriler ekranından açılmalı."
          />
        </FieldShell>
      )}

      {isEdit ? (
        <LockedRow label="Boy" value={editing.variantTitle} note={editing.channel === 'b2b' ? 'B2B' : 'B2C'} />
      ) : (
        <FieldShell label="Boy" required>
          <Combobox
            value={variantId}
            onChange={(id) => setPicked(pool.find((v) => v.variantId === id) ?? null)}
            options={pool.map((v) => ({
              value: v.variantId,
              label: v.title,
              // Satışa kapalı boy GİZLENMEZ, işaretlenir: özel fiyat satışa açılmadan önce de
              // hazırlanabilir (aşağıdaki uyarı bunu söyler).
              meta: v.sellable ? undefined : 'satışa kapalı',
            }))}
            onSearch={searchVariants}
            loading={poolLoading}
            selectedLabel={selectedVariant?.title}
            placeholder="Boy seç"
            searchPlaceholder="Ürün adı ara…"
            emptyText="Eşleşen ürün yok"
          />
          {selectedVariant && !selectedVariant.sellable ? (
            <span className="font-ops-body text-ops-xs text-ops-amber-dark">
              Bu boy şu an satışa kapalı (ürün pasif/aday ya da boy kapalı). Özel fiyat yine de yazılabilir — satışa
              açıldığında yürürlükte olur.
            </span>
          ) : null}
        </FieldShell>
      )}

      {!isEdit ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-body text-ops-xs font-medium text-ops-body">Kanal</span>
          <MultiToggle
            value={channel}
            onChange={setChannel}
            label="Kanal"
            options={[
              { key: 'b2b', label: 'B2B (KDV hariç)' },
              { key: 'b2c', label: 'B2C (KDV dahil)' },
            ]}
          />
        </div>
      ) : null}

      <MoneyField
        label={`Özel fiyat (€) · ${vatBaseOf(channel) === 'ttc' ? 'KDV dahil' : 'KDV hariç'}`}
        required
        id="customer-price"
        value={amount}
        onChange={setAmount}
        placeholder="ör. 13,50"
      />

      {/* Liste fiyatıyla karşılaştırma yalnız DÜZENLEMEDE var: yeni kayıtta boyun liste fiyatını
          okumak için ayrı bir tur gerekirdi ve seçim her değiştiğinde tekrarlanırdı. */}
      {listCents !== null && amountCents !== null ? (
        <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
          Kanal listesi {money(listCents)} ·{' '}
          {discountPercent !== null && discountPercent > 0 ? (
            <span className="font-ops-mono text-ops-olive-dark">{percent(discountPercent, 1)} indirim</span>
          ) : discountPercent !== null && discountPercent < 0 ? (
            <span className="font-ops-mono text-ops-amber">liste fiyatının ÜSTÜNDE</span>
          ) : (
            <span className="font-ops-mono">listeyle aynı</span>
          )}
        </span>
      ) : null}

      <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Özel fiyat fiyat çözümünün en üstündedir: bu müşteri bu boyu her zaman bu tutardan alır, kanal listesi
        değişse bile. Genel indirim oranı ve kuponlar bu satıra uygulanmaz. Tek seferlik pazarlık burada değil,
        siparişin kendi içinde yapılır.
      </span>
    </Dialog>
  );
}

interface LockedRowProps {
  label: string;
  value: string;
  note: string;
}

/** Düzenlemede değişmeyen alan — kilidin sebebi görünsün diye alan gibi çizilir, girdi gibi değil. */
function LockedRow({ label, value, note }: LockedRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-2.5">
      <div className="flex min-w-0 flex-col gap-px">
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted">{label}</span>
        <span className="truncate font-ops-body text-ops-sm font-medium text-ops-ink">{value}</span>
      </div>
      <span className="flex-none font-ops-mono text-ops-xs text-ops-muted">{note}</span>
    </div>
  );
}

