'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { shortDateTime } from '@/components/operation/ui/format';
import { DateField } from '@/components/operation/form/date-field';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { removeRegisterStoreAction, saveRegisterStoreAction, setRegisterLiveFromAction } from './register-actions';
import type { RegisterJobView, RegisterPanelData, RegisterStoreRowView } from './register-read';
import { SettingsCard } from './settings-sections';

/**
 * Sertifikalı kasa (Hiboutik): tesis ↔ kasa mağazası eşlemesi, canlıya geçiş günü ve kuyruğun hâli. Kasaya yazımın kendisi backend'in
 * işidir; kart onun izini gösterir, çünkü kasaya yazılamayan satış yasal bir açıktır ve fark edilmeli.
 */
interface RegisterCardProps {
  data: RegisterPanelData;
}

export function RegisterCard({ data }: RegisterCardProps) {
  const [editing, setEditing] = useState<RegisterStoreRowView | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);

  return (
    <SettingsCard
      title="Sertifikalı kasa (Hiboutik)"
      count={data.stores.filter((store) => store.externalStoreId !== null).length}
      hint="B2C satış ve tesis çekmecesinin fiş dışı nakdi bu eşlemeyle kasaya yazılır. Mağaza kasa yazılımında açılır, numarası buraya girilir."
      action={
        <Button variant="dark" size="sm" onClick={() => setLiveOpen(true)}>
          Canlıya geçiş
        </Button>
      }
    >
      <Line label="Canlıya geçiş">
        {data.liveFrom ? (
          <span className="font-ops-mono text-ops-xs text-ops-ink">{data.liveFrom}</span>
        ) : (
          <Badge tone="amber">Kapalı — kasaya hiçbir şey yazılmıyor</Badge>
        )}
      </Line>

      {data.stores.map((store) => (
        <div key={store.warehouseId} className="flex items-center gap-3 border-t border-ops-line-soft px-4 py-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-ops-body text-ops-base font-semibold text-ops-ink">{store.warehouseName}</span>
            <span className="font-ops-body text-ops-xs text-ops-body">
              {store.externalStoreId === null
                ? 'Eşlenmedi — bu tesisin satışı kasaya yazılmaz, kuyrukta bekler.'
                : `Mağaza ${store.externalStoreId} · çekmece ${store.cashAccountName}`}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setEditing(store)}>
            {store.externalStoreId === null ? 'Eşle' : 'Düzenle'}
          </Button>
        </div>
      ))}

      <Line label="Kuyruk">
        <span className="font-ops-body text-ops-xs text-ops-body">
          {data.waiting} bekliyor
          {data.failing > 0 ? <span className="text-ops-red"> · {data.failing} hata alıyor</span> : null}
          {data.blocked.map((blocked) => (
            <span key={blocked.reason} className="text-ops-amber-dark">
              {' '}
              · {blocked.count} duruyor ({blocked.reason})
            </span>
          ))}
        </span>
      </Line>
      <Line label="Eşitleme">
        <JobText job={data.sync} />
      </Line>
      <Line label="Gün sonu">
        <JobText job={data.dayEnd}>
          {data.dayEnd?.date
            ? ` · ${data.dayEnd.date} · ${data.dayEnd.differences === 0 ? 'fark yok' : `${data.dayEnd.differences} fark`}`
            : null}
        </JobText>
      </Line>

      <StoreDialog row={editing} accounts={data.cashAccounts} onClose={() => setEditing(null)} />
      <LiveFromDialog open={liveOpen} value={data.liveFrom} onClose={() => setLiveOpen(false)} />
    </SettingsCard>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-ops-line-soft px-4 py-2.5">
      <span className="w-[110px] flex-none font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-body">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Tur hiç koşmadıysa bunu söyler: "kayıt yok" ile "sorun yok" aynı şey değildir. */
function JobText({ job, children }: { job: RegisterJobView | null; children?: React.ReactNode }) {
  if (!job) return <span className="font-ops-body text-ops-xs text-ops-muted">Hiç koşmadı.</span>;
  return (
    <span className="font-ops-body text-ops-xs text-ops-body">
      {shortDateTime(job.at)}
      {job.error ? <span className="text-ops-red"> · {job.error}</span> : null}
      {job.skipped ? <span className="text-ops-amber-dark"> · atlandı ({job.skipped})</span> : null}
      {children}
    </span>
  );
}

function StoreDialog({
  row,
  accounts,
  onClose,
}: {
  row: RegisterStoreRowView | null;
  accounts: { value: string; label: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [storeId, setStoreId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Pencere başka bir tesis için açılınca alanlar o tesisin eşlemesiyle dolar.
  if (row && loadedFor !== row.warehouseId) {
    setLoadedFor(row.warehouseId);
    setStoreId(row.externalStoreId === null ? '' : String(row.externalStoreId));
    setAccountId(row.cashAccountId ?? '');
    setError(null);
  }

  const close = () => {
    setLoadedFor(null);
    onClose();
  };
  const run = async (action: () => Promise<{ error: string | null }>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    close();
  };

  return (
    <Dialog
      open={row !== null}
      onClose={close}
      title={row ? `${row.warehouseName} · kasa eşlemesi` : ''}
      subtitle="Mağaza numarası kasa yazılımındaki mağazanındır; çekmece, o mağazanın fiziksel kasasının nakit hesabıdır."
      footer={
        <>
          {row?.externalStoreId !== null && row ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => removeRegisterStoreAction({ warehouseId: row.warehouseId }))}
            >
              Eşlemeyi kaldır
            </Button>
          ) : null}
          <Button variant="secondary" onClick={close} disabled={busy}>
            Vazgeç
          </Button>
          <Button
            variant="dark"
            disabled={busy || !row || storeId.trim() === '' || accountId === ''}
            onClick={() =>
              row &&
              void run(() =>
                saveRegisterStoreAction({ warehouseId: row.warehouseId, externalStoreId: Number(storeId), cashAccountId: accountId }),
              )
            }
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <FieldShell fieldId="register-store-id" label="Mağaza numarası" required>
          <Input id="register-store-id" inputMode="numeric" value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="1" />
        </FieldShell>
        <FieldShell label="Çekmecenin nakit hesabı" required>
          <Select value={accountId} onChange={setAccountId} options={accounts} placeholder="Hesap seç" />
        </FieldShell>
        {error ? <span className="font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
      </div>
    </Dialog>
  );
}

function LiveFromDialog({ open, value, onClose }: { open: boolean; value: string | null; onClose: () => void }) {
  const router = useRouter();
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Pencere her açılışta güncel değerle dolar; önceki açılıştan kalan seçim ya da hata gösterilmez.
  if (open !== loaded) {
    setLoaded(open);
    if (open) {
      setDate(value ?? '');
      setError(null);
    }
  }

  const save = async (next: string | null) => {
    setBusy(true);
    setError(null);
    const result = await setRegisterLiveFromAction({ date: next });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Canlıya geçiş"
      subtitle="Bu günden (Paris, gece yarısı) önce açılan sipariş ve yazılan kasa hareketi kasaya gitmez. Boş bırakılırsa kasaya hiçbir şey yazılmaz."
      footer={
        <>
          {value ? (
            <Button variant="secondary" disabled={busy} onClick={() => void save(null)}>
              Kasayı kapat
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button variant="dark" disabled={busy || date === ''} onClick={() => void save(date)}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <DateField label="Gün" value={date} onChange={setDate} clearable={false} />
        {error ? <span className="font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
      </div>
    </Dialog>
  );
}
