'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { IntegrationCheck } from '@lezzet/application/integration/checks';
import type { IntegrationCheckStatus, IntegrationSecretName } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { CopyInline } from '@/components/operation/ui/copy-text';
import { Dialog } from '@/components/operation/ui/dialog';
import { shortDateTime } from '@/components/operation/ui/format';
import type { OpsTone } from '@/components/operation/ui/tone';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import {
  checkIntegrationKeysAction,
  clearIntegrationKeyAction,
  copyIntegrationKeyAction,
  setIntegrationKeyAction,
} from './integration-keys-actions';
import type { IntegrationKeyGroupView, IntegrationKeyLogView, IntegrationKeysPanelData, IntegrationKeyView } from './integration-keys-read';
import { CardGrid, DialogError, GridCell, SettingsCard } from './settings-sections';
import { useDialogAction } from './use-dialog-action.hook';

/**
 * Bağlantılar sekmesi: sağlayıcı başına kart, anahtar başına satır. Değer sayfaya gelmez; sınama sonucu sayfa açıkken tutulur, çünkü
 * sağlayıcının bugünkü cevabıdır ve saklanırsa bayatlar.
 */

type Results = Partial<Record<IntegrationSecretName, { check: IntegrationCheck; at: string }>>;
type LabelOf = (name: IntegrationSecretName) => string;

/** Kart rozeti en kötü sonucu söyler; sıra o yüzden önem sırasıdır. */
const STATUS: Record<IntegrationCheckStatus, { label: string; tone: OpsTone; rank: number; text: string; dot: string }> = {
  ok: { label: 'Çalışıyor', tone: 'olive', rank: 1, text: 'text-ops-olive-dark', dot: 'bg-ops-olive' },
  rejected: { label: 'Reddedildi', tone: 'red', rank: 4, text: 'text-ops-red', dot: 'bg-ops-red' },
  unreachable: { label: 'Ulaşılamadı', tone: 'amber', rank: 3, text: 'text-ops-amber-dark', dot: 'bg-ops-amber' },
  incomplete: { label: 'Eksik', tone: 'amber', rank: 2, text: 'text-ops-amber-dark', dot: 'bg-ops-amber' },
  unverifiable: { label: 'Sınanamaz', tone: 'neutral', rank: 0, text: 'text-ops-body', dot: 'bg-ops-faint' },
};

const SOURCE: Record<'vault' | 'env' | 'none', { label: string; tone: OpsTone }> = {
  vault: { label: 'Kayıtlı', tone: 'olive' },
  env: { label: 'Ortamdan', tone: 'neutral' },
  none: { label: 'Tanımlı değil', tone: 'amber' },
};

const definedNames = (keys: IntegrationKeyView[]): IntegrationSecretName[] => keys.filter((key) => key.masked).map((key) => key.name);

/** Hata düğmede "kopyalanamadı" olarak görünsün diye fırlatılır; değer bileşenin durumuna yazılmaz. */
async function copyValue(name: IntegrationSecretName): Promise<string> {
  const result = await copyIntegrationKeyAction({ name });
  if (result.data === null) throw new Error(result.error ?? 'Anahtar alınamadı.');
  return result.data;
}

interface ConnectionsPanelProps {
  data: IntegrationKeysPanelData;
}

