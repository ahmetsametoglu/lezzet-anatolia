'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isBelowTargetMargin, revenueHtOf } from '@lezzet/domain-core';
import { formatPrice, fromCents, toCents } from '@lezzet/helper';
import type { PaymentMethod } from '@lezzet/types';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Button } from '@/components/operation/ui/button';
import { Combobox } from '@/components/operation/form/combobox';
import { MoneyInput } from '@/components/operation/form/money-input';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { ToggleField } from '@/components/operation/form/toggle';
import {
  createManualOrderAction,
  readAddressesAction,
  readDeliveryContextAction,
  searchCustomersAction,
  searchVariantsAction,
} from './actions';
import { CustomerDialog, AddressDialog } from './new-order-dialogs';
import type {
  AddressPickOption,
  CustomerPickOption,
  DeliveryContext,
  NewOrderLine,
  VariantPickRow,
} from './new-order-types';

/**
 * **Elle sipariş girişi** (09.8) — telefonla/DM'den gelen siparişin masada yazıldığı ekran.
 *
 * Akış SIRALI ve bu bilinçli: müşteri → adres → kalemler. Sıra bir tercih değil bir bağımlılık —
 * fiyat müşteriye göre çözülüyor (özel → grup → kanal) ve depo adresten çıkıyor, yani kalem
 * seçicisi ikisi belli olmadan doğru cevap veremez. Adımları aynı anda açsaydık operatör önce
 * ürünü seçer, sonra müşteriyi değiştirir ve fiyatların sessizce değiştiğini fark etmezdi.
 *
 * **Yerinde satış BURADA DEĞİL** (26.08): depo kapısı ve kuryenin aracı native uygulamanın işi
 * (`DOMAIN §17` — "Admin yerinde satış yapmaz"). Bu ekranın müşterisi telefonda.
 *
 * Operasyon yüzeyi YALNIZ MASAÜSTÜ (CLAUDE §2) — `*.mobile` forku yok.
 */

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  online: 'Online',
  cash: 'Nakit',
  card: 'Kart',
  cheque: 'Çek',
  bank_transfer: 'Havale',
};

/**
 * Sohbet köprüsünün taşıdığı iki şey (15.4): önseçili müşteri ve konuşmanın kimliği.
 *
 * Kimlik ekranda HİÇ kullanılmıyor, yalnız kaydederken geri gönderiliyor — kaynağı (`order_source`)
 * sunucu ondan çözüyor. Ekranın kaynağı kendisi göndermesi, istemciye "bu sipariş WhatsApp'tan
 * geldi" dedirtmek olurdu; o iddiayı adres çubuğunu düzenleyen biri de yazabilirdi.
 */
interface NewOrderDesktopProps {
  conversationId: string | null;
  initialCustomer: CustomerPickOption | null;
}

