'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { removeRegisterStoreAction, saveRegisterStoreAction } from './register-actions';
import type { RegisterDayEndView, RegisterPanelData, RegisterStoreRowView } from './register-read';
import { CardItem, CardLine, DialogError, JobText, QueueText, SettingsCard } from './settings-sections';
import { useDialogAction } from './use-dialog-action.hook';

/**
 * Sertifikalı kasa (Hiboutik): tesis ↔ kasa mağazası eşlemesi ve kuyruğun hâli. Kasaya yazımın kendisi backend'in işidir; kart onun
 * izini gösterir, çünkü kasaya yazılamayan satış yasal bir açıktır ve fark edilmeli.
 */
interface RegisterCardProps {
  data: RegisterPanelData;
}

export function RegisterCard({ data }: RegisterCardProps) {
  const [editing, setEditing] = useState<RegisterStoreRowView | null>(null);

  return (
    <SettingsCard
      title="Sertifikalı kasa (Hiboutik)"
      count={data.stores.filter((store) => store.externalStoreId !== null).length}
      hint="B2C satış ve tesis çekmecesinin fiş dışı nakdi bu eşlemeyle kasaya yazılır. Mağaza kasa yazılımında açılır, numarası buraya girilir."
    >
      {data.stores.map((store) => (
        <CardItem
          key={store.warehouseId}
          title={store.warehouseName}
          detail={
            store.externalStoreId === null
              ? 'Eşlenmedi — bu tesisin satışı kasaya yazılmaz, kuyrukta bekler.'
              : `Mağaza ${store.externalStoreId} · çekmece ${store.cashAccountName}`
          }
          action={
            <Button variant="secondary" size="sm" onClick={() => setEditing(store)}>
              {store.externalStoreId === null ? 'Eşle' : 'Düzenle'}
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
      <CardLine label="Gün sonu">
        <JobText job={data.dayEnd}>{data.dayEnd?.date ? <DayEndText dayEnd={data.dayEnd} /> : null}</JobText>
      </CardLine>

      <StoreDialog row={editing} accounts={data.cashAccounts} onClose={() => setEditing(null)} />
    </SettingsCard>
  );
}

/** Gün kapanmadıysa sebebi kırmızıyla: kapanmayan kasa günü yasal bir açıktır. */
function DayEndText({ dayEnd }: { dayEnd: RegisterDayEndView & { date: string | null } }) {
  const reasons = [
    dayEnd.differences > 0 ? `${dayEnd.differences} fark` : null,
    dayEnd.waiting > 0 ? `${dayEnd.waiting} kayıt bekliyor` : null,
    dayEnd.olderUnclosed ? 'daha eski bir gün kapanmamış' : null,
  ].filter(Boolean);
  return (
    <>
      {` · ${dayEnd.date} · `}
      {dayEnd.closed ? (
        'kapandı'
      ) : reasons.length > 0 ? (
        <span className="text-ops-red">kapanmadı: {reasons.join(', ')}</span>
      ) : (
        `fark yok${dayEnd.live ? '' : ' · canlı kip değil, kapatılmadı'}`
      )}
    </>
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
  const [storeId, setStoreId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const close = () => {
    setLoadedFor(null);
    onClose();
  };
  const { busy, error, run, clearError } = useDialogAction(close);

  // Pencere başka bir tesis için açılınca alanlar o tesisin eşlemesiyle dolar.
  if (row && loadedFor !== row.warehouseId) {
    setLoadedFor(row.warehouseId);
    setStoreId(row.externalStoreId === null ? '' : String(row.externalStoreId));
    setAccountId(row.cashAccountId ?? '');
    clearError();
  }

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
        <DialogError error={error} />
      </div>
    </Dialog>
  );
}
