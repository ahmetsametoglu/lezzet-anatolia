'use client';

import { useState, type ReactNode } from 'react';
import { CounterpartyKindEnum, type CounterpartyKind } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { UnderlineTabs } from '@/components/operation/ui/underline-tabs';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { Select } from '@/components/operation/form/select';
import {
  addCounterpartyAction,
  addNatureAction,
  addTagAction,
  setTagActiveAction,
  updateCounterpartyAction,
  updateNatureAction,
} from '@/lib/finance/actions';
import { COUNTERPARTY_KIND_LABEL, NATURE_DIRECTION_LABEL } from './finance-labels';
import type { DictionaryView } from './finance-types';

/*
  SÖZLÜK (13.09 · ikinci karar, muhasebeci karşılaştırması) — üç liste, üç ayrı soru:

  - TÜR — "bu para neyin parası": kira, maaş, banka masrafı. Harekete TEK tür konur; yönü (gider /
    gelir / iki yön) ve isteğe bağlı hesap planı kodu (PCG) taşır — kod muhasebecinin dökümüne gider.
  - CARİ — "kime ödendi / kimden geldi": URSSAF, muhasebeci, ev sahibi, çalışan. Eşleşme kelimeleri
    banka satırında aranır ("URSSAF" geçen satır bu cariye önerilir); varsayılan türü harekete geçer.
  - ETİKET — serbest işaret ("Ortak A aracı"): izah DEĞİLDİR, süzmek ve gruplamak içindir.

  Ortaklar burada DEĞİL: ortağın tek kaydı ortak cari HESABIDIR (hesap türü `partner`) — ortağın
  koyduğu ve çektiği para o hesabın hareketidir. Bir tur ortak hem etiket hem hesaptı ve ikisi
  birbirinden ayrışabiliyordu (kullanıcı sorusu 13.09).

  Hiçbiri SİLİNMEZ, pasifleşir: eski hareketler onu taşımaya devam eder, yeni kayda verilmez.
  Pencere yazımdan sonra açık kalır — sözlük action'ları sayfayı aynı cevapta tazeliyor.
*/

type DictionaryTab = 'natures' | 'counterparties' | 'tags';
type NatureDirectionKey = keyof typeof NATURE_DIRECTION_LABEL;
/** Sekmelerin ortak yazım kapısı — bekleme anahtarı, hata ve sonuç tek yerde. */
type Run = (key: string, action: () => Promise<{ error: string | null }>) => Promise<boolean>;
type NatureEntry = DictionaryView['natures'][number];
type CounterpartyEntry = DictionaryView['counterparties'][number];

const NATURE_DIRECTIONS = ['out', 'in', 'both'] as const satisfies readonly NatureDirectionKey[];

/** "URSSAF, DGFIP" → iki kelime; virgül ayırır, boşluklu ifade tek kelimedir ("CABINET MULLER"). */
function keywordsOf(text: string): string[] {
  return text
    .split(',')
    .map((word) => word.trim())
    .filter((word) => word !== '');
}

interface DictionaryDialogProps {
  dictionary: DictionaryView;
  onClose: () => void;
}

export function DictionaryDialog({ dictionary, onClose }: DictionaryDialogProps) {
  const [tab, setTab] = useState<DictionaryTab>('natures');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run: Run = async (key, action) => {
    setError(null);
    setBusy(key);
    const { error: actionError } = await action();
    setBusy(null);
    if (actionError) {
      setError(actionError);
      return false;
    }
    return true;
  };

  return (
    <Dialog open onClose={onClose} title="Sözlük" subtitle="Tür · cari · etiket — silinmez, pasifleşir" maxWidth={680}>
      <div className="flex flex-col gap-4">
        <UnderlineTabs
          items={[
            { key: 'natures', label: `Türler · ${dictionary.natures.length}` },
            { key: 'counterparties', label: `Cariler · ${dictionary.counterparties.length}` },
            { key: 'tags', label: `Etiketler · ${dictionary.tags.length}` },
          ]}
          value={tab}
          onChange={(next) => {
            setTab(next);
            setError(null);
          }}
        />
        {error ? <p className="font-ops-body text-ops-xs text-ops-red">{error}</p> : null}
        {tab === 'natures' ? <NaturesTab natures={dictionary.natures} busy={busy} run={run} /> : null}
        {tab === 'counterparties' ? (
          <CounterpartiesTab counterparties={dictionary.counterparties} natures={dictionary.natures} busy={busy} run={run} />
        ) : null}
        {tab === 'tags' ? <TagsTab tags={dictionary.tags} busy={busy} run={run} /> : null}
      </div>
    </Dialog>
  );
}

