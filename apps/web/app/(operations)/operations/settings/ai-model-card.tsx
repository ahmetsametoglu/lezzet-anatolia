'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AiModelCatalogEntry } from '@lezzet/application/ai/models';
import type { AiModelPrices, AiProvider, AiTier } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { AnchoredMenu } from '@/components/operation/ui/anchored-menu';
import { decimal } from '@/components/operation/ui/format';
import { AlertIcon } from '@/components/operation/ui/icons';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { JoinedField, JoinedSuffix } from '@/components/operation/form/joined-field';
import { triggerClass } from '@/components/operation/form/trigger';
import { resetAiModelAction, saveAiModelAction } from './ai-model-actions';
import type { AiModelPanelData, AiModelTierView } from './ai-model-read';
import { DialogError, SettingsCard, pressable } from './settings-sections';

const PROVIDER_LABEL: Record<AiProvider, string> = { anthropic: 'Anthropic', google: 'Google' };

const TIER_COPY: Record<AiTier, { label: string; help: string; impact: string }> = {
  standard: {
    label: 'Yazan model',
    help: 'Destek taslağı, otomatik cevap, ürün metni önerisi ve analitik yorum.',
    impact:
      'Geniş etkili: bundan sonraki bütün destek taslakları, otomatik cevaplar ve ürün metinleri bu modelle yazılır. Değişiklik en geç bir dakikada bütün süreçlere geçer.',
  },
  cheap: {
    label: 'Hacimli işler modeli',
    help: 'Çeviri, ses kaydı çözümü, B2B özeti ve banka dosyası okuma; çok tekrarlanır, ucuz ve hızlı olmalı.',
    impact:
      'Geniş etkili: bundan sonraki bütün çeviriler ve ses çözümleri bu modelle yapılır. Değişiklik en geç bir dakikada bütün süreçlere geçer.',
  },
};

const NO_TARIFF_NOTE = 'Tarifesi yok: kullanım defterinde maliyet "bilinmiyor" yazılır.';

function tariffOf(prices: AiModelPrices | null, model: string): string | null {
  const rate = prices?.[model];
  return rate ? `${decimal(rate.inputPerMillion)} $ / ${decimal(rate.outputPerMillion)} $` : null;
}

interface AiModelCardProps {
  data: AiModelPanelData;
}

/** Yapay zekâ modelinin iki katmanı; seçim penceresi sağlayıcının canlı listesini ve kullanım tarifesini gösterir. */
export function AiModelCard({ data }: AiModelCardProps) {
  const [editing, setEditing] = useState<AiModelTierView | null>(null);

  return (
    <SettingsCard
      title="Yapay zekâ modeli"
      count={data.tiers.length}
      hint="Liste sağlayıcılardan canlı okunur; yalnız anahtarı Bağlantılar'da tanımlı sağlayıcının modelleri seçilebilir."
    >
      {data.tiers.map((view) => (
        <TierRow key={view.tier} view={view} prices={data.prices} onOpen={() => setEditing(view)} />
      ))}
      {editing ? <AiModelDialog view={editing} data={data} onClose={() => setEditing(null)} /> : null}
    </SettingsCard>
  );
}

interface TierRowProps {
  view: AiModelTierView;
  prices: AiModelPrices | null;
  onOpen: () => void;
}

function TierRow({ view, prices, onOpen }: TierRowProps) {
  const copy = TIER_COPY[view.tier];
  const tariff = view.current ? tariffOf(prices, view.current.model) : null;
  return (
    <div
      {...pressable(onOpen)}
      className="flex cursor-pointer items-center gap-3.5 border-t border-ops-line-soft px-4 py-2.5 transition-colors hover:bg-ops-subtle"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-ops-body text-ops-base font-semibold text-ops-ink">{copy.label}</span>
        <span className="font-ops-body text-ops-xs leading-[1.45] text-ops-body">{copy.help}</span>
        {view.problem ? <span className="font-ops-body text-ops-xs font-medium text-ops-amber-dark">{view.problem}</span> : null}
        {view.current && prices && !tariff ? (
          <span className="font-ops-body text-ops-xs font-medium text-ops-amber-dark">{NO_TARIFF_NOTE}</span>
        ) : null}
      </div>
      <div className="flex max-w-[48%] flex-none flex-col items-end gap-0.5 text-right">
        {view.current ? (
          <>
            <span className="font-ops-body text-ops-sm font-semibold text-ops-ink">{view.current.name}</span>
            <span className="font-ops-body text-ops-micro text-ops-faint">
              {PROVIDER_LABEL[view.current.provider]} · {tariff ?? 'tarife yok'}
            </span>
          </>
        ) : (
          <span className="font-ops-body text-ops-sm font-semibold text-ops-amber">Tanımlı değil</span>
        )}
      </div>
    </div>
  );
}

