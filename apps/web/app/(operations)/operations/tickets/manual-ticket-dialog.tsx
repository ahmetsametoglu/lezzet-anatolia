'use client';

import { useEffect, useState } from 'react';
import { TICKET_TYPE_LABELS, TicketTypeEnum, type TicketType } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Combobox } from '@/components/operation/form/combobox';
import { FieldShell } from '@/components/operation/form/field-shell';
import { InputField, Textarea } from '@/components/operation/form/input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import type { CustomerOption } from '@/lib/customer-options';
import { listCustomerOrdersAction, openManualTicketAction, searchTicketCustomersAction } from './actions';
import { TICKET_ORDER_OPTION_LIMIT, type TicketOrderOption } from './tickets-types';

/**
 * Elle talep açma (`admin-talepler.md §3`) — WhatsApp ya da telefon konuşmasından.
 *
 * **Pencerenin içi ÇİZİLMEMİŞ:** çizimdeki modal genel bir kabuk (başlık + gövde + not + düğme) ve
 * gerçek alanların hiçbiri yok. Alanlar arka ucun beklediğinden türetildi (`openTicket`) ve düzen
 * kararı `design/BACKLOG.md`'de bekliyor; çizim gelince birebir uygulanır (`CLAUDE.md §3`).
 *
 * **İlk sözü operatör söyler.** `source: 'admin'` + `authorId` ikilisi ilk mesajı personele yazar
 * ve müşteriye "bize yazdıklarınız" başlıklı teyit maili GİTMEZ (16.4 kararı) — müşteri kendi
 * yazmadığı bir metni okumamalı. Ama talebi kendi hesabında GÖRÜR: yazdığımız her şey ona açıktır.
 */

interface ManualTicketDialogProps {
  onClose: () => void;
  onCreated: (ticketId: string) => void;
}

export function ManualTicketDialog({ onClose, onCreated }: ManualTicketDialogProps) {
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [type, setType] = useState<TicketType>('question');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [orderId, setOrderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Müşteri araması SUNUCUDA: liste veriyle büyür, tamamını pencereye indirmek bir gün sessizce
  // eksik liste gösterirdi. Gecikme `Combobox`'ın içinde — burada yalnız sonuç ve bekleme durumu.
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const search = (term: string) => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    void searchTicketCustomersAction(term)
      .then(({ data }) => setResults(data ?? []))
      .finally(() => setSearching(false));
  };

  /**
   * Sipariş listesi MÜŞTERİYE BAĞLI ve müşteri seçilene kadar hiç okunmaz.
   *
   * Serbest bir sipariş araması olsaydı operatör başka bir müşterinin siparişini bu talebe
   * bağlayabilirdi — ve `openTicket` personelin açtığı talepte sahiplik aramıyor (aramaz da:
   * operatör müşteri adına açar). Yani yanlış eşleşmenin tek engeli bu seçicinin kapsamı.
   */
  const [orders, setOrders] = useState<TicketOrderOption[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  useEffect(() => {
    setOrderId('');
    setOrders([]);
    if (!customer) return;
    setOrdersLoading(true);
    void listCustomerOrdersAction(customer.id)
      .then(({ data }) => setOrders(data ?? []))
      .finally(() => setOrdersLoading(false));
  }, [customer]);

  const blocked = !customer ? 'Müşteri seçilmeli' : body.trim().length === 0 ? 'Anlatım yazılmalı' : null;

  const submit = async () => {
    if (!customer || blocked) return;
    setBusy(true);
    setError(null);
    const { data, error: actionError } = await openManualTicketAction({
      customerId: customer.id,
      type,
      body,
      subject: subject.trim() || undefined,
      orderId: orderId || null,
    });
    setBusy(false);
    if (!data) {
      setError(actionError ?? 'Talep açılamadı.');
      return;
    }
    onCreated(data.id);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={520}
      title="Elle talep aç"
      subtitle="WhatsApp ya da telefon konuşmasından"
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : 'Müşteri bu talebi ve yazışmayı hesabında görür'}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || blocked !== null} title={blocked ?? undefined}>
            {busy ? 'Açılıyor…' : 'Talep oluştur'}
          </Button>
        </>
      }
    >
      <FieldShell label="Müşteri" required>
        <Combobox
          value={customer?.id ?? ''}
          selectedLabel={customer?.name}
          onChange={(id) => setCustomer(results.find((c) => c.id === id) ?? null)}
          options={results.map((c) => ({ value: c.id, label: c.name, meta: c.hint, trailing: c.isCompany ? 'B2B' : 'B2C' }))}
          onSearch={search}
          loading={searching}
          placeholder="Müşteri seç"
          searchPlaceholder="Ad, telefon ya da e-posta ara…"
          emptyText="Eşleşen müşteri yok. Kaydı olmayan müşteri önce Müşteriler ekranından açılmalı."
        />
      </FieldShell>

      <div className="flex flex-col gap-1.5">
        <span className="font-ops-body text-ops-xs font-medium text-ops-body">Tip</span>
        <MultiToggle
          value={type}
          onChange={setType}
          label="Talep tipi"
          options={TicketTypeEnum.options.map((key) => ({ key, label: TICKET_TYPE_LABELS[key] }))}
        />
      </div>

      {/* Sipariş İSTEĞE BAĞLI: genel soru siparişsiz açılır ve o zaman kalem/iade bağlamı da yoktur
          (`admin-talepler.md §4`). Seçici müşteri seçilene kadar kapalı — kimin siparişi olduğu
          belli olmadan gösterilecek bir liste yok. */}
      <FieldShell
        label="Bağlı sipariş"
        labelAside="isteğe bağlı"
      >
        <Combobox
          value={orderId}
          onChange={setOrderId}
          // "Bağlı değil" seçeneği yalnız müşteri seçilince listeye girer: seçici kapalıyken de
          // seçili görünürdü ve alan "önce müşteri seçin" davetini hiç gösteremezdi.
          options={
            customer
              ? [
                  { value: '', label: 'Siparişe bağlı değil', meta: 'genel soru ya da sipariş dışı konu' },
                  ...orders.map((o) => ({ value: o.id, label: o.label, meta: o.hint })),
                ]
              : []
          }
          disabled={!customer || ordersLoading}
          loading={ordersLoading}
          placeholder={customer ? 'Sipariş seç' : 'Önce müşteri seçin'}
          searchPlaceholder="Sipariş numarası ara…"
          emptyText="Bu müşterinin siparişi görünmüyor."
        />
        {customer && !ordersLoading && orders.length === TICKET_ORDER_OPTION_LIMIT ? (
          <span className="font-ops-body text-ops-micro text-ops-faint">
            Son {TICKET_ORDER_OPTION_LIMIT} sipariş listeleniyor — daha eskisi için siparişi sipariş ekranından bulun ve
            talebi oradan açın.
          </span>
        ) : null}
      </FieldShell>

      <InputField
        label="Başlık"
        labelAside="isteğe bağlı"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="ör. Teslimat gecikmesi — telefon görüşmesi"
        maxLength={200}
      />

      <FieldShell label="Anlatım" required>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Konuşmada anlatılanı yazın — talebin ilk mesajı bu olacak ve müşteri bunu aynen görecek."
        />
      </FieldShell>
    </Dialog>
  );
}
