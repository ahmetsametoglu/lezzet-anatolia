import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';
import { Icon } from './icon';
import type { IconName } from './icon-paths';
import { PressableSurface } from './pressable-surface';

/*
  BİRİNCİL DÜĞME — v3'te ~22 (müşteri) + ~23 (operasyon) kullanım. İki biçim:
  · `block`  — tam genişlik, 52 dp, kontrol yarıçapı; basılıda `translate(2,2)` (gölgeliyse)
  · `pill`   — içerik genişliği, hap yarıçapı, gölgesiz; basılıda `scale(.97)`
  Ayrım Token Kararlari #8'in kendisidir: gölgeli yüzey kayar, gölgesiz yüzey küçülür.

  ENGELLİ durum tasarımın kendi çözümü: dolgu `disabled-fill`, metin `disabled-text`, gölge YOK
  — gölgesiz bir yüzey "basılabilir" görünmez, engelliliğin görsel karşılığı da budur.

  ── NİÇİN TEK DÜĞME, İKİ YÜZEY (ölçüldü 30.08) ──────────────────────────────
  Müşteri ve operasyon tasarımları ayrı çizildi ama AYNI dilde: aynı yazı çifti (Karla + Lora),
  aynı zeytin (#5f7a2c), aynı `1.5px` çerçeve dilbilgisi, aynı 52 dp düğme boyu. Renk katmanında
  da ölçüldü — 51 ortak durağın yalnız 2'sinin değeri farklı. Yani ikinci bir düğme komponenti
  açmak, aynı şeyi ikinci kez yazmak olurdu (CLAUDE §1). Fark DİL değil TON ve YÜKSELTİDİR, ikisi
  de burada prop.
*/

/**
 * DOLGU TONU — rol seçilir, renk değil.
 *
 * · `olive` (varsayılan) — akışı İLERLETEN eylem. Müşteri yüzeyinin tek tonu; operasyonda
 *   okutma/başlatma düğmeleri ("Kutuyu okut", "Seferi başlat").
 * · `ink` — KARARLI ama nötr eylem: operasyonda "Tekrar dene", "Para bölümüne geç",
 *   "Seferi kapat". Tasarımda 11 kez geçiyor ve zeytinden ayrı bir şey söylüyor: bu düğme
 *   akışı ilerletmiyor, bir kararı uyguluyor.
 * · `error` — GERİ ALINAMAYAN olumsuz kayıt: kuryenin "Onayla — kaydet"i (ulaşılamadı ve kabul
 *   etmedi çekmecelerinde, `00-ortak:492` ve `:513`). Zeytin "ilerlet", mürekkep "uygula" der;
 *   bu ton "bu durak olumsuz kapanıyor" der ve rengi kararın kendisidir. Kit turunda AÇILMAMIŞTI
 *   ve sonucu görüldü: durak ekranı iki düğmeyi de elden çizdi (kurye şeridinin bulgusu 30.08).
 */
type ButtonTone = 'olive' | 'ink' | 'error';

/**
 * YÜZEYİN YÜKSELTİSİ — hangi evrende olduğunun görsel karşılığı.
 *
 * · `shadow` (varsayılan) — müşteri evreninin imzası: `3px 3px 0` sert gölge, basılıda kayar.
 * · `flat`   — operasyon mobil v3: **sert gölge yok** (ölçüldü — v2'de 3 kullanım, v3'te sıfır),
 *   basılıda küçülür. Varsayılan yapılmadı: 35 müşteri ekranı bugün gölgeli ve öyle kalmalı.
 * · `glow`   — v3'ün tek yumuşak yükseltisi: `0 4px 14px` zeytin ışıma.
 *
 * ── IŞIMA BURAYA TAŞINDI (kurye şeridinin ölçümü, doğrulandı 30.08) ─────────
 * Kitin ilk turunda ışıma `OperationsStickyBar`a konmuştu ve gerekçesi *"ışıma bir düğme süsü
 * değil bir KONUM işareti — bu düğme sayfanın üstünde yüzüyor"* diye yazılmıştı. **İddia
 * ölçülmemişti ve yanlıştı.** Türetilmiş şablonda dört ışımalı düğmenin ebeveyni tarandı:
 *
 *     02 · toplama kuyruğu   `margin:0 20px`        AKIŞTA
 *     16 · araca yükleme     `margin:12px 20px 0`   AKIŞTA
 *     19 · kargo devri       `margin:0 20px`        AKIŞTA
 *     20 · yerinde satış     kapsayıcı `padding:0 20px`  AKIŞTA
 *
 * Dördünün dördü de sayfa akışında; iki dosyada `position:sticky` HİÇ geçmiyor. Yani ışıma
 * çubuğa bağlıyken **ulaşılamaz** bir yerde duruyordu — kurye 16'nın okutma düğmesini kite
 * geçirirken ışımayı veremedi.
 *
 * Doğru okuma: ışıma **zeytin dolgulu OKUTMA düğmesinin kendi imzası**. Dört kullanımın dördü de
 * odur; ikisi bir kartın altında, ikisi listenin içinde — ortak yanları konum değil ROL.
 */
