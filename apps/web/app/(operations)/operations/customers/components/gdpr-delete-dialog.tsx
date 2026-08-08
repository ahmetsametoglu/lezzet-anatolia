'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Input } from '@/components/operation/form/input';
import { GDPR_NOTES } from '../customers-labels';

/**
 * **GDPR silme onayı** (09.10). Tasarımın aksiyon şeridindeki *"GDPR sil"* düğmesinin arkası.
 *
 * ── NEDEN BU KADAR AĞIR BİR ONAY ────────────────────────────────────────────
 * İşlem **geri alınamaz** ve idempotent: ikinci çağrı sessizce çıkar, damga ilk silmenin tarihinde
 * kalır. Yani *"yanlışlıkla iki kez bastım"* zararsız, *"yanlış müşteriye bastım"* telafisiz. Tek
 * tıkla kapanan bir onay, bu asimetriyi ekranda görünmez kılardı — o yüzden operatör müşterinin
 * adını YAZARAK doğruluyor: yazılacak ad, üstünde durduğu kaydın kendisidir.
 *
 * ── NE GİDİYOR, NE KALIYOR — SÖZ VERİLEN ŞEY ────────────────────────────────
 * Diyalog ikisini de yazıyor. "Verileri sil" deyip fatura kayıtlarının kaldığını söylememek, yasal
 * olarak zorunlu bir saklamayı operatöre sürpriz olarak bırakırdı; tersi de doğru — silinenleri
 * saymadan onay istemek, operatöre ne yaptığını bilmeden imza attırmaktır.
 */
interface GdprDeleteDialogProps {
  customerName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function GdprDeleteDialog({ customerName, busy, error, onClose, onConfirm }: GdprDeleteDialogProps) {
  const [typed, setTyped] = useState('');
  // Karşılaştırma boşluk ve büyük/küçük harfe duyarsız: operatör adı doğru okumuş olmalı, daktilo
  // sınavına girmiş değil. Ama YAZMIŞ olmalı — kopyalanacak bir metin değil, okunacak bir kayıt.
  const matches = typed.trim().toLocaleLowerCase('tr-TR') === customerName.trim().toLocaleLowerCase('tr-TR');

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={520}
      title="Müşteri verilerini sil"
      subtitle={GDPR_NOTES.subtitle}
      footer={
        <>
          {/* Engelin SEBEBİ düğmenin yanında yazılı: kilitli ama sebepsiz bir düğme, operatörü
              neyi düzelteceğini aramaya bırakır (`DialogFooter` künyesinin kuralı). */}
          {!matches && !error ? (
            <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">Onaylamak için müşterinin adını yazın.</span>
          ) : null}
          {error ? <span className="mr-auto font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button variant="destructive" disabled={!matches || busy} onClick={onConfirm}>
            {busy ? 'Siliniyor…' : 'Verileri sil'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3 py-2.5 font-ops-body text-ops-xs leading-[1.55] text-ops-red">
          {GDPR_NOTES.irreversible}
        </p>

        <Section title="Silinecekler">{GDPR_NOTES.removed}</Section>
        <Section title="Kalacaklar — yasal zorunluluk">{GDPR_NOTES.kept}</Section>

        <label className="flex flex-col gap-1.5">
          <span className="font-ops-body text-ops-xs text-ops-body">
            Onaylamak için müşterinin adını yazın: <strong className="text-ops-ink">{customerName}</strong>
          </span>
          <Input value={typed} onChange={(event) => setTyped(event.target.value)} disabled={busy} placeholder={customerName} />
        </label>
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">{title}</span>
      <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-body">{children}</p>
    </div>
  );
}
