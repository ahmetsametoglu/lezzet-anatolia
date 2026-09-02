import { BottomSheet } from '@/components/ui/bottom-sheet';
import { OperationsKeypadPanel } from './keypad-panel';

/*
  PARA TUŞ TAKIMI (Operasyon Mobil v3 · `00-ortak`) — tutar CİHAZ KLAVYESİYLE yazılmaz.

  ── NİÇİN AYRI BİR TUŞ TAKIMI ───────────────────────────────────────────────
  Tasarımın kendi cümlesi ekranın altında yazılı: *"Cihaz klavyesi açılmaz — eldivenle de
  basılabilecek büyük tuşlar."* Bu bir üslup tercihi değil, sahanın şartı: kapıda ve rampada
  telefon eldivenle tutuluyor ve sistem klavyesinin tuşları o parmakla güvenilir basılmıyor.
  İkinci sebep: sistem klavyesi ekranın yarısını kaplayıp yazılan tutarı ve "beklenen"i görüş
  alanından çıkarıyordu — burada ikisi de tuşların ÜSTÜNDE durur.

  ── "BEKLENEN" BİR TUŞTUR, BİR ETİKET DEĞİL ─────────────────────────────────
  Motorun tutarı çipin içinde yazar ve dokunulunca alana geçer. En sık yapılan iş "beklenen kadar
  tahsil ettim"dir; onu elle yazdırmak, her teslimde beş tuş demekti.

  ── DEĞER SADECE ONAYLANINCA ÇIKAR ──────────────────────────────────────────
  Panel kendi taslağını tutar; çağıran ancak "Yaz"a basılınca haber alır. Her tuşta dışarı haber
  vermek, alanın altındaki hesapları (fark sütunu, CTA etiketi) yarım tutarlarla titretirdi.
*/

interface OperationsAmountKeypadProps {
  visible: boolean;
  /** Panelin üstündeki küçük başlık — hangi kasa/tutar yazılıyor ("NAKİT SAYIMI"). */
  title: string;
  /** Alanın açılış değeri (`"60,00"`); ilk rakam onu EZER. */
  value: string;
  /**
   * Motorun/kasanın beklediği tutar — çipe yazılır ve dokunulunca alana geçer. `null` ise çip
   * ÇİZİLMEZ: beklenen bilinmiyorsa uydurma bir sayı sunmak, kuryeye yanlış tutarı tek dokunuşla
   * yazdırmaktı.
   */
  expected: string | null;
  /** Çipin etiketi — "beklenen {amount}" gibi; i18n çağıranın işidir. */
  expectedLabel?: string;
  /**
   * Değerin YANINDA yazan birim — para için `€`, sayım için `adet`.
   *
   * Tuş takımı para için doğdu (21.159) ve birimi gömülüydü. Mal kabulün ADET kutusu da onu
   * açmalı (görsel ajanı ölçümü 30.08 · fark #1): tasarımın kendi cümlesi *"Cihaz klavyesi
   * açılmaz — eldivenle de basılabilecek büyük tuşlar"* diyor ve bu bir para kararı değil, bir
   * ELDİVEN kararı — depocunun eli de eldivenli.
   */
  unit: string;
  /**
   * Ondalık girilebilir mi. Para için EVET (`12,50`), ADET için HAYIR — yarım paket diye bir şey
   * yok ve virgül tuşunu açık bırakmak, kabul edilemeyecek bir değeri yazılabilir gösterirdi.
   */
  allowDecimals?: boolean;
  /** Tam sayı tavanı — aşacak tuş işlemez (`keypad-panel` künyesi). */
  max?: number;
  hint: string;
  footnote?: string;
  deleteLabel: string;
  /** CANLI kip (adet): her tuş çağırana gider, onay satırı yok — kapatmak yeter (kullanıcı 02.09). */
  onChange?: (text: string) => void;
  /** ONAYLI kip (para): değer ancak düğmeyle çıkar. */
  onConfirm?: (text: string) => void;
  confirmLabel?: string;
  onClose: () => void;
  testID?: string;
}

export function OperationsAmountKeypad({
  visible,
  title,
  value,
  expected,
  expectedLabel,
  unit,
  allowDecimals = true,
  max,
  hint,
  footnote,
  deleteLabel,
  onChange,
  onConfirm,
  confirmLabel,
  onClose,
  testID,
}: OperationsAmountKeypadProps) {
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} testID={testID}>
      <OperationsKeypadPanel
        value={value}
        expected={expected}
        expectedLabel={expectedLabel}
        unit={unit}
        allowDecimals={allowDecimals}
        max={max}
        hint={hint}
        footnote={footnote}
        deleteLabel={deleteLabel}
        onChange={onChange}
        onConfirm={onConfirm}
        confirmLabel={confirmLabel}
        /* Taslak her AÇILIŞTA sıfırlanır: çekmece kapalıyken de monte kalıyor ve bir önceki
           denemenin yarım kalan tutarı ikinci açılışta karşımıza çıkmamalı. */
        resetKey={visible}
        testID={testID}
      />
    </BottomSheet>
  );
}
