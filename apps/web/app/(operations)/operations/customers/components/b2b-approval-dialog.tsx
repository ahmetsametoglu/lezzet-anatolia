'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SignalTone } from '@lezzet/domain-core';
import { b2bSummaryAction } from '../actions';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Textarea } from '@/components/operation/form/input';
import { Skeleton, SkeletonCard, SkeletonText } from '@/components/operation/ui/skeleton';
import type { B2bCheckView, B2bDuplicateRow } from '@lezzet/application';
import { CUSTOMERS_PATH } from '../customers-url';

/**
 * B2B başvurusunun kontrol kartı; onay profesyonel müşterinin bir hâli olduğu için ayrı sayfa değil, müşteri detayından açılan
 * diyalogdur. Sistem sinyal sunar, kararı admin verir: otomatik onay ve "önerilen karar" yoktur, onay ve ret iç içe ikinci bir
 * diyalog yerine aynı diyalogdaki onay basamağından geçer.
 */
interface B2bApprovalDialogProps {
  check: B2bCheckView | null;
  /** Okuma hatası — yutulursa diyalog sonsuza kadar "Yükleniyor…" kalır. */
  error: string | null;
  /** Yazım hatası; devir reddedilirse sebebi devir basamağında okunur. */
  writeError: string | null;
  saving: boolean;
  /** Ret'te `reason` DOLU gelir (veri kısıtı gerekçesiz reddi zaten yazdırmıyor); onayda boş. */
  onDecide: (approved: boolean, reason: string) => void;
  /** Başvurunun girişini aynı SIRET'li kayda taşır. */
  onHandOver: (targetId: string) => void;
  onClose: () => void;
}

type Step = { kind: 'card' } | { kind: 'confirm'; approve: boolean } | { kind: 'handover'; target: B2bDuplicateRow };

export function B2bApprovalDialog({ check, error, writeError, saving, onDecide, onHandOver, onClose }: B2bApprovalDialogProps) {
  const [step, setStep] = useState<Step>({ kind: 'card' });
  /** AI özeti: `undefined` = üretiliyor, `null` = üretilemedi. */
  const [summary, setSummary] = useState<string | null | undefined>(undefined);

  // Özet KART OKUMASINDAN AYRI düşer: kart hemen çizilsin, cümle sonra gelsin. Müşteri değişince
  // sıfırlanır — bir başvurunun özeti bir başkasının kartında durursa yanlış işletme okunur.
  const customerId = check?.customerId;
  useEffect(() => {
    if (!customerId) return;
    setSummary(undefined);
    let current = true;
    void b2bSummaryAction(customerId).then(({ data }) => {
      if (current) setSummary(data?.summary ?? null);
    });
    return () => {
      current = false;
    };
  }, [customerId]);

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
          onConfirm={(reason) => onDecide(step.approve, reason)}
        />
      ) : step.kind === 'handover' ? (
        <HandoverStep
          check={check}
          target={step.target}
          saving={saving}
          error={writeError}
          onBack={() => setStep({ kind: 'card' })}
          onConfirm={() => onHandOver(step.target.id)}
        />
      ) : (
        <CheckPane
          check={check}
          saving={saving}
          summary={summary}
          onDecide={(approve) => setStep({ kind: 'confirm', approve })}
          onHandOver={(target) => setStep({ kind: 'handover', target })}
        />
      )}
    </Dialog>
  );
}

/** Sinyal sayısı motorda sabit altıdır, bu yüzden iskelet gelen kartla aynı yeri kaplar. */
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
        {/* Gövde kaç satıra saracağı belli olmayan bir cümle bekler; son satırı kısa iskelet metin gibi okunur. */}
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