interface AiModelDialogProps {
  view: AiModelTierView;
  data: AiModelPanelData;
  onClose: () => void;
}

function AiModelDialog({ view, data, onClose }: AiModelDialogProps) {
  const router = useRouter();
  const copy = TIER_COPY[view.tier];
  const [selected, setSelected] = useState(view.current ? { provider: view.current.provider, model: view.current.model } : null);
  const [priceInput, setPriceInput] = useState('');
  const [priceOutput, setPriceOutput] = useState('');
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = data.catalog.flatMap((entry) =>
    entry.status === 'ok' ? entry.models.map((m) => ({ ...m, provider: entry.provider })) : [],
  );
  const selectedName = selected
    ? (options.find((option) => option.id === selected.model)?.name ?? view.current?.name ?? selected.model)
    : null;
  const tariff = selected ? tariffOf(data.prices, selected.model) : null;
  const askTariff = selected !== null && data.prices !== null && tariff === null;
  const changed = selected !== null && (selected.model !== view.current?.model || selected.provider !== view.current?.provider);
  const typedPrice = priceInput.trim() !== '' || priceOutput.trim() !== '';

  const run = async (kind: 'save' | 'reset') => {
    setBusy(kind);
    setError(null);
    const result =
      kind === 'save' && selected
        ? await saveAiModelAction({
            tier: view.tier,
            ...selected,
            price: { input: askTariff ? priceInput : '', output: askTariff ? priceOutput : '' },
          })
        : await resetAiModelAction({ tier: view.tier });
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
    router.refresh();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={500}
      title={copy.label}
      subtitle={copy.help}
      footer={
        <>
          <Button
            variant="secondary"
            loading={busy === 'reset'}
            disabled={busy !== null || !view.current?.chosen}
            onClick={() => void run('reset')}
          >
            Varsayılana dön
          </Button>
          <Button
            variant="primary"
            className="ml-auto"
            loading={busy === 'save'}
            disabled={busy !== null || selected === null || (!changed && !typedPrice)}
            onClick={() => void run('save')}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <FieldShell label="Model">
          <ModelPicker
            catalog={data.catalog}
            prices={data.prices}
            selected={selected}
            selectedName={selectedName}
            onPick={(next) => {
              setSelected(next);
              setPriceInput('');
              setPriceOutput('');
            }}
            disabled={options.length === 0 || busy !== null}
          />
        </FieldShell>
        <CatalogProblems catalog={data.catalog} />

        {selected ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 rounded-[9px] border border-ops-line bg-ops-subtle px-3.5 py-2.5">
            <dt className="font-ops-body text-ops-micro font-medium text-ops-faint">Model kimliği</dt>
            <dd className="font-ops-mono text-ops-xs font-medium text-ops-ink">{selected.model}</dd>
            <dt className="font-ops-body text-ops-micro font-medium text-ops-faint">Sağlayıcı</dt>
            <dd className="font-ops-body text-ops-xs font-medium text-ops-ink">{PROVIDER_LABEL[selected.provider]}</dd>
            <dt className="font-ops-body text-ops-micro font-medium text-ops-faint">Tarife</dt>
            <dd className={`font-ops-mono text-ops-xs font-medium ${tariff ? 'text-ops-ink' : 'text-ops-amber-dark'}`}>
              {data.prices === null ? 'okunamadı' : tariff ? `${tariff} (girdi / çıktı, milyon jeton)` : 'yok'}
            </dd>
          </dl>
        ) : null}

        {askTariff ? (
          <div className="flex flex-col gap-1.5">
            <span className="font-ops-body text-ops-xs font-medium text-ops-body">Tarife — milyon jeton başına USD</span>
            <div className="flex gap-2.5">
              <PriceBox label="Girdi" value={priceInput} onChange={setPriceInput} />
              <PriceBox label="Çıktı" value={priceOutput} onChange={setPriceOutput} />
            </div>
            <span className="font-ops-body text-ops-micro text-ops-faint">
              Sağlayıcının fiyat sayfasındaki değer. Boş kalırsa kullanım defterinde maliyet &quot;bilinmiyor&quot; yazılır.
            </span>
          </div>
        ) : null}

        <div className="flex items-start gap-2.5 rounded-[9px] border border-ops-amber-line bg-ops-amber-bg px-3.5 py-3 text-ops-amber-dark">
          <span className="mt-px flex-none">
            <AlertIcon size={16} />
          </span>
          <span className="font-ops-body text-ops-xs font-medium leading-[1.5]">{copy.impact}</span>
        </div>
        <DialogError error={error} />
      </div>
    </Dialog>
  );
}

