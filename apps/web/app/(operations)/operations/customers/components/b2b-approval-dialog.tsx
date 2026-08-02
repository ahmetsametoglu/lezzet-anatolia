'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SignalTone } from '@lezzet/domain-core';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Skeleton, SkeletonCard, SkeletonText } from '@/components/operation/ui/skeleton';
import type { B2bCheckView, B2bDuplicateRow } from '../customers-types';
import { CUSTOMERS_PATH } from '../customers-url';

/**
 * B2B başvuru KONTROL KARTI — tasarımdaki "B2B Başvuru Onayı", ayrı sayfa değil DİYALOG.
 *
 * **Ayrı sayfa kaldırıldı** (kullanıcı kararı 30.07): onay, profesyonel müşterinin bir hâlidir. Ayrı
 * ekran hem menüde gereksiz bir yer açıyordu hem aynı müşteriyi iki yerde yaşatıyordu — ve onaydan
 * hemen sonra gelen iş (vade/limit) zaten müşteri detayındaydı. Kart artık o detayın içinden açılıyor.
 *
 * **~15 saniyelik karar** (tasarımın kendi ölçüsü): sinyal ızgarası tek bakışta okunur, düğmeler altta,
 * onay iki dokunuş uzakta. Sistem sinyal sunar, kararı admin verir — **otomatik onay yok** ve bu yüzden
 * ekranda "önerilen karar" da yok.
 *
 * **Onay = yalnız toptan fiyat.** Vade/limit açmaz; kart bunu altına yazıyor ve action da öyle davranıyor.
 *
 * Onay/ret ONAY BASAMAĞINDAN geçer: tasarımda ayrı bir doğrulama modalı var, burada aynı diyaloğun
 * içinde bir basamak olarak duruyor. İç içe iki diyalog yığmak yerine kartın gövdesi onay cümlesine
 * dönüşüyor — koruma aynı (yanlışlıkla tetiklenmiyor), katman bir eksik.
 */
interface B2bApprovalDialogProps {
  check: B2bCheckView | null;
  /** Okuma hatası — yutulursa diyalog sonsuza kadar "Yükleniyor…" kalır. */
  error: string | null;
  saving: boolean;
  onDecide: (approved: boolean) => void;
  onClose: () => void;
}

type Step = { kind: 'card' } | { kind: 'confirm'; approve: boolean };

export function B2bApprovalDialog({ check, error, saving, onDecide, onClose }: B2bApprovalDialogProps) {
  const [step, setStep] = useState<Step>({ kind: 'card' });

  return (
    <Dialog
      open
      onClose={onClose}
      title="B2B başvuru onayı"
      subtitle={check ? `${check.name} · sistem sinyal sunar, kararı siz verirsiniz` : 'Yükleniyor…'}
      maxWidth={620}
    >
      {error ? (
        <p className="font-ops-body text-ops-sm text-ops-red" role="alert">
          {error}
        </p>
      ) : !check ? (
        <CardSkeleton />
      ) : step.kind === 'confirm' ? (
        <ConfirmStep
          check={check}
          approve={step.approve}
          saving={saving}
          onBack={() => setStep({ kind: 'card' })}
          onConfirm={() => onDecide(step.approve)}
        />
      ) : (
        <CheckPane check={check} saving={saving} onDecide={(approve) => setStep({ kind: 'confirm', approve })} />
      )}
    </Dialog>
  );
}

/**
 * Kart beklerken — künye kutusu · AI kutusu · ALTI sinyal hücresi (2 kolon).
 *
 * Sinyal sayısı SABİT altı (motorun ürettiği kadar) ve bu iskeleti nadiren yanıltıcı yapan bir durum:
 * sayı veriye göre değişmiyor, yani gelen içerik iskeletle birebir aynı yeri kaplıyor.
 */
function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3.5" aria-hidden="true">
      <SkeletonCard>
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-2.5 w-3/5" />
        <Skeleton className="h-2.5 w-32" />
      </SkeletonCard>
      <div className="flex flex-col gap-1.5 rounded-ops-card border border-dashed border-ops-line bg-ops-subtle px-3.5 py-3">
        <Skeleton className="h-2.5 w-48" />
        {/* Gövde bir CÜMLE bekliyor (kaç satıra sarabileceği belli değil) → paragraf iskeleti:
            son satırı kısa, yani tablo değil metin gibi okunuyor. */}
        <SkeletonText lines={2} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5">
            <Skeleton className="h-[22px] w-[22px] flex-none rounded-[7px]" />
            <span className="flex min-w-0 flex-col gap-1">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-3 w-20" />
            </span>
          </div>
        ))}
      </div>
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/**
 * Kontrol kartının GÖVDESİ — künye + VIES + karar düğmeleri.
 *
 * Adı `Card` idi ve paylaşılan kart primitifiyle (`ui/card.tsx`) çakışıyordu (denetim OP4): burası
 * bir kabuk değil bir içerik grubu (zemin/kenar yok), ama okuyan "kart primitifini mi kullanıyor"
 * diye duraklıyordu — ve primitif bir gün import edilseydi sessizce gölgelenirdi.
 */