type ButtonElevation = 'shadow' | 'flat' | 'glow';

interface PrimaryButtonProps {
  /** Düğme etiketi — i18n üstte çözülür. */
  label: string;
  onPress: () => void;
  shape?: 'block' | 'pill';
  tone?: ButtonTone;
  elevation?: ButtonElevation;
  /** Etiketin SOLUNDA çizilen ikon; okutma düğmelerinde tasarımın kendi öğesi. */
  icon?: IconName;
  /**
   * YAN YANA ESNEYEN satırda payını alır — `SecondaryButton`ın aynı kapısı, aynı gerekçe
   * (esneme dışarıdan sarmalayıcıyla verilemiyor, `PressableSurface` kendi kutusudur).
   *
   * SAYI DA ALIR ve bu gereklidir: tasarım iki düğmeyi EŞİT paylaştırmıyor — çekmecenin
   * "Vazgeç"i `flex:1`, "Onayla — kaydet"i `flex:1.4` (`00-ortak:491-492`). Onaylayan düğme
   * geniş olur; iki eşit düğme, hangisinin asıl eylem olduğunu söylemez.
   */
  grow?: boolean | number;
  /**
   * Etiketin ALTINDA, düğmenin İÇİNDE çizilen ikinci satır — eylemin BEDELİNİ söyler (31.08).
   *
   * v3:16'nın "Seferi başlat" düğmesi iki satırlı: *"durakları açar · müşterilerine bildirim
   * gider"*. Bu cümle düğmenin dışına yazıldığında ondan kopuk bir nota dönüşüyor; oysa geri
   * alınamaz bir eylemin bedeli, basılan şeyin ÜSTÜNDE durmalı. Metin şeffaflaştırılmaz —
   * kendi kademesinde (`on-ink-label`) ve etiketten bir punto küçük.
   */
  hint?: string;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function PrimaryButton({
  label,
  onPress,
  shape = 'block',
  tone = 'olive',
  elevation = 'shadow',
  icon,
  grow = false,
  hint,
  disabled = false,
  accessibilityHint,
  testID,
}: PrimaryButtonProps) {
  const { theme } = useUnistyles();
  const isBlock = shape === 'block';
  /* Gölge YALNIZ blok biçimde ve yalnız etkin düğmede; `flat` onu tümden kaldırır. Basılı geri
     bildirim gölgeyi İZLER: gölgesiz bir yüzeyin `translate(2,2)` ile kayması, altında kaymayı
     açıklayan bir şey olmadığı için titreme gibi okunur. */
  const lifted = isBlock && !disabled && elevation === 'shadow';
  /* Işıma da yalnız ETKİN düğmede: pasif bir düğmenin altındaki zeytin hâle, düğme basılabilirmiş
     gibi okunurdu. Biçim koşulu YOK — v3'ün dört ışımalı düğmesi de blok, ama hap bir okutma
     düğmesi çizilirse ışıması onunla gelmeli (ışıma role bağlı, geometriye değil). */
  const glowing = !disabled && elevation === 'glow';

  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      feedback={lifted ? 'shadow' : 'scale'}
      compact={!isBlock}
      grow={grow}
      style={[
        styles.base,
        isBlock ? styles.block : styles.pill,
        disabled ? styles.disabled : styles[tone],
        lifted ? styles.shadow : undefined,
        glowing ? styles.glow : undefined,
      ]}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      {icon === undefined ? null : (
        <Icon
          name={icon}
          size={theme.text['icon-sm']}
          color={disabled ? theme.colors['disabled-text'] : theme.colors.card}
          bold
        />
      )}
      {hint === undefined ? (
        <Text style={[styles.label, disabled ? styles.disabledLabel : styles.enabledLabel]}>{label}</Text>
      ) : (
        /* İki satır DİKEY bir yığın: `PressableSurface` kendi kutusunu yatay diziyor, o yüzden
           satırlar kendi kabında toplanıyor — yoksa ipucu etiketin yanına düşerdi. */
        <View style={styles.stack}>
          <Text style={[styles.label, disabled ? styles.disabledLabel : styles.enabledLabel]}>{label}</Text>
          <Text style={[styles.hint, disabled ? styles.disabledLabel : styles.enabledHint]}>{hint}</Text>
        </View>
      )}
    </PressableSurface>
  );
}

