import { agoLabel } from '@/components/operation/ui/format';
import type { HealthReasonView, HealthView, VerdictTone } from '../system-types';

/**
 * O20 · Hüküm şeridi — panelin girişindeki tek blok (18.5).
 *
 * **Ses seviyesi hükümle büyür ve bu bir süs değil.** Kritik hatada e-posta gitmiyor
 * (`OBSERVABILITY §4.1`), yani kötü durumu duyuracak tek şey bu bant: iyi hâl sakin beyaz kart,
 * uyarı amber çerçeve, kritik ve bayat **dolu alarm bandı** (nabız atan nokta). En sık görülecek hâl
 * "iyi" ve onun SAKİN görünmesi gerekiyor — sürekli dikkat isteyen bir panel, gerçekten dikkat
 * gerektiğinde dikkat çekmez.
 *
 * **Renk tek başına bilgi değildir:** gerekçe her zaman yazılır. Sebebi görünmeyen bir uyarı,
 * görmezden gelinen bir uyarıdır.
 *
 * **Ölçüm yaşı burada.** Toplama iki dakikada bir koşuyor; bayat bir görüntüyü canlı sanmak arızayı
 * gecikmeli görmek olur. Toplama durursa bu alan kendiliğinden söyler ve hüküm "izleme durdu"ya döner.
 */

interface BannerTheme {
  box: string;
  label: string;
  title: string;
  age: string;
  dot: string;
  pulse: boolean;
  /**
   * Başlık boyutu — hüküm ağırlaştıkça büyür: `display` (sakin) → `hero` (yüksek sesli).
   *
   * Eskiden ham üç kademeydi (28 → 34 → 40px) ve ölçeğin dışındaydı; merdiven yükselince yerinde
   * kaldı. Token'a bağlanınca `crit` ile `warn` aynı basamağa (`hero`) düştü ve bu bir kayıp değil:
   * kritik hâl zaten DOLU alarm bandı + nabız atan nokta ile ayrışıyor, boyut üçüncü bir kopya
   * sinyaldi. Ayrım hâlâ iki yerden okunuyor, sadece üçüncüsü tekrar etmiyor.
   */
  titleSize: string;
  pad: string;
}

const THEME: Record<VerdictTone, BannerTheme> = {
  ok: {
    box: 'border border-ops-gray-300 bg-ops-card',
    label: 'text-ops-muted',
    title: 'text-ops-ink',
    age: 'text-ops-body',
    dot: 'bg-ops-olive-light',
    pulse: false,
    titleSize: 'text-ops-display',
    pad: 'px-[22px] py-[18px]',
  },
  warn: {
    box: 'border-[1.5px] border-ops-amber-line bg-ops-amber-bg',
    label: 'text-ops-amber',
    title: 'text-ops-amber-dark',
    age: 'text-ops-amber',
    dot: 'bg-ops-amber-dot',
    pulse: false,
    titleSize: 'text-ops-hero',
    pad: 'px-[22px] py-5',
  },
  crit: {
    box: 'border border-ops-alarm bg-ops-alarm',
    label: 'text-ops-alarm-muted',
    title: 'text-ops-alarm-ink',
    age: 'text-ops-alarm-muted',
    dot: 'bg-ops-alarm-dot',
    pulse: true,
    titleSize: 'text-ops-hero',
    pad: 'px-6 py-[22px]',
  },
  stale: {
    box: 'border border-ops-alarm bg-ops-alarm',
    label: 'text-ops-alarm-muted',
    title: 'text-ops-alarm-ink',
    age: 'text-ops-alarm-muted',
    dot: 'bg-ops-alarm-dot',
    pulse: true,
    titleSize: 'text-ops-hero',
    pad: 'px-6 py-[22px]',
  },
};

