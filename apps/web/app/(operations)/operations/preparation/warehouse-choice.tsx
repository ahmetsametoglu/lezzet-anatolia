'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/operation/ui/page-header';
import { WarehouseIcon } from '@/components/operation/ui/icons';
import { num } from '@/components/operation/ui/format';
// **Takma yol, göreli değil** ve emsali `warehouse-context-picker`: `operations/actions.ts` bir
// kardeş SAYFA değil, kabuğun kendi eylem dosyası (künyesi: *"tek bir sayfaya ait olmayan,
// sidebar'dan çağrılanlar"*). Göreli yazım `docs:check`in sayfa-sınırı kuralına takılıyor — kural
// haklı, hedef yanlış tanınıyordu; takma yol hem geçer hem ne olduğunu söyler.
import { setWarehouseContextAction } from '@/app/(operations)/operations/actions';
import { LANE_LABELS } from './preparation-labels';
import type { WarehouseChoiceView } from './preparation-types';

/**
 * **Depo seçim kartları** (10.8, kullanıcı isteği 19.08) — boş kapı ekranının yerine.
 *
 * ── NE DEĞİŞTİ VE NEDEN ─────────────────────────────────────────────────────
 * Burası bir DUVARDI: koca bir alan, tek cümle ("Önce depo seçin") ve çıkış yolu başka bir yerde
 * (üst bardaki seçici). Kural doğruydu — **varsayılan depo yoktur** — ama ekran o kuralı bir engel
 * gibi uyguluyordu. Depo seçmek bir engel değil, bu sayfanın İLK ADIMIdır.
 *
 * Kartlar o adımı ekranın içine alıyor **ve seçimi bilgiyle besliyor**: operatör hangi depoda iş
 * olduğunu GÖREREK seçiyor, adını hatırlayarak değil. Kural bozulmuyor — hiçbir kart önceden
 * seçili değil, hiçbiri "önerilen" diye işaretli değil; sistem hâlâ onun yerine karar vermiyor.
 *
 * ── ÜÇ SAYI, ÜÇÜ DE HAZIRLIĞIN SORUSU ───────────────────────────────────────
 * Bugün · kargo · geciken. Para, ciro, stok değeri burada YOK — rol duvarı (`design/pages/
 * depo-hazirlik.md §6`) seçim ekranında da geçerli; okuma o alanları hiç getirmiyor.
 *
 * **Geciken sayısı vurgulu**, çünkü tek başına bir karardır: dünün hazırlanmamış siparişi bugünün
 * işinin önüne geçer. Sıfırsa hiç çizilmiyor — sıfır bir uyarı değildir ve her kartta duran bir
 * "0 geciken", gerçek gecikmeyi görünmez yapardı.
 */
export function WarehouseChoice({ choices }: { choices: readonly WarehouseChoiceView[] }) {
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
    <>
      <PageHeader title="Hazırlık" subtitle="Çalıştığınız depoyu seçin — kuyruk o deponun işidir" />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {error ? (
          <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {choices.map((choice) => (
            <ChoiceCard key={choice.id} choice={choice} busy={busy} pending={pending === choice.id} onPick={() => pick(choice)} />
          ))}
        </div>

        <p className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">
          Seçim hatırlanır — sonraki girişlerde doğrudan o deponun kuyruğu açılır. Üst bardaki depo
          seçicisinden her an değiştirebilirsiniz.
        </p>
      </div>
    </>
  );
}

function ChoiceCard({
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
  const total = choice.today + choice.shipping + choice.overdue;

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      className={`flex cursor-pointer flex-col gap-3 rounded-ops-card border px-4 py-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        choice.overdue > 0 ? 'border-ops-amber-line bg-ops-amber-bg/40' : 'border-ops-line bg-ops-card'
      } hover:border-ops-olive`}
    >
      <span className="flex items-center gap-2">
        <span className="text-ops-faint">
          <WarehouseIcon size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate font-ops-display text-ops-lead font-semibold text-ops-ink">{choice.name}</span>
        <span className="shrink-0 font-ops-mono text-ops-xs text-ops-muted">{choice.code}</span>
      </span>

      {total === 0 ? (
        // Boş hâl bir SONUÇTUR, bir eksiklik değil: bekleyen iş yoksa bu iyi haberdir ve öyle
        // yazılıyor. Üç sıfır çizmek, olmayan bir işi varmış gibi göstermenin sessiz yoluydu.
        <span className="font-ops-body text-ops-sm text-ops-muted">Bekleyen hazırlık yok</span>
      ) : (
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
          <Sayac value={choice.today} label={LANE_LABELS.today} tone="ink" />
          {choice.shipping > 0 ? <Sayac value={choice.shipping} label={LANE_LABELS.shipping} tone="ink" /> : null}
          {choice.overdue > 0 ? <Sayac value={choice.overdue} label={LANE_LABELS.overdue} tone="amber" /> : null}
        </span>
      )}

      <span className="font-ops-body text-ops-xs text-ops-muted">{pending ? 'Açılıyor…' : 'Bu depoda çalış'}</span>
    </button>
  );
}

/** Sayı ÖNDE, etiket altında: kart bir bakışta okunur ve göz sayıları yan yana tarayabilir. */
function Sayac({ value, label, tone }: { value: number; label: string; tone: 'ink' | 'amber' }) {
  return (
    <span className="flex flex-col">
      <span className={`font-ops-display text-ops-section font-semibold ${tone === 'amber' ? 'text-ops-amber-dark' : 'text-ops-ink'}`}>
        {num(value)}
      </span>
      <span className="font-ops-body text-ops-micro text-ops-muted">{label}</span>
    </span>
  );
}