export function ConnectionsPanel({ data }: ConnectionsPanelProps) {
  const [results, setResults] = useState<Results>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ group: IntegrationKeyGroupView; key: IntegrationKeyView } | null>(null);
  const allNames = data.groups.flatMap((group) => definedNames(group.keys));
  const labelOf: LabelOf = (name) => data.groups.flatMap((group) => group.keys).find((key) => key.name === name)?.label ?? name;

  const runChecks = async (scope: string, names: IntegrationSecretName[]) => {
    setChecking(scope);
    setCheckError(null);
    const result = await checkIntegrationKeysAction({ names });
    setChecking(null);
    if (!result.data) {
      setCheckError(result.error ?? 'Sınama yapılamadı.');
      return;
    }
    const at = new Date().toISOString();
    const fresh = Object.fromEntries(Object.entries(result.data).map(([name, check]) => [name, { check, at }])) as Results;
    setResults((prev) => ({ ...prev, ...fresh }));
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-start gap-4">
        <p className="min-w-[280px] max-w-[780px] flex-1 font-ops-body text-ops-xs leading-[1.55] text-ops-body">
          Anahtarlar veritabanında şifreli durur ve ekranda yalnız son dört hanesi görünür. Kopyala tam değeri o an sunucudan ister; kimin
          kopyaladığı kayda geçer. Yeni değer kaydedilmeden önce sağlayıcıda sınanır, reddedilen anahtar kaydedilmez. Burada yazılı olmayan
          anahtar ortam dosyasından okunur.
        </p>
        <Button
          variant="secondary"
          size="sm"
          loading={checking === 'all'}
          disabled={checking !== null || allNames.length === 0}
          onClick={() => void runChecks('all', allNames)}
        >
          {checking === 'all' ? 'Sınanıyor…' : Object.keys(results).length > 0 ? 'Tümünü yeniden sına' : 'Tümünü sına'}
        </Button>
      </div>
      <DialogError error={checkError} />

      <CardGrid>
        {data.groups.map((group) => (
          <GridCell key={group.title}>
            <GroupCard
              group={group}
              results={results}
              checking={checking === group.title || checking === 'all'}
              disabled={checking !== null}
              labelOf={labelOf}
              onCheck={() => void runChecks(group.title, definedNames(group.keys))}
              onEdit={(key) => setEditing({ group, key })}
            />
          </GridCell>
        ))}
        <GridCell wide>
          <LogCard log={data.log} />
        </GridCell>
      </CardGrid>

      <KeyDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={(name, check) => setResults((prev) => ({ ...prev, [name]: { check, at: new Date().toISOString() } }))}
      />
    </div>
  );
}

interface GroupCardProps {
  group: IntegrationKeyGroupView;
  results: Results;
  checking: boolean;
  disabled: boolean;
  labelOf: LabelOf;
  onCheck: () => void;
  onEdit: (key: IntegrationKeyView) => void;
}

function GroupCard({ group, results, checking, disabled, labelOf, onCheck, onEdit }: GroupCardProps) {
  const defined = definedNames(group.keys).length;
  const checks = group.keys.flatMap((key) => results[key.name]?.check ?? []);
  const worst = checks.filter((check) => STATUS[check.status].rank > 0).sort((a, b) => STATUS[b.status].rank - STATUS[a.status].rank)[0];
  const pill = worst ? STATUS[worst.status] : checks.length > 0 ? STATUS.unverifiable : null;

  return (
    <SettingsCard
      title={group.title}
      count={`${defined} / ${group.keys.length}`}
      hint={group.purpose}
      action={
        <span className="flex items-center gap-2">
          <Badge tone={pill?.tone ?? 'neutral'}>{pill?.label ?? 'Sınanmadı'}</Badge>
          <Button variant="secondary" size="sm" loading={checking} disabled={disabled || defined === 0} onClick={onCheck}>
            Sına
          </Button>
        </span>
      }
    >
      {group.keys.map((key) => (
        <KeyRow key={key.name} row={key} group={group} result={results[key.name]} labelOf={labelOf} onEdit={() => onEdit(key)} />
      ))}
    </SettingsCard>
  );
}

interface KeyRowProps {
  row: IntegrationKeyView;
  group: IntegrationKeyGroupView;
  result: Results[IntegrationSecretName];
  labelOf: LabelOf;
  onEdit: () => void;
}