/** Gerekçe kutusunun kabuğu. Alarm bandının İÇİNDE hepsi aynı görünür — koyu zeminde amber okunmaz. */
function reasonBox(tone: HealthReasonView['tone'], loud: boolean): { box: string; tag: string; text: string } {
  if (loud) {
    return {
      box: 'border border-ops-alarm-inset-line bg-ops-alarm-inset',
      tag: 'bg-ops-alarm-inset text-ops-alarm-ink',
      text: 'text-ops-alarm-ink',
    };
  }
  if (tone === 'unknown') {
    // Ölçüm boşluğu NÖTR çizilir: amber boyanırsa okuyan onu arıza sanır, oysa haber tam olarak
    // arıza OLMADIĞIDIR — "göremiyorum" ile "bozuk" aynı şey değil.
    return { box: 'border border-ops-gray-300 bg-ops-white', tag: 'bg-ops-gray-100 text-ops-body', text: 'text-ops-strong' };
  }
  return { box: 'border border-ops-amber-line bg-ops-white', tag: 'bg-ops-amber-bg text-ops-amber', text: 'text-ops-amber-dark' };
}

interface VerdictBannerProps {
  health: HealthView;
  /** Ölçüm yaşı istemcide ilerler — sunucudan gelen sayı donmuştur. */
  ageMinutes: number;
  compact?: boolean;
}

export function VerdictBanner({ health, ageMinutes, compact = false }: VerdictBannerProps) {
  const t = THEME[health.tone];
  const loud = health.tone === 'crit' || health.tone === 'stale';
  const reasons = compact ? health.reasons.slice(0, 3) : health.reasons;
  const gizlenen = health.reasons.length - reasons.length;

  return (
    <div className={`flex flex-wrap items-start gap-[26px] rounded-[12px] ${t.box} ${compact ? 'gap-3 p-3.5' : t.pad}`}>
      <div className={`flex flex-col gap-1.5 ${compact ? 'w-full' : 'min-w-[210px]'}`}>
        <span className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${t.dot} ${t.pulse ? 'animate-pulse' : ''}`} aria-hidden="true" />
          <span className={`font-ops-display text-ops-micro font-semibold uppercase tracking-[0.16em] ${t.label}`}>
            {/* Bayat ölçümde etiket "Hüküm" DEMEZ: söylenen şey hükümden başka — aşağıdaki değerlere
                güvenilemeyeceği. Aynı kelimeyle iki farklı haber verilmez. */}
            {health.stale ? 'Ölçüm akmıyor' : 'Hüküm'}
          </span>
        </span>
        <span className={`font-ops-display font-bold leading-[1.05] tracking-[-0.02em] ${t.title} ${compact ? 'text-ops-title' : t.titleSize}`}>
          {health.title}
        </span>
        <span className={`font-ops-mono text-ops-sm font-medium ${t.age}`}>{agoLabel(ageMinutes)} ölçüldü</span>
      </div>

      <div className={`flex flex-col gap-2.5 ${compact ? 'w-full' : 'min-w-[260px] flex-1'}`}>
        {!compact ? (
          <span className={`font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] ${t.label}`}>
            {health.reasons.length === 0
              ? 'Gerekçe'
              : health.stale
                ? 'Neden arıza sayılıyor'
                : health.tone === 'crit'
                  ? 'Neden kritik'
                  : 'Hangi koşul tuttu'}
          </span>
        ) : null}

        {reasons.length > 0 ? (
          <div className="flex flex-col gap-[7px]">
            {reasons.map((r) => {
              const rb = reasonBox(r.tone, loud);
              return (
                <div key={r.code} className={`flex items-start gap-2.5 rounded-[8px] px-3 py-2.5 ${rb.box}`}>
                  <span className={`flex-none rounded-[5px] px-1.5 py-[3px] font-ops-display text-ops-micro font-semibold uppercase tracking-[0.08em] ${rb.tag}`}>
                    {r.tag}
                  </span>
                  <span className={`font-ops-body text-ops-sm font-medium leading-[1.5] ${rb.text}`}>{r.text}</span>
                </div>
              );
            })}
            {gizlenen > 0 ? (
              // Kırpılan gerekçe SESSİZ GEÇMEZ: üç satır gösterip gerisini yutmak, telefonda bakan
              // kişiye "hepsi bu" demek olurdu.
              <span className={`font-ops-body text-ops-xs ${loud ? 'text-ops-alarm-muted' : 'text-ops-muted'}`}>
                +{gizlenen} gerekçe daha — masaüstünde tamamı görünür.
              </span>
            ) : null}
          </div>
        ) : (
          <span className="font-ops-body text-ops-base leading-[1.6] text-ops-strong">{health.summary}</span>
        )}
      </div>
    </div>
  );
}
