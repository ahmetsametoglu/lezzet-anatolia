'use client';

import { useState } from 'react';
import type { ConversationSource } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Combobox } from '@/components/operation/form/combobox';
import { FieldShell } from '@/components/operation/form/field-shell';
import type { CustomerOption } from '@/lib/customer-options';
import { linkConversationCustomerAction, searchSocialCustomersAction } from './actions';
import { SOURCE_LABELS } from './social-labels';

/**
 * **Sohbeti müşteriye bağla** (15.16) — kimliksiz sosyal konuşmanın kimlik kapısı.
 *
 * Messenger ve Instagram'da bu istisna değil KURALDIR: sağlayıcı kimliği (PSID/IGSID) telefon
 * taşımaz, yani konuşma daima kimliksiz doğar ve "bu sohbet şu müşteri" cümlesini ancak sohbeti
 * okuyan operatör kurabilir — müşteri kendini tanıtır, operatör kaydı seçer. WhatsApp'ta ise
 * kimlik numaradan çözülür; pencere orada yalnız çakışma yüzünden bağlanmadan açılmış sohbetler
 * için gerekir.
 *
 * **Seçici, serbest metin DEĞİL.** Operatör bir KAYIT seçer; ad ya da numara yazıp kimlik
 * kurdurmaz. Metin kabul edilseydi "aynı adlı iki müşteri" sorusunu bu pencerenin çözmesi
 * gerekirdi ve çözemezdi — sohbet sessizce yanlış hesaba bağlanırdı.
 *
 * **Kaydı OLMAYAN müşteri buradan açılmaz** ve bu bilinçli bir sınır: müşteri açmak Müşteriler
 * ekranının işidir (09.10) ve orada adres, izin, B2B gibi alanlarıyla birlikte açılır. Buraya
 * ikinci bir müşteri açma yolu koymak, yarım kayıtlar üretirdi.
 */

interface LinkCustomerDialogProps {
  conversationId: string;
  /** Sohbetin ekrandaki başlığı — operatör hangi sohbeti bağladığını görsün. */
  title: string;
  source: ConversationSource;
  onClose: () => void;
  onLinked: () => void;
}

export function LinkCustomerDialog({ conversationId, title, source, onClose, onLinked }: LinkCustomerDialogProps) {
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Arama SUNUCUDA (talep penceresinin aynı kararı): müşteri kümesi veriyle büyür, tamamını
  // pencereye indirmek bir gün sessizce eksik liste gösterirdi. Gecikme `Combobox`'ın içinde.
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const search = (term: string) => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    void searchSocialCustomersAction(term)
      .then(({ data }) => setResults(data ?? []))
      .finally(() => setSearching(false));
  };

  const submit = async () => {
    if (!customer || busy) return;
    setBusy(true);
    setError(null);
    const { data, error: actionError } = await linkConversationCustomerAction({ conversationId, customerId: customer.id });
    setBusy(false);
    if (!data) {
      setError(actionError ?? 'Bağlanamadı.');
      return;
    }
    onLinked();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={480}
      title="Sohbeti müşteriye bağla"
      subtitle={`${SOURCE_LABELS[source]} · ${title}`}
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {error ? (
              <span className="font-semibold text-ops-red">{error}</span>
            ) : (
              'Bağ kurulunca sipariş geçmişi ve izin bilgisi bu sohbette görünür'
            )}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || !customer}
            title={customer ? undefined : 'Müşteri seçilmeli'}
          >
            {busy ? 'Bağlanıyor…' : 'Bağla'}
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

      {/* Geri alma yolu bilerek YOK ve operatör bunu ÖNCEDEN bilmeli: yanlış bağ, Müşteriler
          ekranının birleştirme işiyle düzeltilir (09.10). Uyarıyı pencerenin içine koymak,
          "bağla" düğmesine basmadan önce okunmasını sağlar. */}
      <p className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
        Bağ sonradan bu ekrandan değiştirilemez — yanlış bağlanırsa Müşteriler ekranından
        birleştirme/ayırma ile düzeltilir. Doğru kaydı seçtiğinizden emin olun.
      </p>
    </Dialog>
  );
}
