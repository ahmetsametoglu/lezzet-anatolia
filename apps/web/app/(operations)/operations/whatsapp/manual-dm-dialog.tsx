'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { InputField, Textarea } from '@/components/operation/form/input';
import { openManualDmAction } from './actions';

/**
 * **Gelen DM'i işle** (15.1'in yüzey yarısı) — numaradan konuşmayı açar, ilk mesajı deftere yazar.
 *
 * Bu pencere olmadan gelen kutusunun VERİ KAYNAĞI YOK: konuşma satırlarını bugün yalnız elle işleme
 * doğurabiliyor, webhook 15.7 ile geliyor. Yani ekranın kendisi bu pencereyle birlikte anlam
 * kazanıyor — 15.1 servisleri yazmıştı, onları çağıran hiçbir yüzey yoktu.
 *
 * **E-posta İSTEĞE BAĞLI ve ikinci kimlik anahtarıdır.** Biliniyorsa yazılır: numara kayıtsız ama
 * e-posta tanıdıksa müşteri o zaman bulunur ve sohbet doğru hesaba bağlanır. İkisi AYRI müşterilere
 * çıkarsa konuşma bilerek AÇILMAZ — sessizce birini seçmek, yanlış hesaba bağlanmış bir sohbet
 * üretirdi (DOMAIN §10).
 */

interface ManualDmDialogProps {
  onClose: () => void;
  onOpened: (conversationId: string) => void;
}

export function ManualDmDialog({ onClose, onOpened }: ManualDmDialogProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [text, setText] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = !phone.trim()
    ? 'Numara yazılmalı'
    : !text.trim()
      ? 'Mesaj metni yazılmalı'
      : !receivedAt
        ? 'Mesajın geldiği an yazılmalı'
        : null;

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    setError(null);
    const { data, error: actionError } = await openManualDmAction({
      phone,
      name: name.trim() || undefined,
      email: email.trim() || undefined,
      text,
      receivedAt: new Date(receivedAt).toISOString(),
    });
    setBusy(false);
    if (!data) {
      setError(actionError ?? 'Konuşma açılamadı.');
      return;
    }
    onOpened(data.conversationId);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={520}
      title="Gelen DM işle"
      subtitle="Telefondan okunan mesajı sisteme geçirir"
      footer={
        <>
          {/* Metin düğmeleri EZMEZ: `min-w-0` + düğmelerde `flex-none`. Bu olmadan uzun bir hata
              cümlesi düğmeyi iki satıra bölüyordu (ölçüldü) ve "Konuşmayı aç" tıklanabilir ama
              okunmaz hâle geliyordu. */}
          <span className="mr-auto min-w-0 font-ops-body text-ops-xs text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : 'Aynı numara ikinci sohbet açmaz'}
          </span>
          <Button variant="secondary" className="flex-none" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button
            variant="primary"
            className="flex-none whitespace-nowrap"
            onClick={() => void submit()}
            disabled={busy || blocked !== null}
            title={blocked ?? undefined}
          >
            {busy ? 'İşleniyor…' : 'Konuşmayı aç'}
          </Button>
        </>
      }
    >
      <InputField
        label="WhatsApp numarası"
        required
        mono
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+33 6 12 34 56 78"
        // Yerel yazım da kabul: normalize uygulama kapısında yapılıyor (`normalizePhone`) ve
        // operatörün numarayı ekranda gördüğü biçimde yazabilmesi, yazım hatasını azaltır.
      />

      <InputField
        label="WhatsApp adı"
        labelAside="isteğe bağlı"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Profilde görünen ad"
        // Ad YALNIZ yeni kayıtta kullanılır, mevcut müşterinin adını EZMEZ (kapının kuralı):
        // WhatsApp profil adı bir takma ad olabilir ve fatura adının yerine geçmemeli.
      />

      <InputField
        label="E-posta"
        labelAside="biliniyorsa"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Numara kayıtsız ama müşteriyi tanıyorsanız"
      />

      <InputField
        label="Mesajın geldiği an"
        required
        labelAside="24 saatlik cevap süresi buradan başlar"
        type="datetime-local"
        value={receivedAt}
        onChange={(e) => setReceivedAt(e.target.value)}
      />

      <FieldShell label="Mesaj" required>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Müşterinin yazdığı mesajı olduğu gibi geçirin."
        />
      </FieldShell>
    </Dialog>
  );
}
