'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { checkRegisterDayAction, removeRegisterStoreAction, saveRegisterStoreAction } from './register-actions';
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
      hint="Tesisin B2C satışları (nakit, kapıda kart, online) eşlendiği Hiboutik mağazasına yazılır, ödeme türleri kasada ayrılır; çekmecenin fiş dışı nakdi de o mağazaya gider."
    >
      {data.stores.map((store) => (
        <CardItem
          key={store.warehouseId}
          title={store.warehouseName}
          detail={<StoreDetail store={store} listed={data.externalStores !== null} />}
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
      <CardLine label="Karşılaştırma">
        <CheckLine check={data.check} />
      </CardLine>

      <StoreDialog
        row={editing}
        stores={data.externalStores}
        storesNote={data.externalStoresNote}
        accounts={data.cashAccounts}
        defaultAccountId={data.defaultCashAccountId}
        onClose={() => setEditing(null)}
      />
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

interface CheckLineProps {
  check: RegisterPanelData['check'];
}

/** Bugün, kapatmadan; düğme de zamanlanmış tur da aynı ize yazar, satır en son sonucu gösterir. */
function CheckLine({ check }: CheckLineProps) {
  const { busy, error, run } = useDialogAction(() => undefined);
  const differences = check?.differences ?? null;
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <JobText job={check}>
          {differences === null ? null : differences.length === 0 ? (
            ' · fark yok'
          ) : (
            <span className="text-ops-red">
              {` · ${differences.length} fark: `}
              {differences.join(' · ')}
            </span>
          )}
        </JobText>
        <DialogError error={error} />
      </div>
      <Button variant="secondary" size="sm" loading={busy} onClick={() => void run(checkRegisterDayAction)}>
        {busy ? 'Karşılaştırılıyor…' : 'Şimdi karşılaştır'}
      </Button>
    </div>
  );
}

interface StoreDetailProps {
  store: RegisterStoreRowView;
  /** Mağaza listesi okundu mu; okunmadıysa numaranın açık bir mağazaya ait olup olmadığı bilinmez. */
  listed: boolean;
}

/** Liste okunduğu hâlde numara listede yoksa eşleme açık bir mağazayı göstermiyor; satış o numaraya yazılamaz. */
function StoreDetail({ store, listed }: StoreDetailProps) {
  if (store.externalStoreId === null) return <>Eşlenmedi — bu tesisin satışı kasaya yazılmaz, kuyrukta bekler.</>;
  const name = store.externalStoreName ? `${store.externalStoreName} (${store.externalStoreId})` : String(store.externalStoreId);
  return (
    <>
      Hiboutik mağazası {name} · çekmece {store.cashAccountName}
      {listed && !store.externalStoreName ? <span className="text-ops-red"> · Hiboutik&apos;te bu numarada açık mağaza yok</span> : null}
    </>
  );
}

interface StoreDialogProps {
  row: RegisterStoreRowView | null;
  /** Hiboutik'teki açık mağazalar; `null` ise numara elle girilir ve sebebi `storesNote`ta yazar. */
  stores: { value: string; label: string }[] | null;
  storesNote: string | null;
  accounts: { value: string; label: string }[];
  defaultAccountId: string;
  onClose: () => void;
}

function StoreDialog({ row, stores, storesNote, accounts, defaultAccountId, onClose }: StoreDialogProps) {
  const [storeId, setStoreId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const close = () => {
    setLoadedFor(null);
    onClose();
  };
  const { busy, running, error, run, clearError } = useDialogAction(close);

  // Pencere başka bir tesis için açılınca alanlar o tesisin eşlemesiyle dolar; eşlenmemiş tesisin çekmecesi sabit Kasa'dır.
  if (row && loadedFor !== row.warehouseId) {
    setLoadedFor(row.warehouseId);
    setStoreId(row.externalStoreId === null ? '' : String(row.externalStoreId));
    setAccountId(row.cashAccountId ?? defaultAccountId);
    clearError();
  }

  return (
    <Dialog
      open={row !== null}
      onClose={close}
      title={row ? `${row.warehouseName} · kasa eşlemesi` : ''}
      subtitle="Tesisin B2C satışları (nakit, kapıda kart, online) seçilen Hiboutik mağazasına yazılır; Hiboutik onları ödeme türüyle ayırır: nakit ESP, kapıda kart CB, online WEB. Araç satışı aracın bağlı olduğu tesisin mağazasına gider."
      footer={
        <>
          {row?.externalStoreId !== null && row ? (
            <Button
              variant="secondary"
              loading={running === 'remove'}
              disabled={busy && running !== 'remove'}
              onClick={() => void run(() => removeRegisterStoreAction({ warehouseId: row.warehouseId }), 'remove')}
            >
              {running === 'remove' ? 'Kaldırılıyor…' : 'Eşlemeyi kaldır'}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={close} disabled={busy}>
            Vazgeç
          </Button>
          <Button
            variant="dark"
            loading={running === 'save'}
            disabled={running !== 'save' && (busy || !row || storeId.trim() === '' || accountId === '')}
            onClick={() =>
              row &&
              void run(() =>
                saveRegisterStoreAction({ warehouseId: row.warehouseId, externalStoreId: Number(storeId), cashAccountId: accountId }),
              )
            }
          >
            {running === 'save' ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {stores ? (
          <FieldShell label="Hiboutik mağazası" required>
            <Select
              value={storeId}
              onChange={setStoreId}
              options={stores}
              placeholder={stores.length > 0 ? 'Mağaza seç' : "Hiboutik'te açık mağaza yok"}
            />
          </FieldShell>
        ) : (
          <FieldShell fieldId="register-store-id" label="Hiboutik mağaza numarası" required>
            <Input
              id="register-store-id"
              inputMode="numeric"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              placeholder="1"
            />
            <FieldNote>{storesNote} Numara elle girilir; yanlış numara satışı başka mağazanın Z raporuna yazar.</FieldNote>
          </FieldShell>
        )}
        <FieldShell label="Çekmecedeki nakdin hesabı" required>
          <Select value={accountId} onChange={setAccountId} options={accounts} placeholder="Hesap seç" />
          <FieldNote>
            Mağazanın fiziksel kasa çekmecesindeki nakit bizde bu hesapta tutulur; Ayarlar › Para hesaplarındaki kapıda nakit kasasıyla aynı
            hesap olmalı. Bankaya yatırma ve çekmeceden ödenen gider gibi fiş dışı nakit hareketleri Hiboutik&apos;e bu hesaptan gider, gün
            sonu bu hesabı kasanın nakdiyle karşılaştırır. Kart ve online ödeme çekmeceye girmez.
          </FieldNote>
        </FieldShell>
        <DialogError error={error} />
      </div>
    </Dialog>
  );
}

interface FieldNoteProps {
  children: ReactNode;
}

function FieldNote({ children }: FieldNoteProps) {
  return <span className="font-ops-body text-ops-xs leading-[1.45] text-ops-muted">{children}</span>;
}