function CheckPane({
  check,
  saving,
  onDecide,
}: {
  check: B2bCheckView;
  saving: boolean;
  onDecide: (approve: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {/* ── Künye ── Resmî ad ticari addan farklı olabilir ve fatura resmî ada çıkar. */}
      <div className="flex flex-wrap items-start gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-ops-display text-ops-base font-semibold text-ops-ink">
            {check.legalName ?? check.name}
          </span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {check.addressLine ?? 'kayıtlı adresi yok'}
          </span>
          {check.siret ? <span className="font-ops-mono text-ops-xs text-ops-muted">SIRET {check.siret}</span> : null}
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <Badge tone={check.country === 'FR' ? 'blue' : 'amber'}>{check.country}</Badge>
          <Badge tone={toneOf(check.flag.tone)} dot>
            {check.flag.label}
          </Badge>
        </div>
      </div>

      {/* ── AI özeti ── BEKLEYEN(09.11): `packages/ai` bir KABUK — paket var (00'ın iskeletinden),
          içinde yalnız kendi adı duruyor, tek bir kapı bile yok. Kutu ÇİZİLİYOR ama içi UYDURULMUYOR:
          "okuma yardımı" diye sunulan bir cümle üretilmediği hâlde varmış gibi görünürse, operatör
          okumadığı bir özete güvenir. Eksiğini kendi üstünde yazıyor (CLAUDE.md §3). */}
      <div className="flex flex-col gap-1 rounded-ops-card border border-ops-line border-dashed bg-ops-subtle px-3.5 py-3">
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          AI özeti · okuma yardımı, karar değil
        </span>
        <span className="font-ops-body text-ops-sm text-ops-faint">
          Özet henüz üretilmiyor — sinyalleri aşağıdan okuyun.
        </span>
      </div>

      {/* ── Sinyal ızgarası ── Altı sinyal, sırası motorda (en belirleyici üstte). */}
      <div className="grid grid-cols-2 gap-2">
        {check.signals.map((s) => (
          <SignalCell key={s.label} label={s.label} value={s.value} tone={s.tone} />
        ))}
      </div>

      {/* ── Mükerrer köprüsü ── Onaydan önce çözülmesi gereken tek şey. */}
      {check.duplicates.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3.5 py-3">
          <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-red">
            Mükerrer olabilir: aşağıdaki kayıt(lar) aynı telefona ya da benzer ada sahip. Aynı işletmenin
            iki hesabı sipariş geçmişini ve cari bakiyeyi ikiye böler — onaydan önce ilişkiyi çözün.
          </span>
          <div className="flex flex-col gap-1.5">
            {check.duplicates.map((d) => (
              <DuplicateRow key={d.id} row={d} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Dış doğrulama ── Sinyaller resmî kayıttan, gözle bakmak ayrı bir doğrulama. */}
      <div className="flex flex-wrap items-center gap-2.5">
        {check.mapsHref ? (
          <a
            href={check.mapsHref}
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer font-ops-body text-ops-sm text-ops-olive underline decoration-ops-olive-line underline-offset-2 transition-colors hover:decoration-ops-olive"
          >
            Google / Haritalar&apos;da aç
          </a>
        ) : null}
        {check.phone ? <span className="font-ops-mono text-ops-sm text-ops-muted">{check.phone}</span> : null}
      </div>

      <p className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Onay yalnız <strong>toptan fiyatı</strong> açar — vade/limit ayrı karardır ve müşteri panelinden
        verilir. Ret kaydı silmez: hesap B2C olarak kalır.
        {/* BEKLEYEN(09.11): resmî kayıt (Sirene/Annuaire) ve VIES çağrıları bağlı değil — künye
            başvuru anındaki hâliyle okunuyor, KDV numarası doğrulanmıyor. */}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-ops-line pt-3">
        {/* Onaylı kayıtta da düğmeler duruyor: onay geri alınabilir bir karardır (işletme kapanır,
            ödememe çıkar) ve geri alma yolu kapatılırsa operatör kaydı elle bozmaya çalışır. */}
        <Button variant="primary" onClick={() => onDecide(true)} disabled={saving || check.approved === true}>
          {check.approved === true ? 'Onaylı' : 'Onayla'}
        </Button>
        <Button variant="danger" onClick={() => onDecide(false)} disabled={saving || check.approved === false}>
          {check.approved === false ? 'Reddedildi' : 'Reddet'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Onay basamağı — kararın SONUCU cümleyle yazılır, sonra tekrar sorulur.
 *
 * Cümle şart: "Onayla" düğmesi neyin açıldığını söylemiyor. Operatörün onaydan beklediği şey bazen
 * vade yetkisidir ve bu ekran tam o yanlış beklentiyi düzeltmek için var.
 */
function ConfirmStep({
  check,
  approve,
  saving,
  onBack,
  onConfirm,
}: {
  check: B2bCheckView;
  approve: boolean;
  saving: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">
        {approve ? 'Başvuruyu onayla' : 'Başvuruyu reddet'}
      </span>
      <p className="font-ops-body text-ops-sm leading-[1.6] text-ops-body">
        {approve
          ? `${check.name} toptan fiyatları görmeye başlayacak.`
          : `${check.name} reddedilecek; hesap B2C olarak kalır, toptan fiyat açılmaz.`}
      </p>
      <p className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Onay yalnız toptan fiyatı açar. Vade/limit açmaz — gerekiyorsa müşteri panelinden ayrıca
        verirsiniz.
      </p>
      <div className="flex flex-wrap items-center gap-2 border-t border-ops-line pt-3">
        <Button variant="secondary" onClick={onBack} disabled={saving}>
          Vazgeç
        </Button>
        <Button variant={approve ? 'primary' : 'destructive'} onClick={onConfirm} disabled={saving}>
          {saving ? 'Kaydediliyor…' : approve ? 'Onayla' : 'Reddet'}
        </Button>
      </div>
    </div>
  );
}

/** Sinyal hücresi — ikon durumu, değer bilgiyi taşır. */
function SignalCell({ label, value, tone }: { label: string; value: string; tone: SignalTone }) {
  const ikon = tone === 'bad' ? '✕' : tone === 'warn' ? '!' : '✓';
  const cerceve =
    tone === 'bad' ? 'border-ops-red-line' : tone === 'warn' ? 'border-ops-amber-line' : 'border-ops-line';
  const kutu =
    tone === 'bad'
      ? 'bg-ops-red-bg text-ops-red'
      : tone === 'warn'
        ? 'bg-ops-amber-bg text-ops-amber'
        : 'bg-ops-olive-bg text-ops-olive-dark';

  return (
    <div className={`flex items-center gap-2.5 rounded-ops-card border bg-ops-white px-3 py-2.5 ${cerceve}`}>
      <span
        className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-[7px] font-ops-display text-ops-micro font-semibold ${kutu}`}
      >
        {ikon}
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <span className="font-ops-body text-ops-micro text-ops-muted">{label}</span>
        <span className={`truncate font-ops-body text-ops-sm font-medium ${tone === 'bad' ? 'text-ops-red' : 'text-ops-ink'}`}>
          {value}
        </span>
      </span>
    </div>
  );
}

/**
 * Mükerrer aday satırı — kaydı AÇAR, birleştirmez.
 *
 * Bağ arama süzgeciyle müşteri listesine gider: `BEKLEYEN(09.10)` birleştirme akışı henüz yok ve
 * "Birleştir" yazan çalışmayan bir düğme, tutulmayan bir söz olurdu.
 */
function DuplicateRow({ row }: { row: B2bDuplicateRow }) {
  return (
    <div className="flex items-center gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-2.5 py-2">
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-sm text-ops-ink">{row.name}</span>
        <span className="truncate font-ops-mono text-ops-xs text-ops-muted">{row.phone ?? 'telefon yok'}</span>
      </span>
      <span className="ml-auto flex flex-none items-center gap-2">
        {row.isDraft ? <Badge tone="neutral">Taslak</Badge> : null}
        <Link
          href={`${CUSTOMERS_PATH}?q=${encodeURIComponent(row.phone ?? row.name)}`}
          className="cursor-pointer font-ops-body text-ops-xs text-ops-olive underline decoration-ops-olive-line underline-offset-2"
        >
          Kaydı aç →
        </Link>
      </span>
    </div>
  );
}

/** Motor tonunu rozet tonuna çevirir — iki sözlük var ve biri diğerinin adı değil. */
function toneOf(tone: SignalTone): 'olive' | 'amber' | 'red' {
  return tone === 'bad' ? 'red' : tone === 'warn' ? 'amber' : 'olive';
}
