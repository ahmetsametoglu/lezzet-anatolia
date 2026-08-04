import type { B2bApplicationStatus } from '@lezzet/domain-core';
import { TranslationNote } from '@/components/customer/ui/translation-note';
import type { Messages } from '../professionals-types';

/**
 * Başvurunun DURUM satırı — tasarımın "sonuç halleri (girişte görünür)" kutusu, üç hâli de.
 *
 * Girişsiz ziyaretçide hiç çizilmez (`none`): olmayan bir başvurunun durumu yoktur ve boş bir
 * kutu, formun üstünde açıklanmamış bir alan bırakırdı.
 *
 * **İç ölçütler GÖRÜNMEZ** (tasarım §6): aday "inceleniyor" görür, faaliyet kodu uyumunu ya da
 * rota eşleşmesini değil. Onay kartının sinyalleri operasyona aittir.
 *
 * **Ret GEREKÇESİ ARTIK GÖRÜNÜR (04.08) — eski karar ölçümle çürüdü.** Buradaki not bir süre şöyle
 * diyordu: *"gerekçe sayfaya basılmıyor çünkü müşteriye E-POSTAYLA gidiyor."* Ölçtüm: **öyle bir
 * e-posta yok.** `packages/email/src/templates/` altında sipariş, OTP, geri bildirim ve talep
 * şablonları var; B2B reddi yok. Yani gerekçe veride zorunlu (`b2b_reject_reason`, DB kısıtı
 * gerekçesiz reddi yazdırmıyor), 20.2 onu üç dile çeviriyor — ve **hiçbir okuyucuya ulaşmıyor.**
 *
 * Eski kararın ikinci ayağı ("o metin operatörün karar kaydıdır, adayın her ziyaretinde karşısına
 * çıkacak bir yargı değil") kendi başına doğru ama tek başına yetmiyor: seçenek "her ziyarette
 * görmek" ile "bir kez e-postayla öğrenmek" arasında değilmiş, "görmek" ile **hiç öğrenmemek**
 * arasındaymış. Sebebini bilmeyen aday aynı eksikle yeniden başvurur ve aynı kuyruğu ikinci kez
 * meşgul eder (arka uç şeridinin talebi, 04.08).
 *
 * Tasarımın kuralı korunuyor — *"reddedilen aday perakende müşteri olarak kalır; kırmızı/suçlayıcı
 * dil kullanılmaz"*: gerekçe `closed` ailesinin kendi kutusunda, işaretsiz ve nötr bir başlıkla
 * duruyor. E-posta bir gün yazılırsa (14) bu blok yine kalır: e-posta bir kez gelir, sayfa ise
 * adayın künyesini düzeltirken bakabileceği yerdir.
 *
 * **Reddedilen adaya form YİNE ÇİZİLİR** (çağıran yalnız `approved`'da gizliyor) — kapı kapanmıyor:
 * künyesini düzeltip yeniden gönderdiğinde DB tetikleyicisi başvuru damgasını tazeliyor ve kayıt
 * kuyruğa dönüyor. Aynı künyeyi değiştirmeden göndermek ise yeni bir başvuru saymıyor; yani
 * "tekrar dene" düğmesi operatöre aynı kararı ikinci kez verdirmiyor.
 */
interface StatusNoteProps {
  t: Messages;
  status: B2bApplicationStatus;
  /** Reddin gerekçesi, başvuru sahibinin dilinde; yoksa `null` (bkz. `ProfessionalsViewProps`). */
  rejection: { reason: string; translated: boolean } | null;
  compact?: boolean;
}

/**
 * Ton HÂLE göre, üçü de tasarımın kutularından.
 *
 * **Ret için terracotta (hata rengi) KULLANILMADI**, `closed` ailesi seçildi: reddedilmiş bir
 * başvuru bir arıza değil, sonuçlanmış bir karar. Kırmızı bir şerit, müşteriye düzeltmesi gereken
 * bir hata yapmış gibi okunur — oysa yapması gereken tek şey künyesini gözden geçirmek ya da
 * perakende alışverişe devam etmek. Aynı gerekçeyle bekleyen hâl de balda: sırasını bekleyen bir
 * başvuru uyarı değildir.
 */
const TONE: Record<Exclude<B2bApplicationStatus, 'none'>, string> = {
  pending: 'bg-honey-bg text-honey',
  approved: 'bg-olive-bg text-olive-dark',
  rejected: 'bg-closed-bg text-closed',
};

const MARK: Record<Exclude<B2bApplicationStatus, 'none'>, string> = {
  pending: '⏳',
  approved: '✓',
  // Reddedilen hâlde işaret YOK: ✕ ya da ⚠ suçlayıcı okunur, boş bırakmak cümleyi cümle bırakır.
  rejected: '',
};

export function StatusNote({ t, status, rejection, compact = false }: StatusNoteProps) {
  if (status === 'none') return null;

  const mark = MARK[status];
  // Gerekçe YALNIZ ret hâlinde: onaylanmış bir kayıtta eski bir gerekçe dursa bile göstermek,
  // sonuçlanmış bir kararın üstüne kapanmış bir tartışmayı yeniden açmak olurdu.
  const reason = status === 'rejected' ? rejection : null;

  return (
    <div
      className={[
        'flex flex-col gap-2 rounded-soft font-sans leading-relaxed',
        compact ? 'px-3.5 py-2.5 text-note' : 'px-4.5 py-3 text-body-sm',
        TONE[status],
      ].join(' ')}
    >
      <p className="font-semibold">{mark ? `${mark} ${t.status[status]}` : t.status[status]}</p>

      {reason && (
        <>
          {/* Başlık, gerekçeyi durum cümlesinden AYIRIR: ikisi bitişik yazılsaydı operatörün
              yazdığı cümle bizim standart metnimizin devamı gibi okunurdu. */}
          <p className="font-semibold opacity-80">{t.rejectReasonTitle}</p>
          <p>{reason.reason}</p>
          {reason.translated && <TranslationNote badge={t.translation.badge} />}
        </>
      )}
    </div>
  );
}