// ── Türler ────────────────────────────────────────────────────────────────────

interface NaturesTabProps {
  natures: DictionaryView['natures'];
  busy: string | null;
  run: Run;
}

function NaturesTab({ natures, busy, run }: NaturesTabProps) {
  /** Düzenlenen türün anahtarı — `null` ise form yeni tür ekler. */
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [direction, setDirection] = useState<NatureDirectionKey>('out');
  const [accountCode, setAccountCode] = useState('');

  const reset = () => {
    setEditing(null);
    setLabel('');
    setDirection('out');
    setAccountCode('');
  };
  const edit = (nature: NatureEntry) => {
    setEditing(nature.slug);
    setLabel(nature.label);
    setDirection(nature.direction ?? 'both');
    setAccountCode(nature.accountCode ?? '');
  };
  const save = async () => {
    const fields = { label, direction: direction === 'both' ? null : direction, accountCode };
    const ok = editing
      ? await run(editing, () => updateNatureAction(editing, fields))
      : await run('new', () => addNatureAction(fields));
    if (ok) reset();
  };

  return (
    <div className="flex flex-col gap-4">
      <EntryForm
        editing={editing !== null}
        busy={busy === (editing ?? 'new')}
        disabled={busy !== null || label.trim() === ''}
        onSubmit={() => void save()}
        onCancel={reset}
      >
        <MultiToggle
          value={direction}
          onChange={setDirection}
          label="Türün yönü"
          options={NATURE_DIRECTIONS.map((key) => ({ key, label: NATURE_DIRECTION_LABEL[key] }))}
        />
        <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-2">
          <TextField id="nature-label" label="Tür adı" value={label} onChange={setLabel} placeholder="Sigorta · Kırtasiye · Faiz geliri" />
          <TextField id="nature-code" label="Hesap kodu (PCG)" aside="isteğe bağlı" value={accountCode} onChange={setAccountCode} placeholder="616" />
        </div>
      </EntryForm>
      <DictionaryList count={natures.length} empty="Sözlükte tür yok.">
        {natures.map((nature) => (
          <DictionaryRow
            key={nature.slug}
            label={nature.label}
            detail={`${NATURE_DIRECTION_LABEL[nature.direction ?? 'both']}${nature.accountCode ? ` · hesap ${nature.accountCode}` : ''}`}
            active={nature.isActive}
            busy={busy === nature.slug}
            locked={busy !== null}
            onEdit={() => edit(nature)}
            onToggle={() => void run(nature.slug, () => updateNatureAction(nature.slug, { isActive: !nature.isActive }))}
          />
        ))}
      </DictionaryList>
    </div>
  );
}

// ── Cariler ───────────────────────────────────────────────────────────────────

interface CounterpartiesTabProps {
  counterparties: DictionaryView['counterparties'];
  natures: DictionaryView['natures'];
  busy: string | null;
  run: Run;
}