interface PriceBoxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function PriceBox({ label, value, onChange }: PriceBoxProps) {
  return (
    <JoinedField className="flex-1">
      <span className="flex flex-none items-center pl-[11px] font-ops-body text-ops-micro text-ops-faint">{label}</span>
      <Input
        bare
        mono
        inputMode="decimal"
        placeholder="—"
        aria-label={`${label} fiyatı`}
        className="text-right"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <JoinedSuffix>$</JoinedSuffix>
    </JoinedField>
  );
}

/** Listesi okunamayan sağlayıcının sebebi; okunabilen sağlayıcının modelleri yine seçilebilir. */
function CatalogProblems({ catalog }: { catalog: AiModelCatalogEntry[] }) {
  if (catalog.length === 0) {
    return (
      <span className="font-ops-body text-ops-xs font-medium text-ops-amber-dark">
        Bağlantılar&apos;da yapay zekâ anahtarı yok; model seçilemez.
      </span>
    );
  }
  return catalog.map((entry) =>
    entry.status === 'ok' ? null : (
      <span key={entry.provider} className="font-ops-body text-ops-xs font-medium text-ops-amber-dark">
        {PROVIDER_LABEL[entry.provider]} listesi {entry.status === 'rejected' ? 'anahtarı reddetti' : 'okunamadı'}: {entry.detail}
      </span>
    ),
  );
}

interface ModelPickerProps {
  catalog: AiModelCatalogEntry[];
  prices: AiModelPrices | null;
  selected: { provider: AiProvider; model: string } | null;
  selectedName: string | null;
  onPick: (choice: { provider: AiProvider; model: string }) => void;
  disabled: boolean;
}

/** Sağlayıcıya göre gruplu liste; her modelin yanında kimliği ve kullanım tarifesi durur ki fiyat seçerken görülsün. */
function ModelPicker({ catalog, prices, selected, selectedName, onPick, disabled }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={anchorRef}>
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className={triggerClass({ variant: 'field', open, filled: selected !== null, disabled })}
      >
        <span className="flex min-w-0 flex-1 items-baseline gap-2.5 truncate text-left">
          <span className="font-ops-body text-ops-base font-semibold text-ops-ink">{selectedName ?? 'Seçin'}</span>
          {selected ? <span className="font-ops-body text-ops-xs text-ops-faint">{PROVIDER_LABEL[selected.provider]}</span> : null}
        </span>
        <span className="flex-none text-ops-faint">{open ? '▴' : '▾'}</span>
      </button>
      <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} className="max-h-72 overflow-y-auto">
        <div role="listbox">
          {catalog.map((entry) =>
            entry.status === 'ok' ? (
              <div key={entry.provider}>
                <div className="border-t border-ops-line-soft bg-ops-subtle px-[13px] pb-1 pt-2 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-faint first:border-t-0">
                  {PROVIDER_LABEL[entry.provider]}
                </div>
                {entry.models.map((option) => {
                  const on = selected?.provider === entry.provider && selected.model === option.id;
                  const tariff = tariffOf(prices, option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => {
                        onPick({ provider: entry.provider, model: option.id });
                        setOpen(false);
                      }}
                      className={[
                        'flex w-full cursor-pointer items-baseline gap-2.5 px-[13px] py-2 text-left transition-colors',
                        on ? 'bg-ops-olive-bg' : 'hover:bg-ops-subtle',
                      ].join(' ')}
                    >
                      <span className="flex-none whitespace-nowrap font-ops-body text-ops-base font-semibold text-ops-ink">
                        {option.name}
                      </span>
                      <span className="min-w-0 truncate font-ops-mono text-ops-micro text-ops-faint">{option.id}</span>
                      <span
                        className={`ml-auto flex-none font-ops-mono text-ops-micro font-medium ${tariff ? 'text-ops-strong' : 'text-ops-amber-dark'}`}
                      >
                        {tariff ?? 'tarife yok'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null,
          )}
        </div>
      </AnchoredMenu>
    </div>
  );
}