/** Kontrol kartının gövdesi; adı paylaşılan kart primitifini (`ui/card.tsx`) gölgelemesin diye `Card` değil. */
function CheckPane({
  check,
  saving,
  summary,
  onDecide,
  onHandOver,
}: {
  check: B2bCheckView;
  saving: boolean;
  /** AI özeti: `undefined` = hâlâ üretiliyor, `null` = üretilemedi, dize = cümle. */
  summary: string | null | undefined;
  onDecide: (approve: boolean) => void;
  onHandOver: (target: B2bDuplicateRow) => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {/* ── Künye ── Resmî ad ticari addan farklı olabilir ve fatura resmî ada çıkar. */}
      <div className="flex flex-wrap items-start gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* Yedek zinciri (künye adı, yoksa hesabın adı) kapıda kurulur; ekran ikinci kez kurmaz. */}
          <span className="font-ops-display text-ops-base font-semibold text-ops-ink">{check.name}</span>
          {/* Kapıda aranacak ve mükerrer şüphesinde bakılacak olan kişidir; işletmeyle aynıysa hesap işletme adına açılmıştır. */}
          {check.contactName !== check.name ? (
            <span className="font-ops-body text-ops-xs text-ops-muted">Başvuran: {check.contactName}</span>
          ) : null}
          {/* Karar işletmenin yerine bakar, bu yüzden kapı fatura adresini verir. Yedeğe düşüp düşmediği bilinmediği için etiket
              satırın rolünü yazmaz. */}
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {check.addressLine ?? 'kayıtlı adresi yok'}
          </span>
          {/* Hangi numaranın hangi adla yazılacağı ülkeye bağlıdır, etiket bu yüzden motordan gelir (`b2bIdentity`). */}
          {check.identity ? (
            <span className="font-ops-mono text-ops-xs text-ops-muted">
              {check.identity.label} {check.identity.value}
            </span>
          ) : null}
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <Badge tone={check.country === 'FR' ? 'blue' : 'amber'}>{check.country}</Badge>
          <Badge tone={toneOf(check.flag.tone)} dot>
            {check.flag.label}
          </Badge>
        </div>
      </div>

      {/* ── AI özeti ── Cümle sinyallerden türer ve kart okumasından ayrı gelir, çünkü model çağrısı saniyeler sürer. Üretilemezse
          yerine bir şey uydurulmaz, operatör sinyallere yönlendirilir. */}
      <div className="flex flex-col gap-1 rounded-ops-card border border-ops-line border-dashed bg-ops-subtle px-3.5 py-3">
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          AI özeti · okuma yardımı, karar değil
        </span>
        {summary === undefined ? (
          // Bekleyen hâl bir CÜMLE bekliyor → paragraf iskeleti (kart iskeletiyle aynı desen).
          <SkeletonText lines={2} />
        ) : summary ? (
          <span className="font-ops-body text-ops-sm text-ops-body">{summary}</span>
        ) : (
          <span className="font-ops-body text-ops-sm text-ops-faint">
            Özet üretilemedi — sinyalleri aşağıdan okuyun.
          </span>
        )}
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
            Mükerrer olabilir: aşağıdaki kayıt(lar) aynı SIRET'e, aynı telefona ya da benzer ada sahip. Aynı işletmenin
            iki hesabı sipariş geçmişini ve cari bakiyeyi ikiye böler — onaydan önce ilişkiyi çözün.
          </span>
          <div className="flex flex-col gap-1.5">
            {check.duplicates.map((d) => (
              <DuplicateRow
                key={d.id}
                row={d}
                // Devir boş başvuru hesabının girişini taşır; girişsiz başvurunun taşıyacağı, girişli kaydın alacağı yer yoktur.
                onHandOver={check.hasLogin && d.sameSiret && !d.hasLogin ? () => onHandOver(d) : null}
              />
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
        {/* Resmî kayıt künyesi ve KDV numarası kart açılırken tazelenir; VIES cevap veremezse eski sonuç yaşıyla gösterilir
            (`refreshVatNumberCheck`). */}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-ops-line pt-3">
        {/* Onaylı kayıtta da düğmeler durur, çünkü onay geri alınabilir bir karardır (işletme kapanır, ödememe çıkar). Kilit
            yalnız verilmiş kararın tekrarını engeller. */}
        <Button variant="primary" onClick={() => onDecide(true)} disabled={saving || check.status === 'approved'}>
          {check.status === 'approved' ? 'Onaylı' : 'Onayla'}
        </Button>
        <Button variant="danger" onClick={() => onDecide(false)} disabled={saving || check.status === 'rejected'}>
          {check.status === 'rejected' ? 'Reddedildi' : 'Reddet'}
        </Button>
      </div>
    </div>
  );
}

/** Onay basamağı kararın sonucunu cümleyle yazar, çünkü operatör onaydan bazen vade yetkisi bekler. */
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
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  // Gerekçe RET'te zorunlu — ve kuralı asıl veri zorluyor (`user_profiles_b2b_reject_stamp`).
  // Düğmeyi burada da kilitliyoruz ki operatör kısıt ihlaline çarpmadan önce ne istendiğini görsün.
  const eksik = !approve && reason.trim().length === 0;

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
      {approve ? null : (
        // Gerekçe müşteriye e-postayla gider; künyesini düzeltip yeniden başvurabildiği için cümle ona yol da gösterir.
        <label className="flex flex-col gap-1.5">
          <span className="font-ops-body text-ops-xs font-semibold text-ops-ink">
            Ret gerekçesi <span className="font-normal text-ops-red">(zorunlu)</span>
          </span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Örn: faaliyet kodu gıda toptan satışıyla uyuşmuyor."
            disabled={saving}
          />
          <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
            Müşteriye e-postayla iletilir — kısa ve düzeltilebilir bir cümle yazın.
          </span>
        </label>
      )}
      <p className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Onay yalnız toptan fiyatı açar. Vade/limit açmaz — gerekiyorsa müşteri panelinden ayrıca
        verirsiniz.
      </p>
      <div className="flex flex-wrap items-center gap-2 border-t border-ops-line pt-3">
        <Button variant="secondary" onClick={onBack} disabled={saving}>
          Vazgeç
        </Button>
        <Button variant={approve ? 'primary' : 'destructive'} onClick={() => onConfirm(reason.trim())} disabled={saving || eksik}>
          {saving ? 'Kaydediliyor…' : approve ? 'Onayla' : 'Reddet'}
        </Button>
      </div>
    </div>
  );
}

/** Devir geri alınmaz (başvuru hesabı GDPR silmeyle kapanır), sonucu bu yüzden cümleyle yazılır ve ikinci kez sorulur. */
function HandoverStep({
  check,
  target,
  saving,
  error,
  onBack,
  onConfirm,
}: {
  check: B2bCheckView;
  target: B2bDuplicateRow;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Girişi bu kayda bağla</span>
      <p className="font-ops-body text-ops-sm leading-[1.6] text-ops-body">
        {`${check.contactName || check.name} adına açılmış başvuru hesabı silinir ve e-postası "${target.name}" kaydına yazılır. Müşteri aynı e-postayla yeniden girince bu kayda ve siparişlerine bağlanır.`}
      </p>
      <p className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Başvuru hesabında sipariş varsa devir yapılmaz. Silme geri alınmaz; onayı ve vadeyi devirden sonra bu kayıtta verirsiniz.
      </p>
      {error ? (
        <p className="font-ops-body text-ops-xs text-ops-red" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-ops-line pt-3">
        <Button variant="secondary" onClick={onBack} disabled={saving}>
          Vazgeç
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={saving}>
          {saving ? 'Bağlanıyor…' : 'Bağla'}
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
 * Mükerrer aday satırı kaydı açar, birleştirmez: birleştirme akışı yok (`BEKLEYEN(09.10)`) ve çalışmayan bir "Birleştir" düğmesi
 * tutulmayan bir söz olurdu.
 */
function DuplicateRow({ row, onHandOver }: { row: B2bDuplicateRow; onHandOver: (() => void) | null }) {
  return (
    <div className="flex items-center gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-2.5 py-2">
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-sm text-ops-ink">{row.name}</span>
        <span className="truncate font-ops-mono text-ops-xs text-ops-muted">{row.phone ?? 'telefon yok'}</span>
      </span>
      <span className="ml-auto flex flex-none items-center gap-2">
        {row.sameSiret ? <Badge tone="amber">Aynı SIRET</Badge> : null}
        {row.isDraft ? <Badge tone="neutral">Taslak</Badge> : null}
        {onHandOver ? (
          <Button variant="secondary" size="sm" onClick={onHandOver}>
            Bu kayda bağla
          </Button>
        ) : null}
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
