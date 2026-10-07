'use client';

import { useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { shortDateTime } from '@/components/operation/ui/format';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { clearIntegrationKeyAction, setIntegrationKeyAction } from './integration-keys-actions';
import type { IntegrationKeyGroupView, IntegrationKeysPanelData, IntegrationKeyView } from './integration-keys-read';
import { DialogError, SettingsCard } from './settings-sections';
import { useDialogAction } from './use-dialog-action.hook';

/**
 * Bağlantı anahtarları: Revolut, Pennylane, Hiboutik ve e-posta anahtarları Vault'ta şifreli durur ve buradan değişir. Değer bir
 * kez yazılır, bir daha gösterilmez; kayıtlı olmayan anahtar için süreçler sunucu ortamındaki değeri kullanır.
 */
interface IntegrationKeysCardProps {
  data: IntegrationKeysPanelData;
}

export function IntegrationKeysCard({ data }: IntegrationKeysCardProps) {
  const [editing, setEditing] = useState<{ group: IntegrationKeyGroupView; key: IntegrationKeyView } | null>(null);
  const storedCount = data.groups.flatMap((group) => group.keys).filter((key) => key.stored).length;

  return (
    <SettingsCard
      title="Bağlantı anahtarları"
      count={storedCount}
      hint="Ödeme, muhasebe, kasa ve e-posta bağlantılarının anahtarları şifreli saklanır. Yazılan değer bir daha gösterilmez; değişiklik en geç bir dakikada bütün süreçlerde geçerli olur ve deftere kimle, ne zaman yazıldığı düşer."
    >
      {data.groups.map((group) => (
        <div key={group.title} className="border-t border-ops-line-soft">
          <span className="block px-4 pb-1 pt-2.5 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-body">
            {group.title}
          </span>
          {group.keys.map((key) => (
            <KeyRow key={key.name} row={key} onEdit={() => setEditing({ group, key })} />
          ))}
        </div>
      ))}

      {/* Uyarı koşulsuz: sunucu ortamı web sürecinin ortamı değildir ve bu panel orada değer olup olmadığını ölçemez. */}
      <p className="border-t border-ops-amber-line bg-ops-amber-bg px-4 py-2.5 font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
        Kayıtlı olmayan anahtarda süreçler sunucu ortamındaki değeri kullanır; bu panel o değeri göremez. Anahtarı buraya yazınca ortamdaki
        değer devreden çıkar.
      </p>

      <span className="border-t border-ops-line-soft px-4 pb-1.5 pt-2.5 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-body">
        Son değişiklikler
      </span>
      {data.log.length === 0 ? (
        <p className="px-4 pb-3 font-ops-body text-ops-xs text-ops-body">Henüz anahtar yazılmadı.</p>
      ) : (
        <div className="max-h-[220px] overflow-y-auto pb-2">
          {data.log.map((row) => (
            <div key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-1">
              <span className="font-ops-body text-ops-xs text-ops-ink">{row.label}</span>
              <span className="font-ops-body text-ops-micro text-ops-muted">{row.action === 'set' ? 'yazıldı' : 'kaldırıldı'}</span>
              <span className="font-ops-body text-ops-micro text-ops-faint">{row.byName ?? 'kim yazdığı bilinmiyor'}</span>
              <span className="ml-auto font-ops-mono text-ops-micro text-ops-faint">{shortDateTime(row.at)}</span>
            </div>
          ))}
        </div>
      )}

      <KeyDialog target={editing} onClose={() => setEditing(null)} />
    </SettingsCard>
  );
}

interface KeyRowProps {
  row: IntegrationKeyView;
  onEdit: () => void;
}

function KeyRow({ row, onEdit }: KeyRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-ops-body text-ops-base font-semibold text-ops-ink">{row.label}</span>
          {row.stored ? (
            <Badge tone="olive" dot>
              Kayıtlı
            </Badge>
          ) : (
            <Badge tone="neutral">Kayıtlı değil</Badge>
          )}
        </div>
        <span className="font-ops-body text-ops-xs text-ops-body">
          {row.stored
            ? `Son değişiklik ${shortDateTime(row.stored.at)} · ${row.stored.byName ?? 'kim yazdığı bilinmiyor'}`
            : 'Süreçler sunucu ortamındaki değeri kullanır.'}
        </span>
      </div>
      <Button variant="secondary" size="sm" onClick={onEdit}>
        {row.stored ? 'Yenile' : 'Yaz'}
      </Button>
    </div>
  );
}

interface KeyDialogProps {
  target: { group: IntegrationKeyGroupView; key: IntegrationKeyView } | null;
  onClose: () => void;
}

/** Değer alanı gizli yazılır ve pencere kapanınca silinir; kaydedilen değer bir daha hiçbir yerde gösterilmez. */
function KeyDialog({ target, onClose }: KeyDialogProps) {
  const [value, setValue] = useState('');
  const close = () => {
    setValue('');
    onClose();
  };
  const { busy, running, error, run } = useDialogAction(close);
  const name = target?.key.name;

  return (
    <Dialog
      open={target !== null}
      onClose={close}
      title={target ? `${target.group.title} · ${target.key.label}` : ''}
      subtitle="Yazılan değer şifreli saklanır ve bir daha gösterilmez. En geç bir dakika içinde bütün süreçler yeni değeri kullanır."
      footer={
        <>
          {target?.key.stored && name ? (
            <Button
              variant="secondary"
              loading={running === 'clear'}
              disabled={busy && running !== 'clear'}
              onClick={() => void run(() => clearIntegrationKeyAction({ name }), 'clear')}
            >
              {running === 'clear' ? 'Kaldırılıyor…' : 'Kaldır'}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={close} disabled={busy}>
            Vazgeç
          </Button>
          <Button
            variant="dark"
            loading={running === 'save'}
            disabled={running !== 'save' && (busy || !name || value.trim() === '')}
            onClick={() => name && void run(() => setIntegrationKeyAction({ name, value }))}
          >
            {running === 'save' ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <FieldShell fieldId="integration-key-value" label="Yeni değer" required>
          <Input
            id="integration-key-value"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </FieldShell>
        <DialogError error={error} />
      </div>
    </Dialog>
  );
}
