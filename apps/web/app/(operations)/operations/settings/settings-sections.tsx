'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { cutoffBelongsToPreviousDay, ORDER_CUTOFF_KEY, PREP_CUTOFF_KEY } from '@lezzet/domain-core';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { cardClass } from '@/components/operation/ui/card';
import { num, shortDateTime } from '@/components/operation/ui/format';
import type { SettingValue } from './settings-catalog';
import type { SectionRowsView, SettingRowView, StaffRowView } from './settings-types';
import type { SetupJobView } from './setup-job';

// Ayarlar ekranının kart parçaları; sekme görünümü ve arama sonucu aynı satırı çizer ki "istisnalı" işareti bir yerde eksik kalmasın.

/** Satır bir düğme gibi davranır: tıklama ile Enter/Boşluk aynı işi yapar. */
export function pressable(onPress: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onPress,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPress();
      }
    },
  };
}

/** İki sütunlu kart ızgarası; sütunlar yukarıdan aşağı dolar ve kart ortadan bölünmez. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="columns-2 gap-x-3.5">{children}</div>;
}

interface GridCellProps {
  /** İki sütunu birden kaplayan kart (saat akışı, güven puanı, vitrin görselleri). */
  wide?: boolean;
  children: ReactNode;
}

export function GridCell({ wide = false, children }: GridCellProps) {
  return <div className={['break-inside-avoid pb-3.5', wide ? '[column-span:all]' : ''].join(' ')}>{children}</div>;
}

