'use client';

import { useState } from 'react';
import { CounterpartyKindEnum, type CounterpartyKind } from '@lezzet/types';
import { Dialog } from '@/components/operation/ui/dialog';
import { UnderlineTabs } from '@/components/operation/ui/underline-tabs';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import {
  addCounterpartyAction,
  addNatureAction,
  addTagAction,
  setTagActiveAction,
  updateCounterpartyAction,
  updateNatureAction,
} from '@/lib/finance/actions';
import { DictionaryList, EditRow, EmptyRow, NewRow, ReadDetail, ReadText, RowActions, TabBody, ViewRow } from './dictionary-rows';
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

  SATIR FORMUN KENDİSİDİR (12.18 · kullanıcı isteği 14.09: "Düzenle'ye basınca inline edit havası
  olmalı; satır görünümü ile düzenleme formu birbiriyle uyumlu olmalı"). Eskiden her sekmenin tepesinde
  büyük bir ekleme/düzenleme kutusu duruyordu: "Düzenle" o kutuyu dolduruyor, tıklanan satır aşağıda
  değişmeden kalıyordu — neyin düzenlendiği kopuktu ve kutu sekmeye göre pencereyi zıplatıyordu.
  Şimdi yalnız o satır YERİNDE kutulara döner: görünümle aynı ızgara ve sütunlar, metin kutunun
  yazısıyla aynı içerlekte (`READ_INSET`, `dictionary-rows.tsx`) — geçişte yazı kaymaz, yalnız çerçeve belirir. Yeni kayıt
  listenin başındaki "+ Yeni …" satırından, AYNI düzenleyiciyle açılır. Enter kaydeder, Esc vazgeçer
  (pencere açık kalır; ikinci Esc kapatır). Aynı anda tek satır düzenlenir, o sürerken öteki
  satırların eylemleri kilitli: yarım kalan bir düzenleme sessizce başka bir satıra geçmesin.

  Tür satırı TEK satırdır — yön bir seçici (kullanıcı isteği 14.09: "bu formu tek satırda kurgulamak
  mümkün"); kararın iki düğmesi ikondur (✓ kaydet · ✕ vazgeç), adları `title`da.
*/

type DictionaryTab = 'natures' | 'counterparties' | 'tags';
type NatureDirectionKey = keyof typeof NATURE_DIRECTION_LABEL;
/** Sekmelerin ortak yazım kapısı — bekleme anahtarı, hata ve sonuç tek yerde. */
type Run = (key: string, action: () => Promise<{ error: string | null }>) => Promise<boolean>;
type NatureEntry = DictionaryView['natures'][number];
type CounterpartyEntry = DictionaryView['counterparties'][number];

/** Yazımın hatası HANGİ satırın — düzenlenen satırın hatası o satırda, öteki (pasifleştirme) listenin başında. */
interface RunError {
  key: string;
  message: string;
}

const NATURE_DIRECTIONS = ['out', 'in', 'both'] as const satisfies readonly NatureDirectionKey[];
/** Yeni kaydın düzenleme anahtarı — kayıtların anahtarlarıyla (slug · kimlik) çakışmaz. */
const NEW = 'new';
/**
 * Satır şablonları (12.18 · 14.09). TÜR TEK SATIR (kullanıcı isteği: "bu formu tek satırda kurgulamak
 * mümkün; aşağıdaki buton yerine bir selectbox"): ad · yön · hesap kodu · eylemler. Cari iki satırlık
 * ayna: ad · türü / eşleşme kelimeleri · varsayılan tür. Eylem sütunu satır parçalarıyla aynı (130px).
 */
const NATURE_COLUMNS = 'grid-cols-[minmax(0,1fr)_170px_96px_130px]';
const COUNTERPARTY_COLUMNS = 'grid-cols-[minmax(0,1fr)_190px_130px]';

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
  const [error, setError] = useState<RunError | null>(null);

  const run: Run = async (key, action) => {
    setError(null);
    setBusy(key);
    const { error: actionError } = await action();
    setBusy(null);
    if (actionError) {
      setError({ key, message: actionError });
      return false;
    }
    return true;
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Sözlük"
      subtitle="Tür · cari · etiket — silinmez, pasifleşir"
      maxWidth={680}
      // SABİT yükseklik: sekmeler 700 · 774 · 402px arasında gidip geliyordu (ölçüldü 14.09).
      height={620}
      // Sekmeler BAŞLIKTA (ürün penceresinin deseni — `ProductFormTabs`): gövde kaydırılırken kaybolmaz.
      headerAside={
        <UnderlineTabs
          className="flex-none self-end"
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
      }
    >
      {tab === 'natures' ? <NaturesTab natures={dictionary.natures} busy={busy} error={error} run={run} /> : null}
      {tab === 'counterparties' ? (
        <CounterpartiesTab counterparties={dictionary.counterparties} natures={dictionary.natures} busy={busy} error={error} run={run} />
      ) : null}
      {tab === 'tags' ? <TagsTab tags={dictionary.tags} busy={busy} error={error} run={run} /> : null}
    </Dialog>
  );
}

// ── Türler ────────────────────────────────────────────────────────────────────

interface NaturesTabProps {
  natures: DictionaryView['natures'];
  busy: string | null;
  error: RunError | null;
  run: Run;
}

function NaturesTab({ natures, busy, error, run }: NaturesTabProps) {
  /** Düzenlenen satırın anahtarı (`NEW` = yeni tür); `null` → hiçbiri. */
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [direction, setDirection] = useState<NatureDirectionKey>('out');
  const [accountCode, setAccountCode] = useState('');
  const locked = busy !== null || editing !== null;

  const open = (key: string, nature?: NatureEntry) => {
    setEditing(key);
    setLabel(nature?.label ?? '');
    setDirection(nature ? (nature.direction ?? 'both') : 'out');
    setAccountCode(nature?.accountCode ?? '');
  };
  const save = async () => {
    if (editing === null) return;
    const fields = { label, direction: direction === 'both' ? null : direction, accountCode };
    const key = editing;
    const ok = key === NEW ? await run(NEW, () => addNatureAction(fields)) : await run(key, () => updateNatureAction(key, fields));
    if (ok) setEditing(null);
  };

  const editor = (key: string) => (
    <EditRow
      key={key}
      columns={NATURE_COLUMNS}
      isNew={key === NEW}
      busy={busy === key}
      disabled={busy !== null || label.trim() === ''}
      error={error?.key === key ? error.message : null}
      onSubmit={() => void save()}
      onCancel={() => setEditing(null)}
      first={
        <Input
          inputSize="sm"
          autoFocus
          aria-label="Tür adı"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Tür adı — ör. Sigorta"
        />
      }
      aside={
        <Select
          size="sm"
          ariaLabel="Türün yönü"
          value={direction}
          onChange={(next) => setDirection(next as NatureDirectionKey)}
          options={NATURE_DIRECTIONS.map((value) => ({ value, label: NATURE_DIRECTION_LABEL[value] }))}
        />
      }
      extra={
        <Input
          inputSize="sm"
          mono
          aria-label="Hesap kodu (PCG)"
          value={accountCode}
          onChange={(event) => setAccountCode(event.target.value)}
          placeholder="Hesap kodu"
        />
      }
    />
  );

  return (
    <TabBody
      hint="Yön, türün hangi hareketlere konabileceğini söyler; hesap kodu (PCG) muhasebecinin dökümüne gider."
      error={error !== null && error.key !== editing ? error.message : null}
    >
      <DictionaryList>
        {editing === NEW ? editor(NEW) : <NewRow label="+ Yeni tür" disabled={locked} onClick={() => open(NEW)} />}
        {natures.length === 0 ? <EmptyRow text="Sözlükte tür yok." /> : null}
        {natures.map((nature) =>
          editing === nature.slug ? (
            editor(nature.slug)
          ) : (
            <ViewRow
              key={nature.slug}
              columns={NATURE_COLUMNS}
              first={<ReadText active={nature.isActive}>{nature.label}</ReadText>}
              aside={
                <ReadText active={nature.isActive} secondary>
                  {NATURE_DIRECTION_LABEL[nature.direction ?? 'both']}
                </ReadText>
              }
              extra={
                <ReadText active={nature.isActive} secondary mono>
                  {nature.accountCode ?? ''}
                </ReadText>
              }
              actions={
                <RowActions
                  active={nature.isActive}
                  busy={busy === nature.slug}
                  locked={locked}
                  onEdit={() => open(nature.slug, nature)}
                  onToggle={() => void run(nature.slug, () => updateNatureAction(nature.slug, { isActive: !nature.isActive }))}
                />
              }
            />
          ),
        )}
      </DictionaryList>
    </TabBody>
  );
}

// ── Cariler ───────────────────────────────────────────────────────────────────

interface CounterpartiesTabProps {
  counterparties: DictionaryView['counterparties'];
  natures: DictionaryView['natures'];
  busy: string | null;
  error: RunError | null;
  run: Run;
}

function CounterpartiesTab({ counterparties, natures, busy, error, run }: CounterpartiesTabProps) {
  /** Düzenlenen satırın anahtarı (`NEW` = yeni cari); `null` → hiçbiri. */
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CounterpartyKind>('institution');
  const [keywords, setKeywords] = useState('');
  const [defaultNature, setDefaultNature] = useState('');
  const natureLabel = new Map(natures.map((nature) => [nature.slug, nature.label] as const));
  const locked = busy !== null || editing !== null;

  const open = (key: string, counterparty?: CounterpartyEntry) => {
    setEditing(key);
    setName(counterparty?.name ?? '');
    setKind(counterparty?.kind ?? 'institution');
    setKeywords(counterparty?.keywords.join(', ') ?? '');
    setDefaultNature(counterparty?.defaultNature ?? '');
  };
  const save = async () => {
    if (editing === null) return;
    const fields = { name, kind, keywords: keywordsOf(keywords), defaultNature: defaultNature || null };
    const key = editing;
    const ok =
      key === NEW
        ? await run(NEW, () => addCounterpartyAction({ ...fields, note: '' }))
        : await run(key, () => updateCounterpartyAction(key, fields));
    if (ok) setEditing(null);
  };

  const editor = (key: string) => (
    <EditRow
      key={key}
      columns={COUNTERPARTY_COLUMNS}
      isNew={key === NEW}
      busy={busy === key}
      disabled={busy !== null || name.trim() === ''}
      error={error?.key === key ? error.message : null}
      onSubmit={() => void save()}
      onCancel={() => setEditing(null)}
      first={
        <Input
          inputSize="sm"
          autoFocus
          aria-label="Cari adı"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Cari adı — URSSAF · Cabinet Muller"
        />
      }
      aside={
        <Select
          size="sm"
          ariaLabel="Türü"
          value={kind}
          onChange={(next) => setKind(next as CounterpartyKind)}
          options={CounterpartyKindEnum.options.map((option) => ({ value: option, label: COUNTERPARTY_KIND_LABEL[option] }))}
        />
      }
      second={
        <Input
          inputSize="sm"
          aria-label="Eşleşme kelimeleri"
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
          placeholder="Eşleşme kelimeleri (virgülle)"
        />
      }
      asideSecond={
        <Select
          size="sm"
          ariaLabel="Varsayılan tür"
          value={defaultNature}
          onChange={setDefaultNature}
          options={[
            { value: '', label: 'Varsayılan tür yok' },
            // Pasifleşmiş tür yeni kayda verilmez — ama carinin ZATEN taşıdığı pasif tür listede kalır,
            // yoksa kutu boş görünür ve kaydetmek onu sessizce silerdi.
            ...natures
              .filter((nature) => nature.isActive || nature.slug === defaultNature)
              .map((nature) => ({ value: nature.slug, label: nature.label })),
          ]}
        />
      }
    />
  );

  return (
    <TabBody
      hint="Banka satırında eşleşme kelimelerinden biri geçerse satır bu cariye önerilir; cari konunca varsayılan türü de harekete geçer."
      error={error !== null && error.key !== editing ? error.message : null}
    >
      <DictionaryList>
        {editing === NEW ? editor(NEW) : <NewRow label="+ Yeni cari" disabled={locked} onClick={() => open(NEW)} />}
        {counterparties.length === 0 ? <EmptyRow text="Henüz cari yok." /> : null}
        {counterparties.map((counterparty) =>
          editing === counterparty.id ? (
            editor(counterparty.id)
          ) : (
            <ViewRow
              key={counterparty.id}
              columns={COUNTERPARTY_COLUMNS}
              first={<ReadText active={counterparty.isActive}>{counterparty.name}</ReadText>}
              aside={
                <ReadText active={counterparty.isActive} secondary>
                  {COUNTERPARTY_KIND_LABEL[counterparty.kind]}
                </ReadText>
              }
              second={<ReadDetail>{counterparty.keywords.length > 0 ? counterparty.keywords.join(', ') : 'eşleşme kelimesi yok'}</ReadDetail>}
              asideSecond={
                <ReadDetail>
                  {counterparty.defaultNature
                    ? `→ ${natureLabel.get(counterparty.defaultNature) ?? counterparty.defaultNature}`
                    : 'varsayılan tür yok'}
                </ReadDetail>
              }
              actions={
                <RowActions
                  active={counterparty.isActive}
                  busy={busy === counterparty.id}
                  locked={locked}
                  onEdit={() => open(counterparty.id, counterparty)}
                  onToggle={() =>
                    void run(counterparty.id, () => updateCounterpartyAction(counterparty.id, { isActive: !counterparty.isActive }))
                  }
                />
              }
            />
          ),
        )}
      </DictionaryList>
    </TabBody>
  );
}

// ── Etiketler ─────────────────────────────────────────────────────────────────

interface TagsTabProps {
  tags: DictionaryView['tags'];
  busy: string | null;
  error: RunError | null;
  run: Run;
}

function TagsTab({ tags, busy, error, run }: TagsTabProps) {
  // Etiketin adı düzenlenmez (kapısı yok — ad, etiketin anahtarını da üretiyor); yalnız eklenir ve pasifleşir.
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const locked = busy !== null || adding;

  const add = async () => {
    if (await run(NEW, () => addTagAction({ label }))) {
      setAdding(false);
      setLabel('');
    }
  };

  return (
    <TabBody
      hint="Etiket izah değildir, süzmek içindir. Harekete satırın menüsünden de eklenir; menüde olmayan ad oradan oluşturulur."
      error={error !== null && !(adding && error.key === NEW) ? error.message : null}
    >
      <DictionaryList>
        {adding ? (
          <EditRow
            isNew
            busy={busy === NEW}
            disabled={busy !== null || label.trim() === ''}
            error={error?.key === NEW ? error.message : null}
            onSubmit={() => void add()}
            onCancel={() => {
              setAdding(false);
              setLabel('');
            }}
            first={
              <Input
                inputSize="sm"
                autoFocus
                aria-label="Etiket adı"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Etiket adı — Ortak A aracı · Fuar · Yaz kampanyası"
              />
            }
          />
        ) : (
          <NewRow label="+ Yeni etiket" disabled={locked} onClick={() => setAdding(true)} />
        )}
        {tags.length === 0 ? <EmptyRow text="Henüz etiket yok." /> : null}
        {tags.map((tag) => (
          <ViewRow
            key={tag.slug}
            first={<ReadText active={tag.isActive}>{tag.label}</ReadText>}
            actions={
              <RowActions
                active={tag.isActive}
                busy={busy === tag.slug}
                locked={locked}
                onToggle={() => void run(tag.slug, () => setTagActiveAction(tag.slug, !tag.isActive))}
              />
            }
          />
        ))}
      </DictionaryList>
    </TabBody>
  );
}
