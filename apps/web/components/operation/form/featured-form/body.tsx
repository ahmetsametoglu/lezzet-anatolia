'use client';

import { FEATURED_PLACEMENT, type FeaturedTarget } from '@lezzet/types';
import { Toggle } from '@/components/operation/form/toggle';
import { num } from '@/components/operation/ui/format';
import { featuredSummary, type FeaturedCandidate, type FeaturedFormValues } from './schema';

/**
 * **VİTRİN IZGARASI — düzenlenebilir** (22.35). Şema künyesinde gerekçe; buradaki not şekle dair.
 *
 * Liste kataloğun vitrin bölümüyle aynı işi yapar: her kayıt bir `Toggle`, sayaç canlı, aşımda amber.
 * Ama TABLO DEĞİL dar bir liste — kuyruk sütunu dar ve burada aranan şey kayıt yönetmek değil, tek
 * bir kararın ızgaraya etkisini görüp gerekirse yer açmak.
 *
 * **Öneri konusu vurgulanır ve LİSTEDEN ÇIKARILMAZ:** ayrı bir kutuya alsaydık, patron onu ızgaranın
 * geri kalanıyla yan yana tartamazdı — kararın tamamı "bu mu kalsın, o mu" sorusudur.
 */
interface FeaturedFormBodyProps {
  values: FeaturedFormValues;
  onChange: (next: FeaturedFormValues) => void;
  candidates: FeaturedCandidate[];
  /** Önerinin konusu — listede vurgulanır. */
  subjectId: string;
  target: FeaturedTarget;
  targetLabel: string;
  disabled?: boolean;
}

export function FeaturedFormBody({
  values,
  onChange,
  candidates,
  subjectId,
  target,
  targetLabel,
  disabled,
}: FeaturedFormBodyProps) {
  const summary = featuredSummary(values, candidates, target);
  const placement = FEATURED_PLACEMENT[target];

  const toggle = (id: string, on: boolean) =>
    onChange({
      featuredIds: on ? [...values.featuredIds, id] : values.featuredIds.filter((x) => x !== id),
    });

  // Seçkide olanlar ÖNCE: ızgaranın bugünkü hâli listenin başında durmalı, aranan şey o.
  const sorted = [...candidates].sort((a, b) => {
    const inA = values.featuredIds.includes(a.id) ? 0 : 1;
    const inB = values.featuredIds.includes(b.id) ? 0 : 1;
    return inA - inB || a.name.localeCompare(b.name, 'tr');
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
          Vitrin ızgarası
        </span>
        {/* Sayaç aşımda amber ama ENGEL YOK: kontenjan bir kural değil bir uyarıdır — operatör
            bilerek fazla işaretleyip yayın sırasını sonra düzenleyebilir (`catalog-tab` kararı). */}
        <span
          className={`ml-auto font-ops-body text-ops-xs ${
            summary.overflowing && !placement.rotates ? 'font-semibold text-ops-amber-dark' : 'text-ops-faint'
          }`}
        >
          {/* Dönen bantta "N/M görünecek" YANLIŞ olurdu: hepsi görünüyor, aynı anda değil. */}
          {placement.rotates
            ? `${num(summary.visible)} işaretli · bandda aynı anda ${num(summary.slots)}`
            : `${num(summary.visible)}/${num(summary.slots)} görünecek`}
          {summary.passive > 0 ? ` · ${num(summary.passive)} işaretli ama pasif` : ''}
        </span>
      </div>

      {/* **YERLEŞİM TÜRE GÖRE DEĞİŞİR** (kullanıcı düzeltmesi 15.08): üçüne de "vitrin" diyoruz ama
          koleksiyon bandı GÜNE GÖRE DÖNÜYOR — orada fazlası kaybolmaz, sırasını bekler. Tek bir
          "fazlası çizilmez" cümlesi yazsaydık operatör işaretini boşuna geri alırdı. */}
      <p className="font-ops-body text-ops-xs text-ops-muted">
        {placement.where} · {placement.note}
      </p>
      {summary.overflowing && !placement.rotates ? (
        <p className="rounded-ops-btn border border-ops-amber-line bg-ops-amber-bg px-3 py-2 font-ops-body text-ops-xs text-ops-amber-dark">
          Izgarada {num(summary.slots)} yer var, {num(summary.visible)} kayıt işaretli — fazlası ana
          sayfada çizilmez. Yer açmak için aşağıdan birini kapatın.
        </p>
      ) : null}

      <ul className="flex max-h-[18rem] flex-col gap-1 overflow-y-auto">
        {sorted.map((candidate) => {
          const on = values.featuredIds.includes(candidate.id);
          const isSubject = candidate.id === subjectId;
          return (
            <li
              key={candidate.id}
              className={`flex items-center gap-2 rounded-ops-btn px-2.5 py-1.5 ${
                isSubject ? 'border border-ops-olive-line bg-ops-olive-bg' : 'border border-transparent'
              } ${disabled ? 'opacity-60' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate font-ops-body text-ops-sm text-ops-body" title={candidate.name}>
                {candidate.name}
                {/* Pasif kayıt SÖYLENİR: işaretlense de müşteriye görünmeyecek ve sayaç onu ayrı
                    tutuyor — sebebi burada yazılmazsa sayacın neden oynamadığı anlaşılmaz. */}
                {!candidate.isActive ? <span className="ml-1.5 text-ops-xs text-ops-faint">· satışta değil</span> : null}
              </span>
              {isSubject ? (
                <span className="flex-none font-ops-body text-ops-micro font-semibold text-ops-olive-dark">
                  önerinin konusu
                </span>
              ) : null}
              {/* `Toggle` `disabled` TAŞIMIYOR (`BEKLEYEN(22.19)`) — `onChange`siz hâli zaten
                  tıklamayı yutmuyor ve dekoratif duruyor. Kilit görsel olarak da okunsun diye
                  satır soluklaştırılıyor; kontrol o borç kapanınca buraya taşınır. */}
              <Toggle
                size="sm"
                on={on}
                onChange={disabled ? undefined : (next) => toggle(candidate.id, next)}
                label="Vitrinde"
              />
            </li>
          );
        })}
      </ul>

      {/* Vitrin YAYIN DEĞİLDİR — önizlemedeki cümlenin aynısı, çünkü karar burada veriliyor ve
          uyarının kararın YANINDA durması gerekiyor. */}
      <span className="font-ops-body text-ops-xs text-ops-muted">
        Vitrin işareti yayın durumu değildir — {targetLabel} satışta değilse vitrine alınsa da müşteriye
        görünmez.
      </span>
    </div>
  );
}
