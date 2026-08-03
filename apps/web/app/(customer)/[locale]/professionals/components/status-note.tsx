import type { B2bApplicationStatus } from '@lezzet/domain-core';
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
 * **Ret GEREKÇESİ de görünmez** ve bu ayrı bir karar: gerekçe artık veride zorunlu
 * (`b2b_reject_reason`, DB kısıtı gerekçesiz reddi yazdırmıyor) ve müşteriye E-POSTAYLA gidiyor.
 * Sayfaya basılmıyor çünkü o metin operatörün karar kaydıdır — kuyruğu okuyan meslektaşı için
 * yazılmış bir cümle, adayın her ziyaretinde karşısına çıkacak bir yargı değil. Tasarımın kuralı
 * da bunu istiyor: *"reddedilen aday perakende müşteri olarak kalır; kırmızı/suçlayıcı dil
 * kullanılmaz"*.
 *
 * **Reddedilen adaya form YİNE ÇİZİLİR** (çağıran yalnız `approved`'da gizliyor) — kapı kapanmıyor:
 * künyesini düzeltip yeniden gönderdiğinde DB tetikleyicisi başvuru damgasını tazeliyor ve kayıt
 * kuyruğa dönüyor. Aynı künyeyi değiştirmeden göndermek ise yeni bir başvuru saymıyor; yani
 * "tekrar dene" düğmesi operatöre aynı kararı ikinci kez verdirmiyor.
 */
interface StatusNoteProps {
  t: Messages;
  status: B2bApplicationStatus;
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

export function StatusNote({ t, status, compact = false }: StatusNoteProps) {
  if (status === 'none') return null;

  const mark = MARK[status];
  return (
    <p
      className={[
        'rounded-soft font-sans font-semibold leading-relaxed',
        compact ? 'px-3.5 py-2.5 text-note' : 'px-4.5 py-3 text-body-sm',
        TONE[status],
      ].join(' ')}
    >
      {mark ? `${mark} ${t.status[status]}` : t.status[status]}
    </p>
  );
}