function CounterpartiesTab({ counterparties, natures, busy, run }: CounterpartiesTabProps) {
  /** Düzenlenen carinin kimliği — `null` ise form yeni cari ekler. */
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CounterpartyKind>('institution');
  const [keywords, setKeywords] = useState('');
  const [defaultNature, setDefaultNature] = useState('');
  const natureLabel = new Map(natures.map((nature) => [nature.slug, nature.label] as const));

  const reset = () => {
    setEditing(null);
    setName('');
    setKind('institution');
    setKeywords('');
    setDefaultNature('');
  };
  const edit = (counterparty: CounterpartyEntry) => {
    setEditing(counterparty.id);
    setName(counterparty.name);
    setKind(counterparty.kind);
    setKeywords(counterparty.keywords.join(', '));
    setDefaultNature(counterparty.defaultNature ?? '');
  };
  const save = async () => {
    const fields = { name, kind, keywords: keywordsOf(keywords), defaultNature: defaultNature || null };
    const ok = editing
      ? await run(editing, () => updateCounterpartyAction(editing, fields))
      : await run('new', () => addCounterpartyAction({ ...fields, note: '' }));
    if (ok) reset();
  };

  return (
    <div className="flex flex-col gap-4">
      <EntryForm
        editing={editing !== null}
        busy={busy === (editing ?? 'new')}
        disabled={busy !== null || name.trim() === ''}
        onSubmit={() => void save()}
        onCancel={reset}
      >
        <div className="grid grid-cols-2 gap-2">
          <TextField id="counterparty-name" label="Cari adı" value={name} onChange={setName} placeholder="URSSAF · Cabinet Muller · SCI Rhin" />
          <FieldShell label="Türü">
            <Select
              value={kind}
              onChange={(next) => setKind(next as CounterpartyKind)}
              options={CounterpartyKindEnum.options.map((option) => ({ value: option, label: COUNTERPARTY_KIND_LABEL[option] }))}
            />
          </FieldShell>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TextField
            id="counterparty-keywords"
            label="Eşleşme kelimeleri"
            aside="virgülle ayırın"
            value={keywords}
            onChange={setKeywords}
            placeholder="URSSAF, DGFIP"
          />
          <FieldShell label="Varsayılan tür">
            <Select
              value={defaultNature}
              onChange={setDefaultNature}
              options={[
                { value: '', label: 'Tür yok' },
                ...natures.filter((nature) => nature.isActive).map((nature) => ({ value: nature.slug, label: nature.label })),
              ]}
            />
          </FieldShell>
        </div>
        <p className="font-ops-body text-ops-xs text-ops-faint">
          Banka satırında kelimelerden biri geçerse satır bu cariye önerilir; cari konunca varsayılan tür de harekete geçer.
        </p>
      </EntryForm>
      <DictionaryList count={counterparties.length} empty="Henüz cari yok.">
        {counterparties.map((counterparty) => (
          <DictionaryRow
            key={counterparty.id}
            label={counterparty.name}
            detail={[
              COUNTERPARTY_KIND_LABEL[counterparty.kind],
              counterparty.keywords.length > 0 ? counterparty.keywords.join(', ') : null,
              counterparty.defaultNature ? `→ ${natureLabel.get(counterparty.defaultNature) ?? counterparty.defaultNature}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            active={counterparty.isActive}
            busy={busy === counterparty.id}
            locked={busy !== null}
            onEdit={() => edit(counterparty)}
            onToggle={() => void run(counterparty.id, () => updateCounterpartyAction(counterparty.id, { isActive: !counterparty.isActive }))}
          />
        ))}
      </DictionaryList>
    </div>
  );
}

// ── Etiketler ─────────────────────────────────────────────────────────────────

interface TagsTabProps {
  tags: DictionaryView['tags'];
  busy: string | null;
  run: Run;
}

function TagsTab({ tags, busy, run }: TagsTabProps) {
  const [label, setLabel] = useState('');

  const add = async () => {
    if (await run('new', () => addTagAction({ label }))) setLabel('');
  };

  return (
    <div className="flex flex-col gap-4">
      <EntryForm editing={false} busy={busy === 'new'} disabled={busy !== null || label.trim() === ''} onSubmit={() => void add()} onCancel={() => setLabel('')}>
        <TextField id="tag-label" label="Etiket adı" value={label} onChange={setLabel} placeholder="Ortak A aracı · Fuar · Yaz kampanyası" />
        <p className="font-ops-body text-ops-xs text-ops-faint">
          Etiket harekete de satırın menüsünden eklenebilir; menüde olmayan ad oradan da oluşturulur.
        </p>
      </EntryForm>
      <DictionaryList count={tags.length} empty="Henüz etiket yok.">
        {tags.map((tag) => (
          <DictionaryRow
            key={tag.slug}
            label={tag.label}
            active={tag.isActive}
            busy={busy === tag.slug}
            locked={busy !== null}
            onToggle={() => void run(tag.slug, () => setTagActiveAction(tag.slug, !tag.isActive))}
          />
        ))}
      </DictionaryList>
    </div>
  );
}

// ── Ortak parçalar ────────────────────────────────────────────────────────────

interface EntryFormProps {
  /** Düzenleme kipinde düğme "Değişikliği kaydet" olur ve "Vazgeç" görünür. */
  editing: boolean;
  busy: boolean;
  disabled: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  children: ReactNode;
}

function EntryForm({ editing, busy, disabled, onSubmit, onCancel, children }: EntryFormProps) {
  return (
    <form
      className="flex flex-col gap-3 rounded-ops-card border border-ops-line bg-ops-surface-sunken p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <div className="flex items-center justify-end gap-2">
        {editing ? (
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            Vazgeç
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={disabled}>
          {busy ? 'Kaydediliyor…' : editing ? 'Değişikliği kaydet' : 'Ekle'}
        </Button>
      </div>
    </form>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  aside?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

function TextField({ id, label, aside, value, onChange, placeholder }: TextFieldProps) {
  return (
    <FieldShell fieldId={id} label={label} labelAside={aside}>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </FieldShell>
  );
}

interface DictionaryListProps {
  count: number;
  empty: string;
  children: ReactNode;
}

function DictionaryList({ count, empty, children }: DictionaryListProps) {
  if (count === 0) return <p className="font-ops-body text-ops-xs text-ops-faint">{empty}</p>;
  return <ul className="flex max-h-[320px] flex-col divide-y divide-ops-line-soft overflow-y-auto rounded-ops-card border border-ops-line">{children}</ul>;
}

interface DictionaryRowProps {
  label: string;
  detail?: string;
  active: boolean;
  busy: boolean;
  /** Başka bir yazım sürüyor — iki yazım aynı anda gitmesin. */
  locked: boolean;
  /** Verilirse "Düzenle" görünür; kayıt üstteki forma dolar. */
  onEdit?: () => void;
  onToggle: () => void;
}

function DictionaryRow({ label, detail, active, busy, locked, onEdit, onToggle }: DictionaryRowProps) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-2">
      <div className="flex min-w-0 flex-col">
        <span className={`truncate font-ops-body text-ops-sm ${active ? 'text-ops-ink' : 'text-ops-faint line-through'}`}>{label}</span>
        {detail ? <span className="truncate font-ops-body text-ops-micro text-ops-faint">{detail}</span> : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {onEdit ? (
          <button
            type="button"
            disabled={locked}
            onClick={onEdit}
            className="cursor-pointer font-ops-body text-ops-xs text-ops-muted underline transition-colors hover:text-ops-ink disabled:cursor-wait disabled:opacity-60"
          >
            Düzenle
          </button>
        ) : null}
        <button
          type="button"
          disabled={locked}
          onClick={onToggle}
          className="cursor-pointer font-ops-body text-ops-xs text-ops-muted underline transition-colors hover:text-ops-ink disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? '…' : active ? 'Pasifleştir' : 'Yeniden aç'}
        </button>
      </div>
    </li>
  );
}