function KeyRow({ row, group, result, labelOf, onEdit }: KeyRowProps) {
  const source = SOURCE[row.source ?? 'none'];
  return (
    <div className="flex items-start gap-3.5 border-t border-ops-line-soft px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-ops-body text-ops-base font-semibold text-ops-ink">{row.label}</span>
          <Badge tone={source.tone}>{source.label}</Badge>
        </div>
        {row.masked ? (
          <span className="flex items-center gap-1.5 font-ops-mono text-ops-xs font-medium tracking-[0.02em] text-ops-strong">
            {row.masked}
            <CopyInline text={() => copyValue(row.name)} what={`${group.title} ${row.label}`} />
          </span>
        ) : null}
        <span className="font-ops-body text-ops-xs text-ops-body">
          {row.stored
            ? `Son değişiklik ${shortDateTime(row.stored.at)} · ${row.stored.byName ?? 'kim yazdığı bilinmiyor'}`
            : row.source === 'env'
              ? 'Ortam dosyasındaki değer kullanılıyor'
              : 'Bu anahtar olmadan bağlantı kurulmaz'}
        </span>
        {result ? <CheckLine check={result.check} at={result.at} labelOf={labelOf} /> : null}
      </div>
      <Button variant="secondary" size="sm" onClick={onEdit}>
        {row.stored ? 'Yenile' : 'Yaz'}
      </Button>
    </div>
  );
}

interface CheckLineProps {
  check: IntegrationCheck;
  at: string;
  labelOf: LabelOf;
}

function CheckLine({ check, at, labelOf }: CheckLineProps) {
  const status = STATUS[check.status];
  return (
    <span className={`flex items-baseline gap-1.5 font-ops-body text-ops-xs font-medium ${status.text}`}>
      <span className={`size-[7px] flex-none -translate-y-px rounded-full ${status.dot}`} />
      {sentenceOf(check, at, labelOf)}
    </span>
  );
}

function sentenceOf(check: IntegrationCheck, at: string, labelOf: LabelOf): string {
  switch (check.status) {
    case 'ok':
      return `Çalışıyor · ${shortDateTime(at)} sınandı`;
    case 'rejected':
      return `Reddedildi · ${check.detail}`;
    case 'unreachable':
      return `Ulaşılamadı · ${check.detail}`;
    case 'incomplete':
      return `Eksik · ${check.missing.map(labelOf).join(', ')} girilince birlikte sınanır`;
    case 'unverifiable':
      return `Sınanamaz · ${check.detail}`;
  }
}

function actionOf(row: IntegrationKeyLogView): string {
  if (row.action === 'copy') return 'kopyalandı';
  if (row.action === 'clear') return 'kaldırıldı';
  return row.checkStatus ? `yazıldı · ${STATUS[row.checkStatus].label.toLocaleLowerCase('tr')}` : 'yazıldı';
}

interface LogCardProps {
  log: IntegrationKeyLogView[];
}

