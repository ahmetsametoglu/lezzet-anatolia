'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/operation/ui/badge';
import { PageHeader } from '@/components/operation/ui/page-header';
import { ScoreTile } from '@/components/operation/ui/score-tile';
import { SectionHead, SetupGapNote } from '@/components/operation/ui/section-head';
import { num } from '@/components/operation/ui/format';
// **Takma yol, göreli değil** ve emsali `warehouse-context-picker`: `operations/actions.ts` bir
// kardeş SAYFA değil, kabuğun kendi eylem dosyası (künyesi: *"tek bir sayfaya ait olmayan,
// sidebar'dan çağrılanlar"*). Göreli yazım `docs:check`in sayfa-sınırı kuralına takılıyor — kural
// haklı, hedef yanlış tanınıyordu; takma yol hem geçer hem ne olduğunu söyler.
import { setWarehouseContextAction } from '@/app/(operations)/operations/actions';
import { LANE_LABELS, laneTone, workSummary } from './preparation-labels';
import type { WarehouseChoiceView, WarehouseWorkData } from './preparation-types';

/**
 * **Depo seçim ekranı** (10.8, yeniden kurgulandı 19.08 — kullanıcı kararı).
 *
 * ── ÖNCEKİ HÂL NEDEN BOZUKTU ────────────────────────────────────────────────
 * İlk hâli küçük bir kart ızgarasıydı ve üç kusuru vardı (ölçüldü, ekran görüntüsüyle):
 *
 * 1. **Yanlış yüzey.** Çıplak bir parça dönüyordu, yani kabuğun bej zemininde kalıyordu; oysa dolu
 *    kuyruk ekranı kendi beyaz tuvalini çiziyor. Aynı sayfanın iki hâli iki ayrı uygulama gibi
 *    görünüyordu. Karanlık modda daha da kötüydü: `bg-ops-card` ile `bg-ops-bg` orada neredeyse
 *    aynı ton ve kartların sınırı kayboluyordu.
 * 2. **Üçüncü bir desen.** "Hangi tesis ve her biri nasıl duruyor" sorusunu Depolar ekranı zaten
 *    çözmüştü (kullanıcı kararı 16.08): tesis şeridi + karne kutuları. Izgara aynı soruya üçüncü
 *    bir görsel dil uyduruyordu.
 * 3. **Bilgi taşımıyordu.** Karne kutusunun sözleşmesi etiket + iri sayı + **açıklayıcı not** +
 *    ton; ızgaranınki sayı + tek kelimeydi. Ekranın %80'i boştu.
 *
 * ── BUGÜNKÜ HÂL ─────────────────────────────────────────────────────────────
 * Beyaz tuval + depo başına **tam genişlik satır**. Satırın içi Depolar sayfasının parçaları:
 * künye (kod · ad · durum rozeti) → künye cümlesi (`DaySummary` deseni: nokta ayraçlı gerçekler)
 * → **karne kutuları** (`ScoreTile`) → kurulum engeli (`SetupGapNote`). Yeni görsel dil YOK.
 *
 * ── KURAL YERİNDE ───────────────────────────────────────────────────────────
 * **Varsayılan depo yoktur:** hiçbir satır önceden seçili değil, hiçbiri "önerilen" diye işaretli
 * değil, sıralama sabit (operatörün Depolar'da dizdiği sıra). Sistem onun yerine karar vermiyor —
 * yalnız kararı besliyor.
 *
 * **Para bu ekrandan geçmez:** ciro, stok değeri, maliyet yok; okuma o alanları hiç getirmiyor
 * (rol duvarı, `design/pages/depo-hazirlik.md §6`).
 */
