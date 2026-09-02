import { Text, View } from 'react-native';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';

import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/components/ui/icon-paths';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  YÜZEN OKUTMA DÜĞMESİ (FAB) — okutmanın her ekranda AYNI yerde durması (kullanıcı kararı 31.08).

  ── NİÇİN VAR ───────────────────────────────────────────────────────────────
  Ölçüldü: **yedi** operasyon ekranı barkod okutuyor (`preparation` · `intake` · `adjustment` ·
  `handover` · `courier-day` · `delivery` · `load`) ve yedisi de okutmayı KENDİ yerinde, sayfanın
  akışında çiziyor. Kullanıcının cümlesi: *"Barkod okutma yukarılarda bir yerde kalmamalı, her
  zaman elinin altında olmalı."* Akıştaki bir düğme kaydırınca kaybolur; depocunun elinde koli
  varken kaybolan bir düğme, aranan bir düğmedir.

  Bu yüzden konum komponentin KENDİSİNDE: çağıran nereye koyacağını değil, NE okutulduğunu söyler.
  Konumu çağırana bıraksaydık yedi ekran yedi ayrı "sağ alt" bulurdu (`OperationsStickyBar`ın
  aynı gerekçesi — orada 11 ekran aynı üç satırı elle yazıyordu).

  ── İKİ TON, ÇÜNKÜ İKİ EYLEM ────────────────────────────────────────────────
  Tasarım aynı daireyi iki renkte kullanıyor (v3:03 `topFabRenk`): kutu açıkken **zeytin**
  (okutma), kutu yokken **mürekkep** (o an yapılacak asıl iş — kutu aç). Yani daire "okutma
  düğmesi" değil "buradaki tek eylem" demek; ekranın hâli değişince eylem de değişiyor ve düğme
  yerinde kalıyor. Bu bir renk süsü değil: elin gittiği yer sabit kalsın diye.

  ── GÜVENLİ ALAN ÜSTTEN DEĞİL ALTTAN ────────────────────────────────────────
  Tasarımın `bottom:92px`i şablonun sekme çubuğunun üstüdür. Bizde D1 yığın ekranıdır ve sekme
  çubuğu gizlenir (`(operations)/picking.tsx` künyesi), yani 92'yi olduğu gibi almak düğmeyi
  boşlukta asardı. Ölçü ALT GÜVENLİ ALANDAN türer: jestli telefonda ev göstergesinin üstünde,
  düğmeli telefonda ekranın kenarında — ikisinde de aynı fiziksel mesafede.

  Güvenli alan `UnistylesRuntime`dan okunur, `useSafeAreaInsets`ten değil: ikincisi bir sağlayıcı
  ister ve kitin testleri onu kurmuyor (`micro-header` künyesi — 25 ekran testi bu yüzden düşmüştü).
*/

interface OperationsScanFabProps {
  /** Dairenin içindeki çizim — okutmada `scan`, başka bir eylemde onun ikonu. */
  icon: IconName;
  onPress: () => void;
  /** Ekran okuyucu adı — ZORUNLU: daire metinsizdir, ad düğmenin üstünde durur. */
  accessibilityLabel: string;
  /**
   * · `scan` (varsayılan) — zeytin: okutma.
   * · `action` — mürekkep: okutmadan ÖNCE yapılması gereken iş (kutu aç, sefer kur).
   */
  tone?: 'scan' | 'action';
  /**
   * Kapalıyken daire ÇİZİLİR ama sönüktür — gizlemek yerine söndürmek bilinçli: kaybolan düğme
   * "bu ekranda okutma yok" der, sönük düğme "şimdi olmaz" der. Çevrimdışı depo kartlarında
   * doğru cümle ikincisidir (yazma kapalı, okuma açık).
   */
  disabled?: boolean;
  /**
   * Ekranın dibinde YAPIŞIK bir çubuk varsa daire onun kadar yukarı kalkar (dp).
   *
   * Konumu bileşen sahipleniyor (künye yukarıda) ve bu, çağıranın onu istediği yere koyması
   * DEĞİL: çubuk varsa daire onun ÜSTÜNDE durmalı, yoksa çubuğun yazısını örter (ölçüldü 31.08 —
   * eksik bildirme çubuğunun cümlesi dairenin altında kalıyordu). Çağıranın söyleyebileceği tek
   * şey "altımda şu kadarlık bir çubuk var"; nereye oturacağına yine bileşen karar veriyor.
   */
  lift?: number;
  /**
   * **METİN — daire hapa dönüşür** (kullanıcı kararı 01.09).
   *
   * Yükleme ekranında son kutu binince okutacak bir şey kalmıyor ve daire kayboluyordu: elin
   * gittiği yer boşalıyor, kurye "bitir"i aramak için yukarı kaydırmak zorunda kalıyordu.
   * Kullanıcının çözümü: *"tarama butonu tüm kutular eklendikten sonra yüklemeyi bitir butonuna
   * dönebilir; fab butonu içinde metin barındıran geniş bir buton olur."*
   *
   * Yani düğme kaybolmuyor, İŞİ değişiyor — dosyanın kendi kuralının devamı ("daire okutma
   * düğmesi değil, buradaki tek eylem"). Metin gelince yalnız kabuk genişler: konum, gölge, ton
   * ve dokunma alanı aynı kalır.
   */
  label?: string;
  accessibilityHint?: string;
  testID?: string;
}