function LogCard({ log }: LogCardProps) {
  return (
    <SettingsCard title="Son değişiklikler" count={log.length}>
      {log.length === 0 ? (
        <p className="border-t border-ops-line-soft px-4 py-3 font-ops-body text-ops-xs text-ops-body">Henüz anahtar yazılmadı.</p>
      ) : (
        <div className="max-h-[260px] overflow-y-auto pb-1">
          {log.map((row) => (
            <div key={row.id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-t border-ops-line-soft px-4 py-1.5">
              <span className="font-ops-body text-ops-xs font-medium text-ops-ink">{row.label}</span>
              <span className="font-ops-body text-ops-micro text-ops-muted">{actionOf(row)}</span>
              <span className="font-ops-body text-ops-micro text-ops-muted">{row.byName ?? 'kim yaptığı bilinmiyor'}</span>
              <span className="ml-auto font-ops-mono text-ops-micro text-ops-muted">{shortDateTime(row.at)}</span>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

interface KeyDialogProps {
  target: { group: IntegrationKeyGroupView; key: IntegrationKeyView } | null;
  onClose: () => void;
  onSaved: (name: IntegrationSecretName, check: IntegrationCheck) => void;
}

/** Değer alanı pencere kapanınca boşalır; yarıda bırakılan yazım bir sonraki anahtarın penceresine taşınmasın. */
function KeyDialog({ target, onClose, onSaved }: KeyDialogProps) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [outcome, setOutcome] = useState<IntegrationCheck | null>(null);
  const [saving, setSaving] = useState<'save' | 'force' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = useCallback(() => {
    setValue('');
    setVisible(false);
    setOutcome(null);
    setError(null);
    onClose();
  }, [onClose]);
  const clearing = useDialogAction(close);
  const name = target?.key.name;
  const busy = saving !== null || clearing.busy;

  const save = async (force: boolean) => {
    if (!name) return;
    setSaving(force ? 'force' : 'save');
    setError(null);
    const result = await setIntegrationKeyAction({ name, value, force });
    setSaving(null);
    if (!result.data) {
      setError(result.error ?? 'Kaydedilemedi.');
      return;
    }
    if (!result.data.saved) {
      setOutcome(result.data.check);
      return;
    }
    onSaved(name, result.data.check);
    close();
    startRefresh(() => router.refresh());
  };

  return (
    <Dialog
      open={target !== null}
      onClose={close}
      maxWidth={480}
      title={target ? `${target.group.title} · ${target.key.label}` : ''}
      subtitle="Kaydetmeden önce sağlayıcıda sınanır"
      footer={
        <>
          {target?.key.stored && name ? (
            <Button
              variant="danger"
              className="mr-auto"
              loading={clearing.running === 'clear'}
              disabled={busy && clearing.running !== 'clear'}
              onClick={() => void clearing.run(() => clearIntegrationKeyAction({ name }), 'clear')}
            >
              {clearing.running === 'clear' ? 'Kaldırılıyor…' : 'Kaldır'}
            </Button>
          ) : null}
          <Button variant="secondary" className="ml-auto" onClick={close} disabled={busy}>
            Vazgeç
          </Button>
          {outcome?.status === 'unreachable' ? (
            <Button variant="warning" loading={saving === 'force'} disabled={busy && saving !== 'force'} onClick={() => void save(true)}>
              Yine de kaydet
            </Button>
          ) : null}
          <Button
            variant="primary"
            loading={saving === 'save'}
            disabled={saving !== 'save' && (busy || value.trim() === '')}
            onClick={() => void save(false)}
          >
            {saving === 'save' ? 'Sınanıyor…' : outcome?.status === 'unreachable' ? 'Tekrar sına' : 'Sına ve kaydet'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <FieldShell fieldId="integration-key-value" label="Yeni değer" required>
            <Input
              id="integration-key-value"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              spellCheck={false}
              mono
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setOutcome(null);
              }}
              trailing={
                <button
                  type="button"
                  onClick={() => setVisible((shown) => !shown)}
                  className="cursor-pointer rounded-ops-btn px-2 py-1 font-ops-display text-ops-micro font-semibold text-ops-olive-dark hover:bg-ops-olive-bg"
                >
                  {visible ? 'Gizle' : 'Göster'}
                </button>
              }
            />
          </FieldShell>
          <span className="font-ops-body text-ops-micro text-ops-muted">
            Değer kayıt defterine ve loga yazılmaz; yalnız kimin, ne zaman yazdığı düşer.
          </span>
        </div>
        {outcome?.status === 'rejected' ? (
          <OutcomeBox tone="red">{`${outcome.detail}. Anahtar kaydedilmedi; değeri sağlayıcının sayfasıyla karşılaştırın.`}</OutcomeBox>
        ) : null}
        {outcome?.status === 'unreachable' ? (
          <OutcomeBox tone="amber">
            {`Sağlayıcıya ulaşılamadı (${outcome.detail}). Anahtar sınanmadan kaydedilebilir; kart sınanana kadar "Sınanmadı" der.`}
          </OutcomeBox>
        ) : null}
        <DialogError error={error ?? clearing.error} />
      </div>
    </Dialog>
  );
}

interface OutcomeBoxProps {
  tone: 'red' | 'amber';
  children: string;
}

function OutcomeBox({ tone, children }: OutcomeBoxProps) {
  const style =
    tone === 'red'
      ? { box: 'border-ops-red-line bg-ops-red-bg text-ops-red-dark', dot: 'bg-ops-red' }
      : { box: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark', dot: 'bg-ops-amber' };
  return (
    <div
      className={`flex items-start gap-2.5 rounded-[9px] border px-3.5 py-3 font-ops-body text-ops-xs font-medium leading-[1.5] ${style.box}`}
    >
      <span className={`mt-1.5 size-[7px] flex-none rounded-full ${style.dot}`} />
      <span>{children}</span>
    </div>
  );
}
