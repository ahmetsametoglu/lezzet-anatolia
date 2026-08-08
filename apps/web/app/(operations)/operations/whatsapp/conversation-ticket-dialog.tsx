'use client';

import { useState } from 'react';
import { TICKET_TYPE_LABELS, TicketTypeEnum, type TicketType } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { InputField, Textarea } from '@/components/operation/form/input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { openConversationTicketAction } from './actions';

/**
 * Sohbetten talep açma (çizim, sağ pano) — müşteri ve konuşma ZATEN belli.
 *
 * Talepler ekranının elle talep penceresiyle aynı iş değil ve o yüzden ayrı: orada operatör önce
 * müşteriyi arıyor, burada müşteri sohbetin kendisinden geliyor. Asıl fark ise bağ — burada açılan
 * talep `conversation_id` taşır ve Talepler ekranındaki "bağlı WhatsApp konuşması" satırı ilk kez
 * gerçekten dolar.
 *
 * **Sipariş seçici YOK ve bu bilinçli:** çizim burada tek adımlık bir pencere gösteriyor
 * ("konuşmadan talep kaydı açılır; müşteri ve varsa sipariş bağlanır") ve sipariş bağı Talepler
 * ekranında zaten kurulabiliyor. İkinci bir seçici çizmek, aynı kararı iki yerde yaşatmak olurdu.
 */

interface ConversationTicketDialogProps {
  conversationId: string;
  customerId: string;
  customerName: string;
  onClose: () => void;
  onCreated: () => void;
}

export function ConversationTicketDialog({
  conversationId,
  customerId,
  customerName,
  onClose,
  onCreated,
}: ConversationTicketDialogProps) {
  const [type, setType] = useState<TicketType>('question');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = body.trim().length === 0 ? 'Anlatım yazılmalı' : null;

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    setError(null);
    const { data, error: actionError } = await openConversationTicketAction({
      conversationId,
      customerId,
      type,
      subject: subject.trim() || undefined,
      body,
    });
    setBusy(false);
    if (!data) {
      setError(actionError ?? 'Talep açılamadı.');
      return;
    }
    onCreated();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={480}
      title="Sohbetten talep aç"
      subtitle={`${customerName} · talep bu konuşmaya bağlanır`}
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : 'Talep, Talepler ekranından yürütülür'}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button variant="danger" onClick={() => void submit()} disabled={busy || blocked !== null} title={blocked ?? undefined}>
            {busy ? 'Açılıyor…' : 'Talep oluştur'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <span className="font-ops-body text-ops-xs font-medium text-ops-body">Tip</span>
        <MultiToggle
          value={type}
          onChange={setType}
          label="Talep tipi"
          options={TicketTypeEnum.options.map((key) => ({ key, label: TICKET_TYPE_LABELS[key] }))}
        />
      </div>

      <InputField
        label="Başlık"
        labelAside="isteğe bağlı"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="ör. Eksik ürün — WhatsApp görüşmesi"
        maxLength={200}
      />

      <FieldShell label="Anlatım" required>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Sohbette anlatılanı yazın — talebin ilk mesajı bu olacak ve müşteri bunu aynen görecek."
        />
      </FieldShell>
    </Dialog>
  );
}
