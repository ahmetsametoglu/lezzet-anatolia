'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input, Textarea } from '@/components/operation/form/input';
import { Toggle } from '@/components/operation/form/toggle';
import { saveSupplierAction } from './actions';
import type { SupplierCardView } from './procurement-types';

// Tedarikçi kartı formu (09.14). Kart olmadan sipariş de olmaz — bu form ekranın süsü değil,
// sıfırdan kurulumun ilk adımı.
//
// Alanlar `DOMAIN §16`'nın kart tanımı: ad · iletişim · vergi no · BİZE tanıdığı vade · not.
// Borç burada YOK ve olmayacak: türetilir (Σ girişler − Σ ödemeler), elle yazılan bir bakiye
// ilk günden yanlış olurdu.

interface SupplierDialogProps {
  /** null = yeni kayıt. */
  editing: SupplierCardView | null;
  onClose: () => void;
}

export function SupplierDialog({ editing, onClose }: SupplierDialogProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [address, setAddress] = useState(editing?.address ?? '');
  const [vatNumber, setVatNumber] = useState(editing?.vatNumber ?? '');
  // Vade GÜN sayısıdır ve boş bırakılabilir: boş = peşin çalışıyoruz (şemanın sözleşmesi).
  const [term, setTerm] = useState(editing?.paymentTermDays != null ? String(editing.paymentTermDays) : '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const parsedTerm = term.trim() === '' ? null : Number(term);
    void saveSupplierAction({
      id: editing?.id,
      name,
      phone,
      email,
      address,
      vatNumber,
      paymentTermDays: Number.isFinite(parsedTerm) ? parsedTerm : null,
      note,
      isActive,
    })
      .then((result) => {
        if (result.error) setError(result.error);
        else onClose();
      })
      .finally(() => setSaving(false));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Tedarikçi kartı' : 'Yeni tedarikçi'}
      subtitle="Sipariş bu kartla yazılır; borç ve vade buradan izlenir"
      maxWidth={560}
      footer={
        <>
          {error ? <span className="mr-auto font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button variant="primary" onClick={onSave} disabled={saving || name.trim() === ''}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FieldShell fieldId="supplier-name" label="Tedarikçi adı" required>
          <Input id="supplier-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Metro Cash&Carry" />
        </FieldShell>

        <div className="grid grid-cols-2 gap-3">
          <FieldShell
            fieldId="supplier-phone"
            label="Telefon"
            // Telefon yalnız bir iletişim bilgisi değil: sipariş listesini WhatsApp'tan göndermenin
            // anahtarı. Boşsa o düğme hiç çizilmez ve sebebini söyler.
            labelAside="WhatsApp gönderimi için"
          >
            <Input id="supplier-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+33 3 88 …" />
          </FieldShell>
          <FieldShell fieldId="supplier-email" label="E-posta">
            <Input id="supplier-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FieldShell>
        </div>

        <FieldShell fieldId="supplier-address" label="Adres">
          <Input id="supplier-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </FieldShell>

        <div className="grid grid-cols-2 gap-3">
          <FieldShell fieldId="supplier-vat" label="Vergi no">
            <Input id="supplier-vat" mono value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
          </FieldShell>
          <FieldShell fieldId="supplier-term" label="Bize tanıdığı vade" labelAside="boş = peşin">
            <Input
              id="supplier-term"
              mono
              inputMode="numeric"
              value={term}
              onChange={(e) => setTerm(e.target.value.replace(/\D/g, ''))}
              placeholder="30"
              trailing={<span className="font-ops-body text-ops-xs text-ops-muted">gün</span>}
            />
          </FieldShell>
        </div>

        <FieldShell fieldId="supplier-note" label="Not">
          <Textarea id="supplier-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </FieldShell>

        {/* Silme YOK, pasifleştirme var: geçmiş alımlar ve borç kayıtları tedarikçisiz kalamaz. */}
        <div className="flex items-start gap-3 rounded-ops-card border border-ops-line px-3.5 py-3">
          <Toggle on={isActive} onChange={setIsActive} label="Çalışmaya devam ediyoruz" />
          <span className="flex flex-col gap-px">
            <span className="font-ops-body text-ops-sm font-medium text-ops-ink">Çalışmaya devam ediyoruz</span>
            <span className="font-ops-body text-ops-xs text-ops-muted">
              Kapatılan tedarikçi yeni siparişte seçilemez; geçmiş kayıtları ve borcu durur.
            </span>
          </span>
        </div>
      </div>
    </Dialog>
  );
}
