'use client';

import { useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { shortDate } from '@/components/operation/ui/format';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Select } from '@/components/operation/form/select';
import { removePennylaneAccountAction, savePennylaneAccountAction } from './pennylane-actions';
import type { PennylaneAccountRowView, PennylanePanelData } from './pennylane-read';
import { CardItem, CardLine, DialogError, JobText, QueueText, SettingsCard } from './settings-sections';
import { useDialogAction } from './use-dialog-action.hook';

/**
 * Muhasebe yazılımı (Pennylane): banka hesabımız ↔ Pennylane'deki hesabı ve eşitlemenin izi. Pennylane'e yalnız backend bağlanır; kart
 * onun son turda okuduğunu gösterir.
 */
interface PennylaneCardProps {
  data: PennylanePanelData;
}

export function PennylaneCard({ data }: PennylaneCardProps) {
  const [editing, setEditing] = useState<PennylaneAccountRowView | null>(null);

  return (
    <SettingsCard
      title="Muhasebe (Pennylane)"
      count={data.accounts.filter((account) => account.pennylane !== null).length}
      hint="Eşlenen banka hesabının hareketleri eşlendiği günden itibaren Pennylane'den okunur, alış faturası ve fişi Pennylane'e bizden yüklenir; Pennylane'deki hesap listesini eşitleme her turda yeniler."
    >
      <CardLine label="Şirket">
        {data.connection ? (
          <span className="flex items-center gap-2 font-ops-body text-ops-xs text-ops-ink">
            {data.connection.company}
            <Badge tone={data.connection.mode === 'live' ? 'olive' : 'amber'}>
              {data.connection.mode === 'live' ? 'canlı kip' : 'test kipi'}
            </Badge>
          </span>
        ) : (
          <span className="font-ops-body text-ops-xs text-ops-muted">Bilinmiyor — eşitleme henüz başarıyla koşmadı.</span>
        )}
      </CardLine>

      {data.accounts.map((account) => (
        <CardItem
          key={account.accountId}
          title={account.accountName}
          detail={<AccountDetail account={account} quietDays={data.quietDays} />}
          action={
            <Button variant="secondary" size="sm" onClick={() => setEditing(account)}>
              {account.pennylane ? 'Düzenle' : 'Eşle'}
            </Button>
          }
        />
      ))}

      <CardLine label="Kuyruk">
        <QueueText queue={data.queue} />
      </CardLine>
      <CardLine label="Eşitleme">
        <JobText job={data.sync} />
      </CardLine>
      <CardLine label="Sessizlik">
        <JobText job={data.quietCheck} />
      </CardLine>

      <AccountDialog row={editing} options={data.freeOptions} onClose={() => setEditing(null)} />
    </SettingsCard>
  );
}

interface AccountDetailProps {
  account: PennylaneAccountRowView;
  quietDays: number;
}

/** Pennylane'de görünmeyen eşli hesap kırmızıyla yazılır: hareketi ne Pennylane'den ne dosyadan gelir. */
function AccountDetail({ account, quietDays }: AccountDetailProps) {
  if (!account.pennylane) return <>Eşlenmedi — hareketleri Excel ekstresiyle girilir.</>;
  return (
    <>
      Pennylane: {account.pennylane.name}
      {` · son hareket ${account.lastDate ? shortDate(account.lastDate) : 'yok'}`}
      {account.pennylane.gone ? <span className="text-ops-red"> · Pennylane&apos;de görünmüyor, okunmuyor</span> : null}
      {account.quiet ? <span className="text-ops-amber-dark"> · {quietDays} günden uzun süredir hareket yok</span> : null}
    </>
  );
}

interface AccountDialogProps {
  row: PennylaneAccountRowView | null;
  /** Eşlenebilecek Pennylane hesapları; satırın kendi eşlemesi listeye ayrıca eklenir. */
  options: { value: string; label: string }[];
  onClose: () => void;
}

function AccountDialog({ row, options, onClose }: AccountDialogProps) {
  const [pennylaneId, setPennylaneId] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const close = () => {
    setLoadedFor(null);
    onClose();
  };
  const { busy, error, run, clearError } = useDialogAction(close);

  // Pencere başka bir hesap için açılınca seçim o hesabın eşlemesiyle dolar.
  if (row && loadedFor !== row.accountId) {
    setLoadedFor(row.accountId);
    setPennylaneId(row.pennylane ? String(row.pennylane.id) : '');
    clearError();
  }

  const current = row?.pennylane ? String(row.pennylane.id) : '';
  const choices = row?.pennylane ? [{ value: current, label: row.pennylane.name }, ...options] : options;

  return (
    <Dialog
      open={row !== null}
      onClose={close}
      title={row ? `${row.accountName} · Pennylane eşlemesi` : ''}
      subtitle={
        row?.pennylane
          ? 'Eşleme değişirse hareketler ilk eşleme gününden yeniden okunur; önceki Pennylane hesabından gelen izahsız satırlar silinir, izahlı olanlar için muhasebe uyarılır.'
          : "Pennylane'de açık olan ve başka hesaba eşlenmemiş banka hesapları listelenir; hareketler eşleme gününden okunur, öncesi Excel ekstresiyle girilir."
      }
      footer={
        <>
          {row?.pennylane ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => removePennylaneAccountAction({ accountId: row.accountId }))}
            >
              Eşlemeyi kaldır
            </Button>
          ) : null}
          <Button variant="secondary" onClick={close} disabled={busy}>
            Vazgeç
          </Button>
          <Button
            variant="dark"
            disabled={busy || !row || pennylaneId === '' || pennylaneId === current}
            onClick={() =>
              row && void run(() => savePennylaneAccountAction({ accountId: row.accountId, pennylaneId: Number(pennylaneId) }))
            }
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <FieldShell label="Pennylane'deki banka hesabı" required>
          <Select
            value={pennylaneId}
            onChange={setPennylaneId}
            options={choices}
            placeholder={choices.length > 0 ? 'Hesap seç' : 'Seçilecek hesap yok'}
          />
        </FieldShell>
        {choices.length === 0 ? (
          <span className="font-ops-body text-ops-xs text-ops-muted">
            Liste eşitleme turundan gelir; turun izi kartın Eşitleme satırında.
          </span>
        ) : null}
        <DialogError error={error} />
      </div>
    </Dialog>
  );
}
