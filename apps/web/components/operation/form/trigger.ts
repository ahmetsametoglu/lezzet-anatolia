/**
 * Açılır seçicilerin TETİKLEYİCİ görünümü — `Select` ve `Combobox` ortak zemini.
 *
 * İkisi de aynı iki biçimi taşıyor: form içindeki `field` (kutulu, tam genişlik) ve süzgeç
 * şeridindeki `chip` (kesikli çerçeve, yuvarlak uç). Sınıflar iki dosyada ayrı ayrı dururken
 * `Combobox` çip biçimini hiç almamıştı ve alması onları kopyalamak olurdu; kopya iki kutunun
 * zamanla ayrışmasıyla biterdi — süzgeç şeridinde yan yana duran iki çip farklı yükseklikte.
 */
import { CONTROL_H } from '../ui/control';

/** `cell` (13.09) — tablo hücresindeki seçici: satır yüksekliğine uyar (bkz. `CELL_BASE`). */
export type TriggerVariant = 'field' | 'chip' | 'cell';

/**
 * Dolu çipin rengi — ANLAM taşır, süs değil.
 *
 * `olive` karar rengidir: "şu duruma göre süz" bir seçimdir. `blue` ise bilgi rengidir ve bakış
 * daraltmalarına ayrılmıştır — depo süzgeci bir karar değil, aynı veriye daha dar bakmaktır. İkisi
 * aynı renkte olsaydı operatör depoyu da bir durum süzgeci sanardı; oysa depo, sayaçları ve özet
 * kartları DEĞİŞTİRMEZ (bkz. depo ekseni sözleşmesi, kural 5).
 */
export type TriggerTone = 'olive' | 'blue';

interface TriggerState {
  variant: TriggerVariant;
  /** Menü açık — `field` biçiminde çerçeve olive'e döner. */
  open?: boolean;
  /** Bir değer seçili — `chip` biçiminde kesikli davetiye dolu hâle geçer. */
  filled?: boolean;
  disabled?: boolean;
  tone?: TriggerTone;
  /**
   * Boş hâl bir DAVET mi? Kesikli çerçeve "buraya bir süzgeç ekleyebilirsin" der ("+ kategori") ve
   * yalnız gerçekten boş kalabilen çipe yakışır. Daima bir değer taşıyan çipte ("Depo: tümü") boş
   * diye bir hâl yoktur — orada kesikli çerçeve olmayan bir eksikliği ima eder.
   */
  invite?: boolean;
}

const CHIP_FILLED: Record<TriggerTone, string> = {
  olive: 'border-solid border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark',
  blue: 'border-solid border-ops-blue-line bg-ops-blue-bg text-ops-blue-dark',
};

// Yükseklik ORTAK (`CONTROL_H`): tetikleyici bir form alanı hizasında (`md`) ya da bir süzgeç çipi
// hizasında (`sm`) durur — ikisi de kendi dikey dolgusunu uydurmaz. Çipin `md`den küçük olması
// bilinçli: süzgeç şeridi bir araç çubuğudur, kararın kendisi değil.
const FIELD_BASE =
  `flex w-full cursor-pointer items-center justify-between gap-3 rounded-ops-card border bg-ops-white px-[13px] font-ops-body text-ops-base font-medium outline-none transition-colors ${CONTROL_H.md}`;

const CHIP_BASE =
  `flex cursor-pointer items-center gap-1.5 rounded-ops-chip border px-3 font-ops-body text-ops-sm font-medium outline-none transition-colors ${CONTROL_H.sm}`;

// TABLO HÜCRESİ (13.09, Para defteri): satırın ortasındaki tür/cari seçicisi satır yüksekliğine
// uyar — `StepButton`ın (26px) ve `Chip` `cell` ölçüsünün gerekçesi. Bar ölçüsü (32px) satırı
// şişirirdi. Genişlik hücreye bağlı: uzun ad kesilir, hücreyi taşırmaz.
const CELL_BASE =
  'inline-flex h-6 min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-ops-chip border px-2 font-ops-body text-ops-xs font-medium outline-none transition-colors';

/** Çip biçimindeki seçicinin menü genişliği — çip dar, menü içeriğe yeter. */
export const CHIP_MENU_WIDTH = 220;

export function triggerClass({
  variant,
  open = false,
  filled = false,
  disabled = false,
  tone = 'olive',
  invite = true,
}: TriggerState): string {
  const parts =
    variant !== 'field'
      ? [
          variant === 'cell' ? CELL_BASE : CHIP_BASE,
          filled
            ? CHIP_FILLED[tone]
            : invite
              ? 'border-dashed border-ops-gray-500 text-ops-body hover:border-ops-olive'
              : 'border-solid border-ops-line-strong text-ops-body hover:border-ops-olive',
        ]
      : [
          FIELD_BASE,
          open ? 'border-[1.5px] border-ops-olive' : 'border border-ops-line-strong hover:border-ops-olive',
          filled ? 'text-ops-ink' : 'text-ops-faint',
        ];
  return [...parts, disabled ? 'cursor-not-allowed opacity-60' : ''].filter(Boolean).join(' ');
}
