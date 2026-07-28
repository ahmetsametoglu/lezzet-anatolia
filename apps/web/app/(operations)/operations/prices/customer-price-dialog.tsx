'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isBelowTargetMargin, markupPercent, revenueHtOf, vatBaseOf } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Combobox } from '@/components/operation/form/combobox';
import { FieldShell } from '@/components/operation/form/field-shell';
import { MoneyField } from '@/components/operation/form/money-input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { money, percent } from '@/components/operation/ui/format';
import { Metric } from '@/components/operation/ui/metric';
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

  const amountCents = amount === null ? null : toCents(amount);

  // KARAR BAĞLAMI — iki kaynaktan tek yere: düzenlemede satırın kendisi, yeni kayıtta seçilen boy.
  // Ekranın sorusu ikisinde de aynı: "bu fiyata satarsam kâr mı ediyorum, indirim mi yapıyorum".
  const context = editing
    ? { listCents: editing.listCents, costCents: editing.costCents, vatRate: editing.vatRate, target: editing.targetMarginPercent }
    : picked
      ? { listCents: picked.listCents[channel], costCents: picked.costCents, vatRate: picked.vatRate, target: picked.targetMarginPercent }
      : null;
  const listCents = context?.listCents ?? null;

  // Liste fiyatına göre indirim/zam — özel fiyatın listenin ne kadar altında (ya da üstünde) olduğu.
  const discountPercent =
    listCents === null || listCents === 0 || amountCents === null ? null : ((listCents - amountCents) / listCents) * 100;

  // Gerçekleşen marj: KDV HARİÇ tabanda, ekranın geri kalanıyla AYNI tanım (maliyet üzerine markup).
  // Client yeniden formül yazmaz — dönüşüm de karşılaştırma da motordan gelir.
  const revenueHt = context && amountCents !== null ? revenueHtOf(channel, amountCents, context.vatRate) : null;
  const marginPercent = revenueHt === null || !context ? null : markupPercent(revenueHt, context.costCents ?? 0);
  const belowTarget = revenueHt === null || !context ? null : isBelowTargetMargin(revenueHt, context.costCents, context.target);
  const underCost = revenueHt !== null && context?.costCents != null && revenueHt < context.costCents;

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

      {/* KARAR SATIRI — "bu fiyatı verirsem ne oluyor". Fiyat kutusunun ALTINDA, çünkü cevabı
          değiştiren şey girilen tutar; üstte dursaydı operatör yazarken görmeyeceği bir sayıya
          bakardı. Boy seçilene kadar hiçbir şey gösterilmez: sayı UYDURULMAZ. */}
      {context && amountCents !== null ? (
        <div className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3">
          <div className="grid grid-cols-3 gap-2.5">
            <Metric label="Kanal listesi" value={money(listCents)} />
            <Metric label="Maliyet" value={money(context.costCents)} />
            <Metric
              label="Bu fiyatla marj"
              value={marginPercent === null ? '—' : percent(marginPercent)}
              tone={underCost || belowTarget === true ? 'red' : undefined}
            />
          </div>

          <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
            {discountPercent === null ? (
              'Bu kanalda liste fiyatı yok — karşılaştırılacak bir tutar bulunmuyor.'
            ) : discountPercent > 0 ? (
              <>
                Listeye göre <span className="font-ops-mono text-ops-olive-dark">{percent(discountPercent, 1)} indirim</span>
              </>
            ) : discountPercent < 0 ? (
              <>
                Listeye göre <span className="font-ops-mono text-ops-amber-dark">{percent(-discountPercent, 1)} ZAM</span>
              </>
            ) : (
              'Liste fiyatıyla aynı.'
            )}
            {context.target !== null ? ` · hedef marj %${context.target}` : ''}
          </span>

          {/* İki ayrı uyarı, iki ayrı ağırlık: maliyetin altı ZARARDIR, hedefin altı bir tercihtir. */}
          {underCost ? (
            <span className="font-ops-body text-ops-xs font-semibold leading-[1.6] text-ops-red">
              MALİYETİN ALTINDA — bu fiyattan her satış zarar yazar (maliyet {money(context.costCents)}, KDV hariç).
            </span>
          ) : belowTarget === true ? (
            <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-amber-dark">
              Hedef marjın altında. Engel değil — anlaşma bilinçliyse yazılabilir, ama kârın ne kadarından
              vazgeçildiği burada görünür.
            </span>
          ) : context.costCents === null ? (
            <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-amber-dark">
              Maliyet bilinmiyor (bu boyda alış kaydı yok) — kâr hesaplanamıyor.
            </span>
          ) : null}
        </div>
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

