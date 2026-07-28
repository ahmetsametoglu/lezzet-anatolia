'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { vatBaseOf } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Input } from '@/components/operation/form/input';
import { MoneyField } from '@/components/operation/form/money-input';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { money, percent } from '@/components/operation/ui/format';
import {
  loadVariantPoolAction,
  removeCustomerPriceAction,
  searchCustomersAction,
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

/** Müşteri araması URL'e değil, doğrudan sunucuya gider; yazarken her tuşta gitmesin. */
const SEARCH_DEBOUNCE_MS = 300;

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
  const [variantId, setVariantId] = useState<string>(editing?.variantId ?? '');
  const [channel, setChannel] = useState<Channel>(editing?.channel ?? 'b2b');
  const [amount, setAmount] = useState<number | null>(editing ? fromCents(editing.specialCents) : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Boy havuzu diyalog açılınca okunur; düzenlemede de okunur çünkü boyun ADI gösterilecek.
  const [pool, setPool] = useState<VariantOption[]>([]);
  useEffect(() => {
    void loadVariantPoolAction().then(({ data }) => setPool(data ?? []));
  }, []);

  const selectedVariant = pool.find((v) => v.variantId === variantId) ?? null;
  const variantTitle = selectedVariant?.title ?? editing?.variantTitle ?? '';

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
        <CustomerPicker selected={customer} onSelect={setCustomer} />
      )}

      {isEdit ? (
        <LockedRow label="Boy" value={editing.variantTitle} note={editing.channel === 'b2b' ? 'B2B' : 'B2C'} />
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-body text-ops-xs font-medium text-ops-body">Boy</span>
          <div className="flex items-center gap-2.5">
            {/* Aramalı seçici TEK kaynak (`MultiSelect`): burada tek seçim gibi kullanılıyor — son
                seçilen kazanır. Katalog seçicisi için ikinci bir bileşen yazılmadı. */}
            <MultiSelect
              options={pool.map((v) => ({ value: v.variantId, label: v.title }))}
              selected={variantId ? [variantId] : []}
              onChange={(next) => setVariantId(next[next.length - 1] ?? '')}
              hideSelected
              addLabel={variantId ? '+ değiştir' : '+ boy seç'}
              searchPlaceholder="Ürün ya da boy ara…"
            />
            <span className={`truncate font-ops-body text-ops-sm ${variantId ? 'text-ops-ink' : 'text-ops-faint'}`}>
              {variantTitle || 'boy seçilmedi'}
            </span>
          </div>
          {selectedVariant && !selectedVariant.sellable ? (
            <span className="font-ops-body text-ops-xs text-ops-amber-dark">
              Bu boy şu an satışa kapalı (ürün pasif/aday ya da boy kapalı). Özel fiyat yine de yazılabilir — satışa
              açıldığında yürürlükte olur.
            </span>
          ) : null}
        </div>
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

interface CustomerPickerProps {
  selected: CustomerOption | null;
  onSelect: (customer: CustomerOption | null) => void;
}

/**
 * Müşteri seçici — arama SUNUCUDA. Müşteri kümesi veriyle sınırsız büyür; havuzu diyaloga indirmek
 * katalogla aynı şey değil, listenin tavanı yok. Bu yüzden yazdıkça aranır, sonuç tavanlıdır.
 */
function CustomerPicker({ selected, onSelect }: CustomerPickerProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const onTerm = (next: string) => {
    setTerm(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!next.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      void searchCustomersAction(next)
        .then(({ data }) => setResults(data ?? []))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
  };

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-ops-card border border-ops-olive-line bg-ops-olive-bg px-3.5 py-2.5">
        <div className="flex min-w-0 flex-col gap-px">
          <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-olive-dark">
            Müşteri
          </span>
          <span className="truncate font-ops-body text-ops-sm font-medium text-ops-ink">{selected.name}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onSelect(null)}>
          Değiştir
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-body text-ops-xs font-medium text-ops-body">Müşteri</span>
      <Input value={term} onChange={(e) => onTerm(e.target.value)} placeholder="Ad, telefon ya da e-posta ara…" />
      {term.trim() ? (
        <div className="max-h-[168px] overflow-y-auto rounded-ops-card border border-ops-line">
          {searching && results.length === 0 ? (
            <span className="block px-3.5 py-2.5 font-ops-body text-ops-xs text-ops-muted">Aranıyor…</span>
          ) : results.length === 0 ? (
            <span className="block px-3.5 py-2.5 font-ops-body text-ops-xs text-ops-muted">
              Eşleşen müşteri yok. Müşteri kaydı yoksa önce Müşteriler ekranından açılmalı.
            </span>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                className="flex w-full cursor-pointer flex-col items-start gap-px border-b border-ops-line-soft px-3.5 py-2 text-left transition-colors last:border-b-0 hover:bg-ops-subtle"
              >
                <span className="font-ops-body text-ops-sm font-medium text-ops-ink">
                  {c.name}
                  {c.isCompany ? <span className="ml-1.5 font-ops-mono text-ops-micro text-ops-blue">B2B</span> : null}
                </span>
                <span className="font-ops-body text-ops-xs text-ops-muted">{c.hint}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
