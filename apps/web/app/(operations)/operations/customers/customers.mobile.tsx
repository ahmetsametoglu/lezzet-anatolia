'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ORDER_STATUS_LABELS } from '@lezzet/types';
import type { B2bApplicationStatus } from '@lezzet/domain-core';
import { Badge } from '@/components/operation/ui/badge';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Button } from '@/components/operation/ui/button';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { StepButton } from '@/components/operation/ui/step-button';
import { money, shortDate } from '@/components/operation/ui/format';
import { InlineMetric } from '@/components/operation/ui/inline-metric';
import { Skeleton, SkeletonMetric, SkeletonRows } from '@/components/operation/ui/skeleton';
import { B2B_STATUS_VIEW, statusHint, statusOf } from './customers-labels';
import { MARKETING_CHANNEL_LABEL, SCOPE_LABEL } from './customers-url';
import type { CustomerDetail, CustomersViewProps } from './customers-types';
import { EmptyState } from '@/components/operation/ui/empty-state';

// Müşteriler — mobil. Tasarımın kuralı: **telefonla bulma · karneye bakma · limit değiştirme**.
// Daralık bilinçli, eksiklik değil: birleştirme ve GDPR silme gibi geri dönüşsüz işlemler burada YOK.
//
// Kapıda ödeme anahtarı da YOK: tasarımın mobil çerçevesi bu üç işi sayıyor ve "kapıda ödemeyi kapat"
// onlardan biri değil. Web tarafında da panelden `Düzenle` formuna taşındı (30.07) — telefonda o formu
// açmak zaten yok, dolayısıyla ayarın tek evi masaüstü formu.
//
// Tasarımın mobil çerçevesinde çip şeridi ve alt-başlık sayaçları da YOK — telefonda operatör tipe
// göre taramaz, tek bir müşteriyi telefonundan arar. Bir tur ikisi de eklenmişti; kaldırıldı.
//
// Yerleşim kartlar üzerine kurulu (tablo değil): telefonda üç kolonluk ızgara okunmaz. Detay seçili
// kartın ALTINDA açılır — ayrı bir ekrana gitmek, WhatsApp yazışmasının ortasında geri dönüşü
// zorlaştırırdı.

/** Limit adımlayıcısının basamağı (€). Parametrik: 50 makul bir başlangıç, kutsal değil. */
const LIMIT_STEP_EUR = 50;

