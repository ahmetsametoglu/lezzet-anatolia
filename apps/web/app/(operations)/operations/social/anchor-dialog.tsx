'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { issueSecurityCodeAction, startEmailAnchorAction } from './actions';

/**
 * **Kimlik çapası kur** (04.10 · DOMAIN §10) — panodan pencereye taşındı (14.09): panoda durum satırı
 * kalır, kararın kendisi (hangi yol, neden) burada verilir.
 *
 * İki yol, tek gerçek: kod ya müşterinin E-POSTASINA gider ve cevabı bu sohbetten döner (kanıtın gücü
 * iki kanalın birden doğrulanmasından gelir), ya da e-posta istemeyen müşteriye 6 haneli kod SOHBETE
 * yazılır.
 *
 * **"Kod doğrula" kutusu YOK ve olmayacak** (DOMAIN §10, açık yasak): doğrulama yalnız müşterinin
 * KENDİ numarasından gelen mesajla olur.
 *
 * Pencere kendi kapısını çağırır ve hatasını kendisi gösterir (bağla penceresinin deseni): sayfanın
 * ortak hata satırı cevap kutusunun altında, pencerenin arkasında kalırdı.
 */
interface AnchorDialogProps {
  conversationId: string;
  /** Kimin çapası — başlığın altında. */
  customerName: string;
  /** Kod daha önce gönderildi, cevap bekleniyor — düğme "Yeniden gönder" der. */
  hasPendingEmail: boolean;
  onClose: () => void;
  /** Başarılı kayıttan sonra — ekran sunucudan yeniden okur. */
  onDone: () => void;
}

export function AnchorDialog({ conversationId, customerName, hasPendingEmail, onClose, onDone }: AnchorDialogProps) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    SOHBETE GİDEMEYEN KOD — kapı onu üretir ve operatöre DÖNDÜRÜR (pencere kapalı, kanal ayarsız):
    "kodu iletecek olan artık insandır" (`issueSecurityCodeAction` künyesi). 14.09'a kadar ekran bu
    kodu hiç göstermiyordu — kod üretiliyor, müşteriye gitmiyor, operatör de görmüyordu; müşteri
    çapasız kalıyordu. Kod bir kez gösterilir: satırda yalnız özeti var, geri okunamaz.
  */
  const [unsentCode, setUnsentCode] = useState<string | null>(null);

  const sendEmail = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await startEmailAnchorAction({ conversationId, email: email.trim() });
    setBusy(false);
    if (result.error !== null || result.data === null) {
      setError(result.error ?? 'Kod gönderilemedi.');
      return;
    }
    onDone();
  };

  const issueCode = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await issueSecurityCodeAction(conversationId);
    setBusy(false);
    if (result.error !== null || result.data === null) {
      setError(result.error ?? 'Kod verilemedi.');
      return;
    }
    if (result.data.code) {
      setUnsentCode(result.data.code);
      return;
    }
    onDone();
  };

  if (unsentCode) {
    return (
      <Dialog
        open
        onClose={onDone}
        maxWidth={440}
        title="Kod sohbete gönderilemedi"
        subtitle={customerName}
        footer={
          <Button variant="primary" onClick={onDone}>
            Tamam
          </Button>
        }
      >
        <p className="font-ops-body text-ops-sm leading-[1.5] text-ops-strong">
          Kod üretildi ama müşteriye gidemedi. Müşteriye siz iletin; dönüşünde kimliğini bu kodla teyit eder.
        </p>
        <span className="self-start rounded-ops-card border border-ops-line bg-ops-subtle px-4 py-2 font-ops-mono text-ops-title font-semibold tracking-[0.2em] text-ops-ink">
          {unsentCode}
        </span>
        <p className="font-ops-body text-ops-xs text-ops-muted">Bu kod bir daha gösterilemez.</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={440}
      title="Kimlik çapası kur"
      subtitle={customerName}
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : 'Kod ekrandan doğrulanmaz.'}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
        </>
      }
    >
      <FieldShell label="Müşterinin e-postası" labelAside="Kod bu adrese gider, cevap sohbetten döner">
        <div className="flex gap-2">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="musteri@ornek.fr" fullWidth />
          <Button className="flex-none" disabled={busy || email.trim().length < 3} onClick={() => void sendEmail()}>
            {hasPendingEmail ? 'Yeniden gönder' : 'Kod gönder'}
          </Button>
        </div>
      </FieldShell>

      <div className="flex flex-col items-start gap-1.5 border-t border-ops-line pt-3">
        <Button variant="secondary" disabled={busy} onClick={() => void issueCode()}>
          E-posta istemiyor — 6 haneli kod ver
        </Button>
        <p className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
          Kod sohbete yazılır; müşteri dönüşünde kimliğini bu kodla teyit eder.
        </p>
      </div>
    </Dialog>
  );
}