export function NewOrderDesktop({ conversationId, initialCustomer }: NewOrderDesktopProps) {
  const router = useRouter();

  const [customer, setCustomer] = useState<CustomerPickOption | null>(initialCustomer);
  const [customerOptions, setCustomerOptions] = useState<CustomerPickOption[]>([]);
  const [customerDialog, setCustomerDialog] = useState(false);

  const [addresses, setAddresses] = useState<AddressPickOption[]>([]);
  const [addressId, setAddressId] = useState('');
  const [addressDialog, setAddressDialog] = useState(false);

  const [delivery, setDelivery] = useState<DeliveryContext | null>(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [onAccount, setOnAccount] = useState(false);
  const [isGift, setIsGift] = useState(false);

  const [variantOptions, setVariantOptions] = useState<VariantPickRow[]>([]);
  const [lines, setLines] = useState<NewOrderLine[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Müşteri değişince ONA BAĞLI HER ŞEY sıfırlanır: adres, teslimat, kalemler. Kalemleri
  // bırakmak en tehlikelisi olurdu — fiyatlar önceki müşterinin çözümünden kalır ve ekran yeni
  // müşteriye onun hiç almadığı bir fiyatı gösterirdi.
  useEffect(() => {
    setAddresses([]);
    setAddressId('');
    setDelivery(null);
    setDeliveryDate('');
    setPaymentMethod('');
    setOnAccount(false);
    setLines([]);
    setVariantOptions([]);
    if (!customer) return;
    void readAddressesAction(customer.id).then(({ data }) => setAddresses(data ?? []));
  }, [customer]);

  // Adres değişince teslimat bağlamı yeniden çözülür — gün listesi, ödeme yöntemleri ve DEPO
  // adrese bağlı. Kalemler korunuyor ama stok sayıları bayatlar; seçici yeniden arandığında tazelenir.
  useEffect(() => {
    setDelivery(null);
    setDeliveryDate('');
    setPaymentMethod('');
    if (!customer || !addressId) return;
    void readDeliveryContextAction(customer.id, addressId).then(({ data }) => {
      if (!data) return;
      setDelivery(data);
      // Tek gün varsa seçim sunulmaz, o gün alınır (checkout ile aynı kural, DOMAIN §6).
      if (data.availableDates.length === 1) setDeliveryDate(data.availableDates[0]!);
    });
  }, [customer, addressId]);

  const searchCustomers = (term: string) => {
    void searchCustomersAction(term).then(({ data }) => setCustomerOptions(data ?? []));
  };

  const searchVariants = (term: string) => {
    if (!customer) return;
    void searchVariantsAction(customer.id, term, delivery?.warehouseId ?? null).then(({ data }) =>
      setVariantOptions(data ?? []),
    );
  };

  const addLine = (variantId: string) => {
    const row = variantOptions.find((v) => v.variantId === variantId);
    if (!row || row.listPriceCents === null) return;
    if (lines.some((l) => l.variantId === variantId)) return;
    setLines((prev) => [
      ...prev,
      {
        variantId: row.variantId,
        title: row.title,
        qty: 1,
        listPriceCents: row.listPriceCents!,
        unitPriceCents: row.listPriceCents!,
        costCents: row.costCents,
        targetMarginPercent: row.targetMarginPercent,
        vatRate: row.vatRate,
      },
    ]);
  };

  const patchLine = (variantId: string, patch: Partial<NewOrderLine>) => {
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)));
  };

  const subtotalCents = useMemo(() => lines.reduce((a, l) => a + l.unitPriceCents * l.qty, 0), [lines]);

  const submit = async () => {
    if (!customer || !addressId || !paymentMethod) return;
    setSubmitting(true);
    setError(null);
    const { data, error: actionError } = await createManualOrderAction({
      customerId: customer.id,
      addressId,
      deliveryDate: delivery?.deliveryType === 'route' ? deliveryDate || null : null,
      paymentMethod,
      onAccount,
      isGiftOrder: isGift,
      // Köprüden gelindiyse konuşmanın kimliği; kaynağı SUNUCU ondan çözer (künye props tipinde).
      conversationId,
      // **Fiyat YALNIZ pazarlık edildiyse gönderilir.** Dokunulmamış kalemde `null` gider ve
      // sunucu fiyatı kendisi çözer; her kaleme bir sayı göndermek siparişin parasını tarayıcıya
      // yazdırmak olurdu (kapının künyesi `createManualOrderAction`da).
      lines: lines.map((l) => ({
        variantId: l.variantId,
        qty: l.qty,
        unitPriceCents: l.unitPriceCents === l.listPriceCents ? null : l.unitPriceCents,
      })),
    });
    setSubmitting(false);
    if (actionError || !data) {
      setError(actionError ?? 'Sipariş açılamadı.');
      return;
    }
    router.push(`/operations/orders/${data.orderId}`);
  };

  const blocked =
    !customer
      ? 'Önce müşteriyi seçin'
      : !addressId
        ? 'Teslimat adresini seçin'
        : lines.length === 0
          ? 'En az bir kalem ekleyin'
          : !paymentMethod
            ? 'Ödeme yöntemini seçin'
            : delivery?.deliveryType === 'route' && !deliveryDate
              ? 'Teslimat gününü seçin'
              : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Yeni sipariş"
        subtitle="Telefonla gelen siparişin elle yazılması — kapıda satış native uygulamada"
      />

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.4fr] gap-6 overflow-y-auto p-6">
        {/* ── SOL: KİM, NEREYE, NASIL ─────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          <section className="rounded-ops-card border border-ops-line-soft bg-ops-subtle p-4">
            <h2 className="mb-3 font-ops-body text-ops-section font-bold text-ops-ink">Müşteri</h2>
            <Combobox
              value={customer?.id ?? ''}
              onChange={(id) => setCustomer(customerOptions.find((c) => c.id === id) ?? null)}
              options={customerOptions.map((c) => ({
                value: c.id,
                label: c.name,
                meta: [c.phone, c.email].filter(Boolean).join(' · ') || undefined,
                trailing: c.channel === 'b2b' ? 'B2B' : undefined,
              }))}
              selectedLabel={customer?.name}
              onSearch={searchCustomers}
              placeholder="Telefon ya da ad ile ara"
              searchPlaceholder="En az 2 karakter"
              emptyText="Kayıt bulunamadı — aşağıdan yeni müşteri açabilirsiniz."
            />
            <div className="mt-2 flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => setCustomerDialog(true)}>
                + Yeni müşteri
              </Button>
              {customer?.isDraft && (
                <span className="font-ops-body text-ops-xs text-ops-muted">Doğrulanmamış kayıt</span>
              )}
            </div>
          </section>

          {customer && (
            <section className="rounded-ops-card border border-ops-line-soft bg-ops-subtle p-4">
              <h2 className="mb-3 font-ops-body text-ops-section font-bold text-ops-ink">Teslimat adresi</h2>
              <Select
                value={addressId}
                onChange={setAddressId}
                options={addresses.map((a) => ({ value: a.id, label: `${a.recipient} — ${a.label}` }))}
                placeholder="Adres seçin"
              />
              <div className="mt-2">
                <Button variant="secondary" size="sm" onClick={() => setAddressDialog(true)}>
                  + Yeni adres
                </Button>
              </div>

              {delivery && (
                <div className="mt-4 flex flex-col gap-3">
                  <p className="font-ops-body text-ops-xs text-ops-muted">
                    {delivery.deliveryType === 'route' ? 'Rota içi — araçla gidiyor' : 'Kargo ile gidecek'}
                  </p>
                  {/* Gün YALNIZ rotada sorulur: kargoda tarih taşıyıcıya bağlı ve söz verilmez. */}
                  {delivery.deliveryType === 'route' && (
                    <Select
                      value={deliveryDate}
                      onChange={setDeliveryDate}
                      options={delivery.availableDates.map((d) => ({ value: d, label: d }))}
                      placeholder="Teslimat günü"
                    />
                  )}
                  <Select
                    value={paymentMethod}
                    onChange={(v) => setPaymentMethod(v as PaymentMethod)}
                    // Yöntem kümesini MOTOR söylüyor (kapıda ödeme tavanı, müşterinin yetkisi):
                    // kapalı bir yöntemi sunmak, taslak açılırken reddedilecek bir seçim yaptırmaktı.
                    options={delivery.paymentMethods.map((m) => ({ value: m, label: PAYMENT_LABELS[m] }))}
                    placeholder="Ödeme yöntemi"
                  />
                  {delivery.creditAvailable && (
                    <ToggleField on={onAccount} onChange={setOnAccount} label="Vadeli (hesaba)" />
                  )}
                  {/* Hediye = patron ikramı: operasyon ve iç muhasebe tam normal, yalnız muhasebe
                      export'una girmez (DOMAIN §9). İşaretin anlamı girişte net yazılıyor. */}
                  <ToggleField on={isGift} onChange={setIsGift} label="Hediye sipariş (patron ikramı)" />
                  <p className="font-ops-body text-ops-xs text-ops-muted">
                    Hediye siparişte operasyon ve stok tam normal işler; yalnız muhasebe dışa
                    aktarımına girmez (DOMAIN §9).
                  </p>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ── SAĞ: NE, KAÇ TANE, KAÇA ─────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <section className="rounded-ops-card border border-ops-line-soft bg-ops-subtle p-4">
            <h2 className="mb-3 font-ops-body text-ops-section font-bold text-ops-ink">Kalemler</h2>
            <Combobox
              value=""
              onChange={addLine}
              options={variantOptions.map((v) => ({
                value: v.variantId,
                label: v.title,
                meta:
                  v.availableQty === null
                    ? 'Adet için önce adres seçin'
                    : `Depoda ${v.availableQty} adet`,
                // Fiyatı olmayan boy satışa kapalıdır — sayı yerine sebebi yazılır.
                trailing: v.listPriceCents === null ? 'satışa kapalı' : formatPrice(v.listPriceCents, 'fr'),
              }))}
              onSearch={searchVariants}
              placeholder={customer ? 'Ürün ara ve ekle' : 'Önce müşteriyi seçin'}
              disabled={!customer}
              emptyText="Ürün bulunamadı."
            />

            {lines.length === 0 ? (
              <p className="mt-4 font-ops-body text-ops-xs text-ops-muted">Henüz kalem eklenmedi.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {lines.map((line) => (
                  <LineRow key={line.variantId} line={line} channel={customer?.channel ?? 'b2c'} onPatch={patchLine} onRemove={() =>
                    setLines((prev) => prev.filter((l) => l.variantId !== line.variantId))
                  } />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-ops-card border border-ops-line-soft bg-ops-subtle p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-ops-body text-ops-sm text-ops-muted">Kalemler toplamı</span>
              <span className="font-ops-mono text-ops-section font-bold text-ops-ink">{formatPrice(subtotalCents, 'fr')}</span>
            </div>
            {/* Kargo ücreti ve indirim BURADA GÖSTERİLMİYOR — ikisini de sunucu çözüyor ve ekranda
                tahmin etmek, siparişin gerçek toplamıyla çelişecek bir sayı yazmak olurdu. */}
            <p className="mt-1 font-ops-body text-ops-xs text-ops-muted">
              Kargo ücreti ve indirim sipariş açılırken hesaplanır.
            </p>

            {error && <p className="mt-3 font-ops-body text-ops-xs font-semibold text-ops-red">{error}</p>}

            <div className="mt-4 flex items-center justify-end gap-3">
              {blocked && <span className="font-ops-body text-ops-xs text-ops-muted">{blocked}</span>}
              <Button onClick={submit} disabled={!!blocked || submitting}>
                {submitting ? 'Açılıyor…' : 'Siparişi aç'}
              </Button>
            </div>
          </section>
        </div>
      </div>

      {customerDialog && (
        <CustomerDialog
          onClose={() => setCustomerDialog(false)}
          onCreated={(created) => {
            setCustomerOptions([created]);
            setCustomer(created);
            setCustomerDialog(false);
          }}
        />
      )}
      {addressDialog && customer && (
        <AddressDialog
          customerId={customer.id}
          onClose={() => setAddressDialog(false)}
          onCreated={(created) => {
            setAddresses((prev) => [...prev, created]);
            setAddressId(created.id);
            setAddressDialog(false);
          }}
        />
      )}
    </div>
  );
}

interface LineRowProps {
  line: NewOrderLine;
  channel: 'b2c' | 'b2b';
  onPatch: (variantId: string, patch: Partial<NewOrderLine>) => void;
  onRemove: () => void;
}

/**
 * Tek kalem satırı — adet, fiyat ve **marj-altı uyarısı**.
 *
 * Uyarı ENGELLEMEZ (tasarım sözleşmesi §3: "karar satıcının"). Kararı motor veriyor
 * (`isBelowTargetMargin`) ve üç değerli: `true` altında, `false` üstünde, **`null` bilinmiyor** —
 * maliyet ölçülemediyse ya da hedef marj tanımlı değilse uyarı SUSAR. Sıfır varsaymak, ölçülmemiş
 * bir maliyeti "bedava" gibi okutup her fiyatı kârlı gösterirdi.
 */
function LineRow({ line, channel, onPatch, onRemove }: LineRowProps) {
  const revenueHt = revenueHtOf(channel, line.unitPriceCents, line.vatRate);
  const belowTarget = isBelowTargetMargin(revenueHt, line.costCents, line.targetMarginPercent);
  const negotiated = line.unitPriceCents !== line.listPriceCents;

  return (
    <li className="flex items-center gap-3 rounded-ops-card border border-ops-line-soft bg-ops-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{line.title}</p>
        <div className="flex items-center gap-2">
          {/* Liste fiyatı pazarlıkta GÖRÜNÜR KALIR (tasarım §3) — operatör neyden indiğini görmeli. */}
          {negotiated && (
            <span className="font-ops-mono text-ops-xs text-ops-muted line-through">
              {formatPrice(line.listPriceCents, 'fr')}
            </span>
          )}
          {belowTarget === true && (
            <span className="font-ops-body text-ops-xs font-semibold text-ops-amber">Hedef marjın altında</span>
          )}
        </div>
      </div>

      <Input
        inputSize="sm"
        inputMode="numeric"
        fullWidth={false}
        className="w-16"
        aria-label="Adet"
        value={String(line.qty)}
        onChange={(e) => onPatch(line.variantId, { qty: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })}
      />
      {/* **KUTU EURO KONUŞUR, DURUM KURUŞ** (STACK §8) — çevrim tam burada, sınırda.
          Ölçüldü 26.08 (tarayıcıda): kuruş geçildiğinde 4,57 €'luk ürün kutuda **457,00** çıkıyordu
          ve operatör "gerçek" bir fiyat yazsa 100 kat yanlış bir sayı kaydedilirdi. Hiçbir yerde
          hata çıkmıyordu — kutu geçerli bir sayı gösteriyordu, yalnız yanlışını. */}
      <MoneyInput
        value={fromCents(line.unitPriceCents)}
        onChange={(v) => onPatch(line.variantId, { unitPriceCents: v == null ? 0 : toCents(v) })}
        ariaLabel="Birim fiyat"
        className="w-28"
      />
      <span className="w-24 text-right font-ops-mono text-ops-sm text-ops-ink">
        {formatPrice(line.unitPriceCents * line.qty, 'fr')}
      </span>
      <Button variant="secondary" size="sm" onClick={onRemove} aria-label="Kalemi çıkar" title="Kalemi çıkar">
        ✕
      </Button>
    </li>
  );
}