/*
  TEMAYA BAĞLI OLMAYAN DURAKLAR — ayrı sayfa, düz nesne (künye `glow`da).
  Fabrikalı sayfa yalnız `theme` parametresini görüyor; modül kapsamındaki sabitler ancak burada
  okunabiliyor.
*/
const staticStyles = StyleSheet.create({
  glow: { boxShadow: operationsTheme.shadow.glow },
});

const styles = StyleSheet.create((theme) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    /* İkonlu düğmenin ikon–metin aralığı (tasarım: `gap:10`). İkonsuz düğmede görünmez, o yüzden
       koşulsuz yazılıyor — tek çocuklu bir satırda boşluğun karşılığı yoktur. */
    gap: theme.space.lg,
  },
  block: {
    height: theme.size.controlLg,
    borderRadius: theme.radius.control,
    /* Yatay dolgu, blok düğme GENİŞLİĞİNİ EBEVEYNDEN alsa da yazılır (kullanıcı bulgusu 09.08):
       ortalanmış bir kapsayıcının içinde (boş durum kartı) düğme içeriğine büzülüyor ve etiket
       kenara yapışıyordu. Dolgu tam-genişlik hâlde görünmez, büzülen hâlde kurtarır. */
    paddingHorizontal: theme.space['7xl'],
  },
  pill: {
    alignSelf: 'flex-start',
    height: theme.size.controlSm,
    paddingHorizontal: theme.space['7xl'],
    borderRadius: theme.radius.pill,
  },
  shadow: {
    boxShadow: theme.shadow.hard,
  },
  /* v3'ün TEK yumuşak yükseltisi — rengi zeytinin kendisi, yani ışıma düğmenin dolgusundan doğar
     (token künyesi). Sert gölgeyle bir arada kullanılamaz ve gerekmiyor: v3'te sert gölge yok.

     ── DEĞER FABRİKANIN DIŞINDA (30.08 · cihazda ölçüldü) ────────────────────
     `glow` yalnız operasyon temasında var, yani `theme` parametresinden okunamıyor. İlk çözüm onu
     doğrudan `operationsTheme`den okumaktı ve o ÇALIŞMIYOR: Unistyles'ın stil fabrikası modül
     kapsamındaki değişkeni görmüyor, cihaz `Property 'operationsTheme' doesn't exist` diye düşüyor.
     Kardeş bileşende (`SecondaryButton`) aynı desen aynı gün cihazda patladı; burada henüz
     patlamamıştı çünkü `elevation="glow"` hiçbir ekrandan gelmiyordu — bekleyen bir arızaydı.

     Çözüm: temaya bağlı OLMAYAN durak, temaya bağlı olmayan bir sayfada. Düz nesneli
     `StyleSheet.create` modül kapsamını görüyor (ekranların her yerinde böyle kullanılıyor). */
  glow: staticStyles.glow,
  olive: {
    backgroundColor: theme.colors.olive,
  },
  /* Mürekkep dolgu operasyonun "kararı uygula" tonu. Gölge burada zaten anlamsızdı: mürekkep
     gölge mürekkep düğmenin altında görünmez — v3 de bu düğmelerin hiçbirine gölge çizmiyor. */
  ink: {
    backgroundColor: theme.colors.ink,
  },
  /* Olumsuz kaydın dolgusu — tasarımın `#a44a3f`i, yani `error` token'ının kendisi. Gölge yok:
     v3'te sert gölge hiç yok ve bu düğmelerin ikisi de çekmecenin içinde duruyor. */
  error: {
    backgroundColor: theme.colors.error,
  },
  disabled: {
    backgroundColor: theme.colors['disabled-fill'],
  },
  label: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.button,
  },
  /** İki satırlı düğmenin kabı — satırlar ortalı, aralarında en dar boşluk (v3:16 `gap:2px`). */
  stack: { alignItems: 'center', gap: 2 },
  hint: {
    /* Ağırlık DÜZ (400): tasarımda ipucu etiketin altında sakin bir satır. Ölçü kademesi
       `helper` — ikisi de iki temada da var, çünkü bu düğme paylaşılan kitin parçası. */
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    textAlign: 'center',
  },
  /* Dolgunun üstündeki İKİNCİL satır: `on-image-soft` — etiketin `on-image` beyazıyla ÇİFT olan
     altyazı tonu (token künyesi: "ad ile altyazı aynı zeminde yan yana durur"). Şeffaflık
     kullanılmadı; koyu zemin üstünde alfa öngörülemez bir gri üretir. */
  enabledHint: { color: theme.colors['on-image-soft'] },
  // Zeytin dolgunun üstündeki metin paletin saf beyazıdır; ayrı bir "zeytin-üstü" token'ı yok
  // (envantere önerildi — bugün `card` ile aynı değer).
  enabledLabel: { color: theme.colors.card },
  disabledLabel: { color: theme.colors['disabled-text'] },
}));
