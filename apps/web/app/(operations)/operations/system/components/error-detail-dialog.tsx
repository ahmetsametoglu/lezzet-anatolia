'use client';

import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import type { ErrorRowView } from '../system-types';
import { ErrorMetaGrid, LevelBadge, RegressionChip, RegressionNote } from './error-meta';
import { CopyButton, StackBlock } from './stack-block';

/**
 * O9 · Hata detay diyaloğu — listeden HIZLI BAKIŞ (18.5).
 *
 * Masaüstünde asıl okuma yüzeyi O25 (geniş inceleme); bu diyalog ikincil yol: listeyi tararken bir
 * satıra bakıp kapatmak için. Yeni kabuk açmaz, O9'un kaydırılır gövdesini kullanır.
 *
 * Başlık `Dialog`'un kendi `title`'ı DEĞİL: hata mesajı bir başlık değil bir cümledir ve tek satıra
 * sığmaz. Kabuk "Hata detayı" der, mesaj gövdenin ilk bloğunda tam hâliyle durur.
 */
interface ErrorDetailDialogProps {
  row: ErrorRowView;
  onClose: () => void;
  onResolve: (id: string) => void;
  resolving: boolean;
}

export function ErrorDetailDialog({ row, onClose, onResolve, resolving }: ErrorDetailDialogProps) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Hata detayı"
      subtitle={`${row.count.toLocaleString('tr-TR')} kez görüldü · ${row.source}`}
      maxWidth={660}
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {row.resolvedAt
              ? 'Kayıt kalır, yalnız odaktan çıkar — silme yok.'
              : 'Bağlamda kimlik var, içerik yok: sipariş numarası görünür, müşteri verisi görünmez.'}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          {!row.resolvedAt ? (
            <Button variant="primary" disabled={resolving} onClick={() => onResolve(row.id)}>
              {resolving ? 'İşaretleniyor…' : 'Çözüldü'}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={row.level} />
            {row.path ? <span className="font-ops-mono text-ops-xs text-ops-muted">{row.path}</span> : null}
            {row.regression ? <RegressionChip /> : null}
          </div>
          <span className={`font-ops-display text-[17px] font-semibold leading-[1.35] ${row.level === 'fatal' ? 'text-ops-red-dark' : 'text-ops-ink'}`}>
            {row.message}
          </span>
        </div>

        <RegressionNote row={row} />
        <ErrorMetaGrid row={row} columns="two" />

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span className="mr-auto font-ops-display text-ops-sm font-semibold text-ops-ink">Stack</span>
            <CopyButton text={row.stack ?? ''} label="Stack’i kopyala" />
          </div>
          <StackBlock stack={row.stack} size="dialog" />
          <span className="font-ops-body text-ops-micro text-ops-faint">
            Taşmadan kaydırılır; tam metin kopyalanabilir. Ham log akışı burada değil — süreç yöneticisinde durur.
          </span>
        </div>
      </div>
    </Dialog>
  );
}