export function OperationsScanFab({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'scan',
  disabled = false,
  lift = 0,
  label,
  accessibilityHint,
  testID,
}: OperationsScanFabProps) {
  /*
    KONUM DIŞ KABA, GÖRÜNÜŞ DÜĞMEYE (cihazda ölçüldü 01.09 — kullanıcı bulgusu: *"FAB butonu
    bazen çalışmıyor"*).

    `position:'absolute'` doğrudan `PressableSurface`ın `style`ine veriliyordu ve o stil İÇ görünüme
    gidiyor (`pressable-surface` künyesi bunu açıkça yazıyor: *"`style` İÇ yüzeye gider"*). Sonuç:
    daire ÇİZİLİYOR ama dış `Pressable` akışta kalıyor ve tek çocuğu mutlak konumlandığı için
    **0×0** ölçülüyor — yani dokunacak bir alan yok. Ölçüm: `uiautomator` dökümünde ekranın
    tıklanabilir düğümleri arasında daire HİÇ görünmüyordu.

    Aynı sınıf hata kitte bir kez daha çözülmüştü: satırda esneyen düğmenin `flex`i de `style`e
    yazılamıyor, `grow` prop'undan DIŞ Pressable'a veriliyor. Burada da konum dış kaba alındı;
    `PressableSurface`a yalnız dairenin kendisi (boy, yarıçap, dolgu, gölge) kalıyor ve Pressable
    o daireye göre ölçülüyor.

    `pointerEvents="box-none"`: kap ekranın köşesinde duran şeffaf bir çerçeve ve altındaki listeyi
    yutmamalı — dokunuşu yalnız dairenin kendisi alır.
  */
  return (
    <View
      style={[styles.anchor, { bottom: UnistylesRuntime.insets.bottom + operationsTheme.space['8xl'] + lift }]}
      pointerEvents="box-none"
    >
      <PressableSurface
        onPress={onPress}
        disabled={disabled}
        /* Tasarımın `style-active="transform:scale(.94)"`i — küçük yuvarlak öğenin durağı. */
        feedback="scale-small"
        style={[
          styles.fab,
          label === undefined ? styles.fab_round : styles.fab_wide,
          disabled ? styles.fab_disabled : tone === 'scan' ? styles.fab_scan : styles.fab_action,
        ]}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
      >
        <Icon
          name={icon}
          size={operationsTheme.size.fabIcon}
          /* Koyu ve zeytin dolgunun ikisinde de krem: `on-image` rolünün tanımı zaten "koyu yüzey
           üstünde krem metin" (token künyesi). Sönük hâlde de aynı krem kalır — daire zaten
           soluyor, ikinci bir soldurma ikonu okunmaz yapardı. */
          color={operationsTheme.colors['on-image']}
          bold
        />
        {label === undefined ? null : <Text style={styles.label}>{label}</Text>}
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Ekranın köşesine çakılan ŞEFFAF kap — dokunuşu yutmaz (`box-none`), yalnız daireyi taşır. */
  anchor: {
    position: 'absolute',
    /* `bottom` çizimde veriliyor (güvenli alan) — burada yalnız değişmeyen yarısı. */
    right: operationsTheme.space['5xl'],
  },
  fab: {
    height: operationsTheme.size.fab,
    /* Tam daire: yarıçap ölçekten DEĞİL boyun yarısından türer — `radius` ailesi kutu köşesidir,
       burada istenen şey köşe değil dairenin kendisi. Metinli hâlde de aynı yarıçap kalıyor: hap
       biçimi, dairenin iki yana uzamış hâlidir — köşesi değişen bir düğme başka bir düğme olurdu. */
    borderRadius: operationsTheme.size.fab / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.lg,
    boxShadow: operationsTheme.shadow.fab,
  },
  /** Metinsiz hâl: en = boy, yani tam daire. */
  fab_round: { width: operationsTheme.size.fab },
  /** Metinli hâl: genişlik içeriğe göre, dolgu dairenin yarıçapına yakın durur ki hap dengeli olsun. */
  fab_wide: { paddingHorizontal: operationsTheme.space['5xl'] },
  label: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
  fab_scan: {
    backgroundColor: operationsTheme.colors.olive,
  },
  fab_action: {
    backgroundColor: operationsTheme.colors.ink,
  },
  fab_disabled: {
    backgroundColor: operationsTheme.colors['disabled-fill'],
    /* Sönük düğme YÜZMEZ: gölge "bu öğe üstte ve basılabilir" der, basılamayan bir dairede
       o cümle yalan olurdu. */
    boxShadow: 'none',
  },
});
