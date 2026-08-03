'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Card } from '@/components/operation/ui/card';
import { EmptyState } from '@/components/operation/ui/empty-state';
import type { SettingRowView, StaffRowView } from './settings-types';

/**
 * Ayarlar ekranının ORTAK parçaları — web ve mobil aynı satırı çizer, ölçüsü değişir.
 *
 * Cihaz forku sunumu ayırır (Sapma 3) ama bir ayarın nasıl OKUNDUĞU (ad → ne işe yarar → değeri →
 * varsayılanı) cihaza göre değişmez. İki dalın satırı ayrı yazsaydı, "istisnalı" işareti bir gün
 * yalnız birinde görünürdü.
 */

interface SettingRowProps {
  row: SettingRowView;
  onOpen: (row: SettingRowView) => void;
  compact?: boolean;
}

function SettingRow({ row, onOpen, compact = false }: SettingRowProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(row);
        }
      }}
      className={[
        'flex cursor-pointer items-center gap-3.5 transition-colors hover:border-ops-olive',
        compact ? 'px-3 py-2.5' : 'px-4 py-3',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className={['font-ops-body font-semibold text-ops-ink', compact ? 'text-ops-sm' : 'text-ops-base'].join(' ')}>{row.label}</span>
          {row.exceptions.length > 0 ? <Badge tone="amber">istisnalı</Badge> : null}
        </div>
        <span className="font-ops-body text-ops-xs text-ops-muted">{row.help}</span>
        {/* İstisna satırı ayrı bir renkte: "genel değer bu ama her yerde geçerli değil" uyarısı,
            değerin kendisiyle aynı tonda yazılırsa gözden kaçar. */}
        {row.exceptions.length > 0 ? (
          <span className="font-ops-body text-ops-xs text-ops-amber">{row.exceptions.map((e) => `${e.scopeLabel} → ${e.display}`).join(' · ')}</span>
        ) : null}
      </div>

      <div className="flex flex-none flex-col items-end gap-px">
        <span className={['font-ops-mono text-ops-ink', compact ? 'text-ops-base' : 'text-ops-lg'].join(' ')}>{row.display}</span>
        {/* Fabrika değeri YALNIZ değiştirilmişken yazılır: her satıra "varsayılan X" koymak, hiçbiri
            değişmemişken aynı sayıyı iki kez gösterir ve gerçekten değişmiş olanı görünmez kılar. */}
        {row.changed ? <span className="font-ops-body text-ops-micro text-ops-faint">varsayılan {row.fallbackDisplay}</span> : null}
      </div>
    </Card>
  );
}

interface SettingListProps {
  rows: SettingRowView[];
  onOpen: (row: SettingRowView) => void;
  compact?: boolean;
  searching: boolean;
}

export function SettingList({ rows, onOpen, compact, searching }: SettingListProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={searching ? 'Bu aramaya uyan ayar yok' : 'Bu bölümde ayar yok'}
        description={searching ? 'Ayarlar adlarına ve açıklamalarına göre aranır; iç anahtar adları aranmaz.' : undefined}
      />
    );
  }
  return (
    <div className={['flex flex-col', compact ? 'gap-2' : 'gap-2.5'].join(' ')}>
      {rows.map((r) => (
        <SettingRow key={r.key} row={r} onOpen={onOpen} compact={compact} />
      ))}
    </div>
  );
}

interface StaffRowProps {
  row: StaffRowView;
  onOpen: (row: StaffRowView) => void;
  compact?: boolean;
}

/** Avatar zemini kimlikten TÜRETİLİR: rastgele olsaydı aynı kişi her yüklemede başka renkte olurdu. */
const AVATAR_TONES = ['bg-ops-olive', 'bg-ops-blue', 'bg-ops-slate', 'bg-ops-amber'] as const;

function avatarTone(id: string): string {
  let sum = 0;
  for (const ch of id) sum = (sum + ch.charCodeAt(0)) % 997;
  return AVATAR_TONES[sum % AVATAR_TONES.length]!;
}

export function StaffRow({ row, onOpen, compact = false }: StaffRowProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(row);
        }
      }}
      className={['flex cursor-pointer items-center gap-3 transition-colors hover:border-ops-olive', compact ? 'px-3 py-2.5' : 'px-4 py-3'].join(' ')}
    >
      <span
        aria-hidden
        className={['grid h-10 w-10 flex-none place-items-center rounded-full font-ops-display text-ops-sm font-semibold text-ops-card', avatarTone(row.id)].join(' ')}
      >
        {row.initials}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{row.name}</span>
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">
          {row.contact} · {row.scopeText}
        </span>
      </div>

      <div className="flex flex-none flex-wrap justify-end gap-1.5">
        {row.roleLabels.map((label) => (
          <Badge key={label} tone="slate">
            {label}
          </Badge>
        ))}
        {/* Giriş yapamayan personel GÖRÜNÜR olmalı: kaydı var, rolü var, ama hesabı bağlanmamış —
            "neden hiçbir şey göremiyor" sorusunun cevabı burada duruyor. */}
        {row.canSignIn ? null : <Badge tone="amber">giriş bekliyor</Badge>}
      </div>
    </Card>
  );
}