interface SettingsCardProps {
  title: string;
  count?: string | number;
  /** Kartın bütününe dair tek cümle. */
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SettingsCard({ title, count, hint, action, children }: SettingsCardProps) {
  return (
    <section className={cardClass('flex flex-col')}>
      <header className="flex min-h-[44px] items-center gap-2 bg-ops-subtle px-4 py-1.5">
        <h3 className="font-ops-display text-ops-base font-semibold text-ops-ink">{title}</h3>
        {count !== undefined ? (
          <span className="rounded-full bg-ops-line px-1.5 py-px font-ops-mono text-ops-micro text-ops-body">{count}</span>
        ) : null}
        {action ? <span className="ml-auto flex items-center">{action}</span> : null}
      </header>
      {hint ? <p className="border-t border-ops-line-soft px-4 py-2.5 font-ops-body text-ops-xs leading-[1.5] text-ops-body">{hint}</p> : null}
      {children}
    </section>
  );
}

interface CardLineProps {
  label: string;
  children: ReactNode;
}

/** Kartın etiketli satırı: solda sabit genişlikte etiket, sağda değer. */
export function CardLine({ label, children }: CardLineProps) {
  return (
    <div className="flex items-center gap-3 border-t border-ops-line-soft px-4 py-2.5">
      <span className="w-[110px] flex-none font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-body">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

interface CardItemProps {
  title: string;
  /** Başlığın altındaki durum cümlesi. */
  detail: ReactNode;
  action: ReactNode;
}

/** Eşlenen kaydın satırı: adı, eşlemenin durumu ve düzenleme düğmesi. */
export function CardItem({ title, detail, action }: CardItemProps) {
  return (
    <div className="flex items-center gap-3 border-t border-ops-line-soft px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-ops-body text-ops-base font-semibold text-ops-ink">{title}</span>
        <span className="font-ops-body text-ops-xs text-ops-body">{detail}</span>
      </div>
      {action}
    </div>
  );
}

interface JobTextProps {
  job: SetupJobView | null;
  children?: ReactNode;
}

/** Tur hiç koşmadıysa bunu söyler: "kayıt yok" ile "sorun yok" aynı şey değildir. */
export function JobText({ job, children }: JobTextProps) {
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

interface DialogErrorProps {
  error: string | null;
}

/** Kurulum penceresinin ret cümlesi; pencere açık kalır ki operatör düzeltsin. */
export function DialogError({ error }: DialogErrorProps) {
  return error ? <span className="font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null;
}

interface SectionGridProps {
  sections: SectionRowsView[];
  /** Arama ya da süzgeç sonucu: her kart düz satır listesi olarak çizilir, çünkü akış ve çift yarım kalır. */
  flat: boolean;
  onOpen: (row: SettingRowView) => void;
}

export function SectionGrid({ sections, flat, onOpen }: SectionGridProps) {
  return (
    <CardGrid>
      {sections.map(({ section, rows }) => {
        const layout = flat ? 'rows' : section.layout;
        return (
          <GridCell key={section.key} wide={layout !== 'rows'}>
            <SettingsCard title={section.label} count={rows.length} hint={flat ? undefined : section.hint}>
              {layout === 'dayHours' ? (
                <DayHours rows={rows} onOpen={onOpen} />
              ) : layout === 'trust' ? (
                <TrustWeights rows={rows} onOpen={onOpen} />
              ) : (
                rows.map((row) => <SettingRow key={row.key} row={row} onOpen={onOpen} />)
              )}
            </SettingsCard>
          </GridCell>
        );
      })}
    </CardGrid>
  );
}

interface RowProps {
  row: SettingRowView;
  onOpen: (row: SettingRowView) => void;
}

function SettingRow({ row, onOpen }: RowProps) {
  return (
    <div
      {...pressable(() => onOpen(row))}
      className="flex cursor-pointer items-center gap-3.5 border-t border-ops-line-soft px-4 py-2.5 transition-colors hover:bg-ops-subtle"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <RowTitle row={row} />
        <span className="line-clamp-2 font-ops-body text-ops-xs leading-[1.45] text-ops-body">{row.help}</span>
        <ExceptionLine row={row} />
        {row.unset && row.unsetNote ? <span className="font-ops-body text-ops-xs text-ops-amber">{row.unsetNote}</span> : null}
      </div>
      <div className="flex max-w-[48%] flex-none flex-col items-end gap-0.5 text-right">
        <ValueView row={row} />
        <DefaultNote row={row} />
      </div>
    </div>
  );
}

function RowTitle({ row }: { row: SettingRowView }) {
  return (
    <span className="flex items-center gap-2">
      <span className="font-ops-body text-ops-base font-semibold text-ops-ink">{row.label}</span>
      {row.exceptions.length > 0 ? <Badge tone="amber">istisnalı</Badge> : null}
    </span>
  );
}

/** İstisna ayrı renkte yazılır: "genel değer bu ama her yerde geçerli değil" uyarısı değerle aynı tonda gözden kaçar. */
function ExceptionLine({ row }: { row: SettingRowView }) {
  if (row.exceptions.length === 0) return null;
  return (
    <span className="font-ops-body text-ops-xs text-ops-amber">{row.exceptions.map((e) => `${e.scopeLabel} → ${e.display}`).join(' · ')}</span>
  );
}

/** Fabrika değeri yalnız değiştirilmişken yazılır; her satırda yazılsa gerçekten değişmiş olan görünmez olurdu. */
function DefaultNote({ row }: { row: SettingRowView }) {
  if (!row.changed) return null;
  return <span className="font-ops-body text-ops-micro text-ops-faint">varsayılan {row.fallbackDisplay}</span>;
}

const TEXT_KINDS = new Set<SettingRowView['kind']>(['account', 'text', 'channelFlags', 'choice']);

function ValueView({ row }: { row: SettingRowView }) {
  if (row.kind === 'boolean') {
    const on = row.value === true;
    return (
      <span className={['flex items-center gap-1.5 font-ops-body text-ops-sm font-semibold', on ? 'text-ops-olive-dark' : 'text-ops-muted'].join(' ')}>
        <span aria-hidden className={['h-[7px] w-[7px] rounded-full', on ? 'bg-ops-olive' : 'bg-ops-faint'].join(' ')} />
        {row.display}
      </span>
    );
  }
  if (row.kind === 'choice' && row.choices && row.choices.length <= 3) {
    return <ChoiceStrip choices={row.choices} value={String(row.value)} />;
  }
  return (
    <span
      className={[
        TEXT_KINDS.has(row.kind) ? 'font-ops-body text-ops-sm font-semibold' : 'font-ops-mono text-ops-base',
        row.unset ? 'text-ops-amber' : 'text-ops-ink',
      ].join(' ')}
    >
      {row.display}
    </span>
  );
}

/** Seçenekli ayarın salt okunur göstergesi; değişiklik pencereden yapılır, çünkü geniş etkili ayarın uyarısı orada. */
function ChoiceStrip({ choices, value }: { choices: readonly { value: string; label: string }[]; value: string }) {
  return (
    <span className="flex overflow-hidden rounded-ops-btn border border-ops-line-strong">
      {choices.map((c) => (
        <span
          key={c.value}
          className={['px-2.5 py-1 font-ops-display text-ops-xs font-semibold', c.value === value ? 'bg-ops-ink text-ops-card' : 'text-ops-body'].join(' ')}
        >
          {c.label}
        </span>
      ))}
    </span>
  );
}

/**
 * Günün dört eşiği akış sırasıyla. Kesim hazırlık kapanışından sonraysa önceki güne aittir; akış o noktada kesik çizgiyle gün
 * değiştirir.
 */
function DayHours({ rows, onOpen }: { rows: SettingRowView[]; onOpen: (row: SettingRowView) => void }) {
  const valueOf = (key: string) => String(rows.find((r) => r.key === key)?.value ?? '');
  const previousDay = cutoffBelongsToPreviousDay(valueOf(ORDER_CUTOFF_KEY), valueOf(PREP_CUTOFF_KEY));
  const tagOf = (key: string): string | null => {
    if (key === ORDER_CUTOFF_KEY) return previousDay ? 'önceki gün' : 'teslim günü';
    return key === PREP_CUTOFF_KEY && previousDay ? 'teslim günü' : null;
  };

  return (
    <div className="grid grid-cols-4 border-t border-ops-line-soft">
      {rows.map((row, i) => {
        const tag = tagOf(row.key);
        return (
          <div
            key={row.key}
            {...pressable(() => onOpen(row))}
            className="flex min-w-0 cursor-pointer flex-col gap-0.5 py-3.5 pl-4 transition-colors hover:bg-ops-subtle"
          >
            <span className="mb-2 flex h-3 items-center">
              <span aria-hidden className="h-[9px] w-[9px] flex-none rounded-full bg-ops-olive" />
              {tag ? (
                <span className="ml-2 flex-none font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-body">{tag}</span>
              ) : null}
              {i < rows.length - 1 ? (
                <span
                  aria-hidden
                  className={['ml-2 flex-1 border-t-2 border-ops-line', row.key === ORDER_CUTOFF_KEY && previousDay ? 'border-dashed' : ''].join(' ')}
                />
              ) : null}
            </span>
            <span className="font-ops-mono text-ops-title text-ops-ink">{row.display}</span>
            <RowTitle row={row} />
            <span className="line-clamp-3 pr-4 font-ops-body text-ops-xs leading-[1.45] text-ops-body">{row.help}</span>
            <ExceptionLine row={row} />
            <DefaultNote row={row} />
          </div>
        );
      })}
    </div>
  );
}

/** Güven ağırlıkları ödül ve ceza olarak iki sütunda; satır açıklaması hepsinde aynı olduğu için sütun başında bir kez yazılır. */
function TrustWeights({ rows, onOpen }: { rows: SettingRowView[]; onOpen: (row: SettingRowView) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 border-t border-ops-line-soft">
        <WeightColumn
          title="Puan ekler"
          tone="text-ops-olive-dark"
          rows={rows.filter((r) => r.polarity === 'reward')}
          onOpen={onOpen}
          className="border-r border-ops-line-soft"
        />
        <WeightColumn title="Puan düşer" tone="text-ops-red" rows={rows.filter((r) => r.polarity === 'penalty')} onOpen={onOpen} />
      </div>
      {rows
        .filter((r) => r.polarity === undefined)
        .map((row) => (
          <SettingRow key={row.key} row={row} onOpen={onOpen} />
        ))}
    </>
  );
}

interface WeightColumnProps {
  title: string;
  tone: string;
  rows: SettingRowView[];
  onOpen: (row: SettingRowView) => void;
  className?: string;
}

function WeightColumn({ title, tone, rows, onOpen, className }: WeightColumnProps) {
  return (
    <div className={['flex min-w-0 flex-col', className].filter(Boolean).join(' ')}>
      <div className="flex items-baseline gap-2 px-4 pb-2 pt-2.5">
        <span className={`font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] ${tone}`}>{title}</span>
        <span className="font-ops-body text-ops-xs text-ops-body">0 yazılırsa sayılmaz</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          {...pressable(() => onOpen(row))}
          className="flex cursor-pointer items-baseline gap-3 border-t border-ops-line-soft px-4 py-2 transition-colors hover:bg-ops-subtle"
        >
          <span className="min-w-0 flex-1 font-ops-body text-ops-base text-ops-ink">{row.label}</span>
          <DefaultNote row={row} />
          <span className={['font-ops-mono text-ops-base', weightTone(row.value)].join(' ')}>{signedWeight(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Ağırlığın işareti ekranda da yazılır: ödül ile ceza aynı sayıyla karışmasın. */
function signedWeight(value: SettingValue): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (n === 0) return '0';
  return n > 0 ? `+${num(n)}` : `−${num(-n)}`;
}

function weightTone(value: SettingValue): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 'text-ops-faint';
  return n > 0 ? 'text-ops-olive-dark' : 'text-ops-red';
}

interface StaffCardProps {
  staff: StaffRowView[];
  onNew: () => void;
  onOpen: (row: StaffRowView) => void;
}

export function StaffCard({ staff, onNew, onOpen }: StaffCardProps) {
  return (
    <SettingsCard
      title="Kullanıcı & rol"
      count={staff.length}
      hint="Roller sabit kalıptır: depo fiyat görmez, kurye yalnız kendi teslimatını görür. Burada rol atanır, izin detayı icat edilmez."
      action={
        <Button variant="dark" size="sm" onClick={onNew}>
          + Kullanıcı
        </Button>
      }
    >
      {staff.map((s) => (
        <StaffRow key={s.id} row={s} onOpen={onOpen} />
      ))}
    </SettingsCard>
  );
}

/** Avatar zemini kimlikten TÜRETİLİR: rastgele olsaydı aynı kişi her yüklemede başka renkte olurdu. */
const AVATAR_TONES = ['bg-ops-olive', 'bg-ops-blue', 'bg-ops-slate', 'bg-ops-amber'] as const;

function avatarTone(id: string): string {
  let sum = 0;
  for (const ch of id) sum = (sum + ch.charCodeAt(0)) % 997;
  return AVATAR_TONES[sum % AVATAR_TONES.length]!;
}

function StaffRow({ row, onOpen }: { row: StaffRowView; onOpen: (row: StaffRowView) => void }) {
  return (
    <div
      {...pressable(() => onOpen(row))}
      className="flex cursor-pointer items-center gap-3 border-t border-ops-line-soft px-4 py-2.5 transition-colors hover:bg-ops-subtle"
    >
      <span
        aria-hidden
        className={['grid h-8 w-8 flex-none place-items-center rounded-full font-ops-display text-ops-xs font-semibold text-ops-card', avatarTone(row.id)].join(' ')}
      >
        {row.initials}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{row.name}</span>
        <span className="truncate font-ops-body text-ops-xs text-ops-body">
          {row.contact} · {row.scopeText}
        </span>
      </div>

      <div className="flex max-w-[52%] flex-none flex-wrap justify-end gap-1.5">
        {row.roleLabels.map((label) => (
          <Badge key={label} tone="slate">
            {label}
          </Badge>
        ))}
        {/* Giriş yapamayan personel görünür olmalı: "neden hiçbir şey göremiyor" sorusunun cevabı bu rozet. */}
        {row.canSignIn ? null : <Badge tone="amber">giriş bekliyor</Badge>}
      </div>
    </div>
  );
}