export function CustomersMobile(props: CustomersViewProps) {
  // Çip ŞERİDİ yok (tasarım), ama `onScope` yine de alınıyor — süzgeci KALDIRABİLMEK için.
  // `onType`/`onChannel` alınmıyor: telefonda süzgeç kurulmuyor, yalnız gelmiş olanı kaldırıyoruz.
  const { rows, urlState, search, onSearch, onScope, hasMore, loadingMore, onLoadMore } = props;
  const { selectedId, onSelect, detail, detailLoading, detailError, onOpenOrder, onEditCredit, onOpenB2b } = props;
  const { saving, saveError, onSaveCreditLimit } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      {/* Başlık barı ORTAK (`PageHeader compact`) — mobil kademesi ve arama kutusu onun içinde.
          Elden yazılan blok üç ekranda üç farklı yükseklik üretiyordu (09.19). */}
      <PageHeader
        title="Müşteriler"
        compact
        search={{ value: search, onChange: onSearch, placeholder: 'Telefon veya ad…' }}
      />

      {/* SÜZÜLÜYOR ŞERİDİ — telefonda çip yok ama süzgeç ADRESTEN gelebiliyor: analitik ekranı
          "N kişi pazarlama izinli" derken buraya `?scope=marketing&mc=email` ile köprü kuruyor
          (`ANALYTICS §6`). Şerit olmasaydı operatör süzülmüş bir listeyi tam liste sanırdı ve
          aradığı müşteriyi "yok" diye okurdu — sessiz süzgeç, boş sonuçla yalan söyler.
          Kaldırma yolu da burada: kurulamayan bir süzgecin hiç değilse kapısı olmalı. */}
      {urlState.scope !== 'all' ? (
        <div className="flex items-center justify-between gap-3 border-b border-ops-line bg-ops-subtle px-4 py-2">
          <span className="min-w-0 truncate font-ops-body text-ops-xs text-ops-body">
            Süzülüyor: <span className="font-semibold text-ops-ink">{SCOPE_LABEL[urlState.scope]}</span>
            {urlState.scope === 'marketing' && urlState.mc !== 'any' ? ` · ${MARKETING_CHANNEL_LABEL[urlState.mc]}` : ''}
          </span>
          <button
            type="button"
            onClick={() => onScope('all')}
            className="flex-none cursor-pointer font-ops-body text-ops-xs font-semibold text-ops-olive-dark underline-offset-2 hover:underline"
          >
            Kaldır
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState
            fill={false}
            title="Müşteri bulunamadı"
            description={search ? 'Telefonun son hanelerini denemek genelde en hızlısı.' : 'Henüz müşteri kaydı yok.'}
          />
        ) : (
          rows.map((row) => {
            const status = statusOf(row);
            const open = row.id === selectedId;
            return (
              <div key={row.id} className="border-b border-ops-line-soft">
                <button
                  type="button"
                  onClick={() => onSelect(row.id)}
                  className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors ${
                    open ? 'bg-ops-subtle' : 'hover:bg-ops-subtle'
                  }`}
                >
                  {/* Avatar yuvarlatılmış kare, tipe göre DOLU renkli (envanter O6: B2B amber / B2C olive). */}
                  <span
                    className={`flex h-10 w-10 flex-none items-center justify-center rounded-[10px] font-ops-display text-ops-xs font-semibold text-ops-white ${
                      row.type === 'company' ? 'bg-ops-amber' : 'bg-ops-olive'
                    }`}
                  >
                    {row.initials}
                  </span>
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{row.name}</span>
                    <span className="truncate font-ops-mono text-ops-xs text-ops-muted">
                      {row.phone ?? row.email ?? '—'}
                    </span>
                  </span>
                  <span className="ml-auto flex flex-none items-center gap-1.5" title={statusHint(row)}>
                    <Badge tone={status.tone} dot>
                      {status.label}
                    </Badge>
                  </span>
                </button>

                {open ? (
                  <MobileDetail
                    // B2B kutusu satırın TİPİNE bakıyor, detaya değil: detay okunurken de görünmesi
                    // gerekiyor ve tip zaten satırda taşınıyor.
                    isCompany={row.type === 'company'}
                    b2bStatus={row.b2bStatus}
                    onOpenB2b={onOpenB2b}
                    detail={detail}
                    loading={detailLoading}
                    detailError={detailError}
                    saving={saving}
                    saveError={saveError}
                    onOpenOrder={onOpenOrder}
                    onEditCredit={onEditCredit}
                    onSaveCreditLimit={onSaveCreditLimit}
                  />
                ) : null}
              </div>
            );
          })
        )}
        <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
      </div>
    </div>
  );
}

/**
 * Seçili kartın altındaki detay — tasarımın mobil detay ekranının içeriği.
 *
 * ÖDEME KARNESİ kırmızı kutuda ve satır-içi ÜÇ değer (kart ızgarası değil): telefonda kart ızgarası
 * dikey yeri boşa harcıyor ve tasarım da üçünü yan yana veriyor. **Ciro burada YOK** — mobil karnenin
 * sorusu "ödüyor mu", "ne kadar alıyor" değil (o web'de).
 */
interface MobileDetailProps {
  isCompany: boolean;
  b2bStatus: B2bApplicationStatus;
  onOpenB2b: () => void;
  detail: CustomerDetail | null;
  loading: boolean;
  /** Okuma düştüyse sebebi — iskelet sonsuza kadar dönmesin (bağımsız ajan denetimi, 30.07). */
  detailError: string | null;
  saving: boolean;
  saveError: string | null;
  onOpenOrder: (orderId: string) => void;
  onEditCredit: () => void;
  onSaveCreditLimit: (cents: number | null) => void;
}

function MobileDetail({
  isCompany,
  b2bStatus,
  onOpenB2b,
  detail,
  loading,
  detailError,
  saving,
  saveError,
  onOpenOrder,
  onEditCredit,
  onSaveCreditLimit,
}: MobileDetailProps) {
  // OKUMA DÜŞTÜ: iskelet sonsuza kadar nabız atardı ("geliyor" derken gelmiyor). Bir tur tam bu
  // oluyordu — `loading || !detail` koşulu hatayı da yükleme sayıyordu.
  if (!loading && !detail && detailError) {
    return (
      <div className="flex flex-col gap-1.5 bg-ops-red-bg px-4 py-3.5" role="alert">
        <span className="font-ops-display text-ops-xs font-semibold text-ops-red">Bilgi okunamadı</span>
        <span className="font-ops-body text-ops-sm leading-[1.5] text-ops-red">{detailError}</span>
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="flex flex-col gap-3 bg-ops-subtle px-4 py-3.5">
        {/* B2B kutusu detay beklemez — kararı verecek bilgi (tip + onay hâli) satırda zaten var ve
            tasarımın mobil kuralı "karar telefonda anında". */}
        {isCompany ? <B2bBox status={b2bStatus} onOpen={onOpenB2b} /> : null}
        {/* İSKELET, tek satır "Yükleniyor…" değil: telefonda kart bir kez açılıp içerik gelince
            uzuyordu ve altındaki müşteri satırı ekrandan kayıyordu — operatörün baktığı yer değişiyor.
            İskelet gelen içerikle aynı yüksekliği kaplıyor. */}
        <div className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5">
          <Skeleton className="h-3 w-28" />
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <SkeletonMetric boxed={false} />
            <SkeletonMetric boxed={false} />
            <SkeletonMetric boxed={false} />
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full rounded-ops-btn" />
        </div>
        <Skeleton className="h-2.5 w-24" />
        <SkeletonRows rows={2} />
      </div>
    );
  }

  const gecikme = detail.overdueCount > 0;

  return (
    <div className="flex flex-col gap-3 bg-ops-subtle px-4 py-3.5">
      {isCompany ? <B2bBox status={b2bStatus} onOpen={onOpenB2b} /> : null}

      {/* Ödeme karnesi — kutunun rengi durumu söyler. */}
      <div
        className={`flex flex-col gap-2 rounded-ops-card border px-3 py-2.5 ${
          gecikme ? 'border-ops-red-line bg-ops-red-bg' : 'border-ops-line bg-ops-white'
        }`}
      >
        {/* Kutu başlığı cümle düzeninde ve display yazısıyla (tasarım) — büyük harfli küçük kademe
            bölüm etiketine ait, kutu adına değil. */}
        <span className={`font-ops-display text-ops-xs font-semibold ${gecikme ? 'text-ops-red' : 'text-ops-ink'}`}>
          Ödeme karnesi
        </span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <InlineMetric
            size="md"
            label="Ort. ödeme"
            value={
              detail.avgPaymentDays === null
                ? '—'
                : `${detail.avgPaymentDays > 0 ? '+' : ''}${detail.avgPaymentDays} gün`
            }
            tone={detail.latePaymentCount > 0 ? 'red' : undefined}
          />
          <InlineMetric
            size="md"
            label="Gecikme"
            value={detail.latePaymentCount > 0 ? `${detail.latePaymentCount} kez` : 'yok'}
            tone={detail.latePaymentCount > 0 ? 'red' : undefined}
          />
          <InlineMetric
            size="md"
            label="Açık bakiye"
            value={money(detail.openBalanceCents)}
            tone={gecikme ? 'red' : undefined}
          />
        </div>
        {gecikme ? (
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-red">
            ⚠ Gecikmiş vade — vadeli seçenek checkout&apos;ta otomatik kapalı.
          </span>
        ) : null}
      </div>

      {/* Karne notu kutunun DIŞINDA (tasarım): kutu ölçüleri taşır, not kutuya değil OPERATÖRE
          söylenir — "bu sayılar sana karar vermen için, senin yerine karar vermek için değil". */}
      <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
        Karne karar desteğidir — limit puana göre otomatik belirlenmez.
      </span>

      {/* Vade limiti — SATIR İÇİ kontrol (tasarım): değer + adımlayıcılar + tam genişlik kaydet.
          Telefonda "karneye bak, limiti değiştir" tek ekranda bitmeli; diyalog o akışı kesiyordu. */}
      <LimitStepper
        cents={detail.creditLimitCents}
        enabled={detail.creditEnabled}
        saving={saving}
        onSave={onSaveCreditLimit}
        onOpenFull={onEditCredit}
      />

      {saveError ? (
        <span className="font-ops-body text-ops-xs font-semibold text-ops-red" role="alert">
          {saveError}
        </span>
      ) : null}

      {/* Son siparişler — `admin-musteriler.md` §2 detayda istiyor. Kart gövdesi özet diyaloğunu açar,
          KOD detay sayfasına gider (masaüstüyle aynı iki niyet). */}
      <div className="flex flex-col gap-1.5">
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          Son siparişler
        </span>
        {detail.lastOrders.length === 0 ? (
          <span className="font-ops-body text-ops-sm text-ops-faint">Henüz siparişi yok.</span>
        ) : (
          detail.lastOrders.map((o) => (
            <div
              key={o.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenOrder(o.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenOrder(o.id);
                }
              }}
              title={ORDER_STATUS_LABELS[o.status]}
              className="flex cursor-pointer items-center gap-2 rounded-ops-card border border-ops-line bg-ops-white px-2.5 py-2"
            >
              {o.referenceNo ? (
                <Link
                  href={o.href}
                  onClick={(e) => e.stopPropagation()}
                  className="cursor-pointer font-ops-mono text-ops-sm text-ops-ink underline decoration-ops-line-strong decoration-1 underline-offset-2"
                >
                  {o.referenceNo}
                </Link>
              ) : (
                <span className="font-ops-mono text-ops-sm text-ops-muted">taslak</span>
              )}
              <span className="font-ops-body text-ops-xs text-ops-muted">{shortDate(o.createdAt)}</span>
              <span className="ml-auto font-ops-mono text-ops-sm font-medium text-ops-ink">{money(o.totalCents)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Satır-içi vade limiti kontrolü — tasarımın mobil hâli: `− 500 € +` ve tam genişlik "Limiti kaydet".
 *
 * Vade KAPALIYSA adımlayıcı gösterilmez: kapalı bir yetkiye sayı yazmak, kapalı bir kapıya anahtar
 * takmaktır. O hâlde tam forma yönlendirilir — yetkiyi açmak ayrı bir karar ve vade süresini de ister.
 */
function LimitStepper({
  cents,
  enabled,
  saving,
  onSave,
  onOpenFull,
}: {
  cents: number | null;
  enabled: boolean;
  saving: boolean;
  onSave: (cents: number | null) => void;
  onOpenFull: () => void;
}) {
  const [draft, setDraft] = useState<number | null>(cents);
  const [sonSenkron, setSonSenkron] = useState<number | null>(cents);
  // Kaydetme sonrası taze değere senkronlanır (masaüstündeki indirim kutusuyla aynı gerekçe).
  if (sonSenkron !== cents) {
    setSonSenkron(cents);
    setDraft(cents);
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5">
        <span className="font-ops-body text-ops-xs font-medium text-ops-ink">Vade limiti</span>
        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
          Vade yetkisi kapalı. Açmak ayrı bir karar — tam formda yapılır.
        </span>
        <Button variant="secondary" size="sm" onClick={onOpenFull} disabled={saving}>
          Vade / limit
        </Button>
      </div>
    );
  }

  const step = LIMIT_STEP_EUR * 100;
  const degisti = draft !== cents;

  return (
    <div className="flex flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5">
      <div className="flex items-center gap-2">
        {/* Kutu adı cümle düzeninde (tasarım), etiket kademesinde değil. */}
        <span className="mr-auto font-ops-body text-ops-xs font-medium text-ops-ink">Vade limiti</span>
        <span className="font-ops-mono text-ops-base font-medium text-ops-ink">
          {draft === null ? 'tanımsız' : money(draft)}
        </span>
        <StepButton label="−" ariaLabel="Azalt" onClick={() => setDraft(Math.max(0, (draft ?? 0) - step))} disabled={saving} />
        <StepButton label="+" ariaLabel="Artır" onClick={() => setDraft((draft ?? 0) + step)} disabled={saving} />
      </div>
      {/* Kaydet OLIVE (tasarım), ink değil: ekranın tek olumlu eylemi ve olive "onayla"nın rengi. */}
      <Button variant="primary" fullWidth onClick={() => onSave(draft)} disabled={saving || !degisti}>
        {saving ? 'Kaydediliyor…' : 'Limiti kaydet'}
      </Button>
      <button
        type="button"
        onClick={onOpenFull}
        className="cursor-pointer text-left font-ops-body text-ops-xs text-ops-muted underline decoration-ops-line-strong underline-offset-2"
      >
        Vade süresi ve yetkisi için tam form
      </button>
    </div>
  );
}

/**
 * B2B onay kutusu (mobil) — durum + kartı açan düğme.
 *
 * Mobilde de var, çünkü tasarımın B2B bölümü *"başvurular gün içinde tek tek düşer; karar telefonda
 * anında"* diyor. Onay geri dönüşsüz DEĞİL (ret kaydı silmez, onay geri alınabilir), yani mobilin
 * "geri dönüşsüz işlem yok" kuralına takılmıyor.
 */
function B2bBox({ status, onOpen }: { status: B2bApplicationStatus; onOpen: () => void }) {
  const view = B2B_STATUS_VIEW[status];
  return (
    <div
      className={`flex flex-col gap-2 rounded-ops-card border px-3 py-2.5 ${
        view.highlight ? 'border-ops-amber-line bg-ops-amber-bg' : 'border-ops-line bg-ops-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="mr-auto font-ops-body text-ops-xs font-medium text-ops-ink">B2B onayı</span>
        <Badge tone={view.tone} outline>
          {view.badge}
        </Badge>
      </div>
      <Button variant="secondary" size="sm" fullWidth onClick={onOpen}>
        Başvuruyu incele
      </Button>
    </div>
  );
}

