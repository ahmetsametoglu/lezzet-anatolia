'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Textarea } from '@/components/operation/form/input';
import { num } from '@/components/operation/ui/format';
import type { DecisionKind } from './assistant-types';

/**
 * Karar penceresi — çizimdeki **tek modal kabuğu** üç karara hizmet ediyor (`modalKind`:
 * `uygula` · `ret` · `sonra`).
 *
 * Üçünün de onay istemesi bir nezaket değil: uygulama normal servis yolundan koşar ve bir kısmı
 * geri alınmaz (bölge bildirimi), ret öneriyi geçmişe düşürür, "sonra bak" ise hiçbir şey yapmaz —
 * ve tam da bu yüzden söylenmesi gerekir, yoksa operatör bir şey yaptığını sanır.
 *
 * **Ret notu isteğe bağlı ve öyle kalmalı:** zorunlu yapmak, ret'i pahalılaştırıp operatörü
 * "sonra bak"a iter — kuyruğun en sık görülen çürüme yolu. Ama not kutusu görünür duruyor, çünkü
 * *"bunu neden reddetmişiz"* sorusu er geç soruluyor (B2B onay ekranının dersi).
 */

interface AssistantDecisionDialogProps {
  kind: DecisionKind;
  summary: string;
  /** Uygulanınca bildirim gidecek müşteri sayısı; `null` ise dış etki yok. */
  notifyCount: number | null;
  /**
   * **"Uygulanınca ne olur" — kartın değil, KARARIN yanında** (kullanıcı kararı 10.08).
   *
   * Bu metin bir tur kartın dibinde duruyordu ve orada iki kez zarar veriyordu: her bakışta
   * okunuyor (yani hiç okunmuyor), ve kartın en uzun bloğuydu. Karar anında gösterilince hem
   * kısalıyor hem işe yarıyor. `KIND_META.impact`ten gelir — tek kaynak.
   */
  impact: string;
  /** Geri alma YOLU (`KIND_META.undoHint`). Tanımsızsa satır çizilmez — uydurma yapılmaz. */
  undoHint?: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  /** Ret notu yalnız `reject` kararında dolu gelir. */
  onConfirm: (note?: string) => void;
}

export function AssistantDecisionDialog({
  kind,
  summary,
  notifyCount,
  impact,
  undoHint,
  busy,
  error,
  onClose,
  onConfirm,
}: AssistantDecisionDialogProps) {
  const [note, setNote] = useState('');
  const noteId = useId();

  const title = kind === 'apply' ? 'Öneriyi uygula' : kind === 'reject' ? 'Öneriyi reddet' : 'Sonra bak';

  const body =
    kind === 'apply'
      ? `${summary} — işlem normal servis yolundan koşar.`
      : kind === 'reject'
        ? `${summary} reddedilecek. Öneri silinmez; ret notuyla geçmişe düşer.`
        : `${summary} kuyrukta kalır; tazeliği dolarsa kendiliğinden “süresi geçti” görünümüne düşer.`;

  // Not kutusunun tonu kararın doğasını söylüyor: geri alınamaz dış etki amber, motorun son sözü
  // mor (bu yüzeyde mor = makine konuşuyor), ret nötr.
  const notice =
    kind === 'apply'
      ? notifyCount !== null
        ? {
            text: `Bu öneri haber bekleyen ${num(notifyCount)} müşteriye bildirim gönderir. Bildirim geri alınamaz.`,
            skin: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark',
          }
        : {
            text: 'Motor reddederse öneri “uygulanamadı” hâline geçer ve sebebi ekranda yazar.',
            skin: 'border-ops-violet-line bg-ops-violet-bg text-ops-violet',
          }
      : kind === 'reject'
        ? {
            text: '“Bunu neden reddetmişiz” sorusunun cevabı bu nottur — kısa bir cümle bile yeter.',
            skin: 'border-ops-line-strong bg-ops-gray-100 text-ops-body',
          }
        : null;

  const ctaLabel =
    kind === 'apply' ? (notifyCount !== null ? 'Uygula ve gönder' : 'Uygula') : kind === 'reject' ? 'Reddet' : 'Kuyrukta bırak';

  const ctaVariant = kind === 'apply' ? (notifyCount !== null ? 'warning' : 'primary') : kind === 'reject' ? 'destructive' : 'primary';

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={440}
      title={title}
      footer={
        <>
          {error ? <span className="font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
          <Button variant="secondary" onClick={onClose} disabled={busy} className="ml-auto">
            Vazgeç
          </Button>
          <Button
            variant={ctaVariant}
            onClick={() => onConfirm(kind === 'reject' ? note.trim() || undefined : undefined)}
            disabled={busy}
          >
            {busy ? 'Yazılıyor…' : ctaLabel}
          </Button>
        </>
      }
    >
      <p className="font-ops-body text-ops-base leading-relaxed text-ops-strong">{body}</p>

      {/* Uygulama kararında ne olacağı burada söylenir; ret/erteleme kararında olacak bir şey yok. */}
      {kind === 'apply' ? (
        <div className="flex flex-col gap-1 rounded-ops-card border border-ops-gray-300 bg-ops-gray-100 px-3.5 py-2.5">
          <span className="font-ops-body text-ops-sm leading-relaxed text-ops-strong">{impact}</span>
          {undoHint ? <span className="font-ops-body text-ops-xs text-ops-muted">{undoHint}</span> : null}
        </div>
      ) : null}

      {notice ? (
        <p className={`rounded-ops-card border px-3 py-2.5 font-ops-body text-ops-xs font-medium leading-relaxed ${notice.skin}`}>
          {notice.text}
        </p>
      ) : null}

      {kind === 'reject' ? (
        <FieldShell fieldId={noteId} label="Ret notu" labelAside="isteğe bağlı">
          <Textarea
            id={noteId}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Neden reddettiniz? Bir cümle yeter."
            disabled={busy}
          />
        </FieldShell>
      ) : null}
    </Dialog>
  );
}