export function WarehouseChoice({ data }: { data: WarehouseWorkData<WarehouseChoiceView> }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const pick = (choice: WarehouseChoiceView) => {
    setError(null);
    setPending(choice.id);
    startTransition(async () => {
      const { error: failed } = await setWarehouseContextAction(choice.id);
      if (failed) {
        setError(failed);
        setPending(null);
        return;
      }
      // Bağlam BÜTÜN yüzeyin durumu (`operations/actions.ts`): eylem layout'u tazeliyor, burada
      // yalnız bu sayfanın yeniden okunması kalıyor.
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Hazırlık" subtitle="Çalıştığınız depoyu seçin — kuyruk o deponun işidir" />

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 py-[18px]">
        {error ? (
          <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
            {error}
          </p>
        ) : null}

        <SectionHead
          title="Depolar"
          hint="hangisinde iş olduğunu görerek seçin — satıra tıklayın, o deponun kuyruğu açılır"
          aside={
            data.truncated ? (
              // Sessiz kırpma YOK (`CLAUDE §1`): tarama tavanına dayanıldıysa sayılar eksiktir ve
              // ekran bunu söyler. Eksik bir sayıyı tam gibi göstermek, operatöre olmayan bir
              // boşluğu doğrulatmaktı.
              <Badge tone="amber">Sayılar eksik — bekleyen iş tarama tavanını aştı</Badge>
            ) : undefined
          }
        />

        <div className="flex flex-col gap-2.5">
          {data.rows.map((choice) => (
            <ChoiceRow key={choice.id} choice={choice} busy={busy} pending={pending === choice.id} onPick={() => pick(choice)} />
          ))}
        </div>

        <p className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">
          Seçim hatırlanır — sonraki girişlerde doğrudan o deponun kuyruğu açılır. Depoyu her an
          değiştirebilirsiniz: kuyruk ekranında tesisler başlığın altındaki şeritte durur.
        </p>
      </div>
    </div>
  );
}

/**
 * Tek deponun satırı — **tuvalden bir kademe çukur** (`bg-ops-subtle`), içindeki karne kutuları
 * beyaz. Katmanlama böyle kuruluyor: kutuların kendi zemini var, satır onları taşıyan yüzey.
 * Kutuları doğrudan beyaz tuvale koysaydık satırın nerede bitip başladığı okunmazdı.
 *
 * Satırın TAMAMI düğme — köşesindeki küçük bir bağlantı değil. Bu ekranda yapılacak tek iş depo
 * seçmek ve satırın her yeri o işi yapıyor.
 */
function ChoiceRow({
  choice,
  busy,
  pending,
  onPick,
}: {
  choice: WarehouseChoiceView;
  busy: boolean;
  pending: boolean;
  onPick: () => void;
}) {
  const total = choice.overdue + choice.today + choice.shipping;

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      aria-busy={pending || undefined}
      className={[
        'flex cursor-pointer flex-col gap-3 rounded-ops-card border bg-ops-subtle px-4 py-3.5 text-left transition-colors',
        'hover:border-ops-olive disabled:cursor-not-allowed disabled:opacity-60',
        // Geciken iş satırın KENDİSİNİ de işaretler: operatör listeyi tararken önce satırları
        // görüyor. Ama satır AMBER, kutu KIRMIZI ve bu ayrım kasıtlı — satır *"buraya bak"* der
        // (dikkat), kutu *"sebebi bu"* der (gecikme). Satırı da kırmızı yapmak, işi geciken bir
        // depoyu bozuk bir depo gibi göstermek olurdu; tesiste bir arıza yok, bir işi sarkmış.
        choice.overdue > 0 ? 'border-ops-amber-line' : 'border-ops-line',
      ].join(' ')}
    >
      {/* ── Künye ── kod · ad · durum. Depolar şeridindeki `FacilityChip` ile aynı sıra. */}
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="font-ops-mono text-ops-sm font-semibold text-ops-ink">{choice.code}</span>
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{choice.name}</span>
        {choice.setupGap ? <Badge tone="amber">Kurulumu eksik</Badge> : null}
        <span className="flex-1" />
        <span className="font-ops-body text-ops-sm text-ops-olive-dark">
          {pending ? 'Açılıyor…' : 'Bu depoda çalış →'}
        </span>
      </span>

      {/* ── Künye cümlesi ── Sevkiyat'ın `DaySummary` deseni: nokta ayraçlı gerçekler, tek satır.
          Sayılar kutularda; buradaki cümle onların TOPLAMINI ve ağırlığını söylüyor. İş yoksa
          `workSummary` bunu kendisi söylüyor — boş hâlin ayrı bir cümlesi YOK (vardı ve aynı
          satırı iki kez yazdırıyordu, ekranda görüldü). */}
      <span className="font-ops-body text-ops-sm text-ops-body">{workSummary(choice)}</span>

      {/* Kutular yalnız iş VARKEN. Dört sıfır kutu çizmek, olmayan bir işi varmış gibi göstermenin
          sessiz yoluydu; sıfırın SEBEBİNİ ise aşağıdaki kurulum notu söylüyor — kurulumu eksik bir
          depoda sıfır, işin bitmiş olması değil hiç yapılamaması demek. */}
      {total > 0 ? (
        <span className="grid grid-cols-4 gap-2.5">
          <ScoreTile
            label={LANE_LABELS.overdue}
            value={num(choice.overdue)}
            // Gecikmenin YAŞI notta: "2 geciken" iki farklı günü tarif edebilir, "en eskisi 3
            // gündür bekliyor" tek bir günü tarif eder — kararı veren o.
            note={choice.overdueOldestDays === null ? 'gecikmiş iş yok' : `en eskisi ${choice.overdueOldestDays} gündür bekliyor`}
            tone={laneTone('overdue', choice.overdue)}
          />
          <ScoreTile label={LANE_LABELS.today} value={num(choice.today)} note="bugün teslim edilecek" tone={laneTone('today', choice.today)} />
          <ScoreTile
            label={LANE_LABELS.shipping}
            value={num(choice.shipping)}
            note="teslim günü yok, sıraya göre"
            tone={laneTone('shipping', choice.shipping)}
          />
          <ScoreTile
            label="yarım kalan"
            value={num(choice.inProgress)}
            note={choice.inProgress > 0 ? 'biri başlamış, bırakmış' : 'yarım kalan iş yok'}
            tone={laneTone('inProgress', choice.inProgress)}
          />
        </span>
      ) : null}

      {/* Kurulum engeli EN ALTTA ve satırın içinde: seçmeden önce okunması gereken son cümle.
          Depolar sayfasının hesabı, birebir aynı kutu (`@/lib/warehouse/setup-gap`). */}
      {choice.setupGap ? <SetupGapNote text={choice.setupGap} /> : null}
    </button>
  );
}
