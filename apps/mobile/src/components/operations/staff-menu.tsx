import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { signOut } from '@/lib/auth/sign-out';
import { clearWarehouseChoice } from '@/lib/operations/warehouse-choice';
import { operationsCopy } from '@/screens/operations/copy';
import { useOperationsIdentity, useWarehouseOptions } from '@/screens/operations/sections-context';
import { markStaffLandingDone } from '@/screens/operations/use-staff-landing.hook';
import { operationsTheme } from '@/theme/unistyles';

/*
  KİMLİK DÜĞMESİ + OTURUM MENÜSÜ (21.97) — kabuğun sağ üst köşesi, zilin komşusu.

  ── NEDEN VAR: KABUK BİR ÇIKMAZ SOKAKTI ─────────────────────────────────────
  Ölçüldü (22.08): operasyon kabuğunda ne müşteri yüzeyine dönüş vardı ne de ÇIKIŞ. `signOut`un
  native'deki tek çağıranı hesap ekranıydı ve oraya kabuktan gidilemiyordu — yani personel
  uygulamayı silmeden oturumunu kapatamıyordu. Kabuğun kendi künyesi dönüş yolunu
  `BEKLEYEN(21.13)` diye kaydetmişti; çıkışın hiç olmadığı ise ilk kez burada ölçüldü.

  Web'de AYNI arıza ölçülmüş ve AYNI cevap verilmişti (02.08, `page-header.tsx` künyesi:
  *"operasyon yüzeyinde hiç çıkış yolu yoktu… dükkândaki tablette biri açık oturumu kapatmak
  isterse yapabileceği bir şey yoktu"*) — bardaki kimlik avatarı, ardında menü. Native'de o
  desen aynen izleniyor: iki yüzeyin personeli aynı yere bakıp aynı şeyi bulsun.

  ── DAİRE, ÇÜNKÜ BARDA BAŞKA HİÇBİR ŞEY DAİRE DEĞİL ─────────────────────────
  Webin ölçtüğü ders (kullanıcı bildirimi 02.08: *"normal bir komponent gibi görünüyor"*): sorun
  boyut değil BİÇİM. Zil nötr zeminli bir daire, bu ise DOLU zeytin bir daire — göz onu aramadan
  buluyor. Çap zilin çapıdır (`iconButtonOnPhoto`), yoksa iki komşu daire hizasız görünürdü.

  ── MENÜ ÜÇ İŞ TAŞIR (kullanıcı kararı 22.08) ───────────────────────────────
  1. KİM OLDUĞU — ad + e-posta + açabildiği bölümler. Paylaşılan bir cihazda yanlış hesapla
     çalışmak gerçek bir hâl ve ad tek başına ayırt etmiyor (iki depocunun adı da "Yusuf"
     olabilir); e-posta hesabın KENDİSİDİR.
  2. MÜŞTERİ UYGULAMASINA GEÇ — eksik köprünün ta kendisi.
  3. OTURUMU KAPAT — bugün hiç olmayan kapı.

  ── ÇEKMECE, AÇILIR MENÜ DEĞİL ──────────────────────────────────────────────
  Webin `AnchoredMenu`si imleçli bir yüzeyin çözümü; parmakla kullanılan bir ekranda sağ üst
  köşeye çakılı küçük bir menü, başparmağın en uzak olduğu yere hedef koymaktır. Kitin
  `BottomSheet`i bu yüzeyde zaten kurulu (hesap ekranının iki çekmecesi) ve elin altına açılıyor.

  ── BÖLÜMLER YAZILIYOR, ROLLER DEĞİL ────────────────────────────────────────
  Gerekçe `sections-context.useOperationsIdentity` künyesinde: webin rol sözlüğü web UI modülünde
  yaşıyor ve ikinci bir kopyası nüsha olurdu. Bölüm etiketi bu yüzeyde daha doğru da: kullanıcıya
  "hangi şapkan var" değil, "burada neyi açabiliyorsun" söyleniyor.
*/

const t = operationsCopy.staff;

/**
 * Baş harfler — addan, iki kelimeye kadar ("Musa Kaya" → "MK", "Depo" → "D").
 *
 * Ad boş gelirse e-postanın yerel kısmına düşülür: küçük harfli bir kutu, BOŞ bir kutudan
 * iyidir — boş daire "yükleniyor mu, bozuk mu" diye okunur. Büyütme Türkçe yerelinde yapılır,
 * yoksa "İlker" `I`ya değil `i̇`ye düşer (nokta hatası ekranda görünür).
 */
function staffInitials(name: string, email: string | null): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const source = words.length > 0 ? words : [((email ?? '').split('@')[0] ?? '').trim()].filter(Boolean);
  if (source.length === 0) return '·';
  return source
    .slice(0, 2)
    .map((word) => word.slice(0, 1))
    .join('')
    .toLocaleUpperCase('tr');
}

interface OperationsStaffMenuProps {
  /**
   * Kimlik karesinin dolgusu — **bölümün rengi** (görsel ajanı ölçümü 30.08, yönetim farkı #5).
   *
   * Tasarım dört hubta aynı KUTUYU çiziyor ama aynı rengi değil: depo ve kurye zeytin (v3:01, 14),
   * yönetim MÜREKKEP (v3:2077). Rastgele değil — yönetim ekranının tek koyu yüzeyi acil şikâyet
   * kartıdır ve kimlik karesi de koyuysa başlık şeridi o kartla aynı aileden konuşur.
   *
   * Varsayılan `olive`: dört hubun üçü o (depo · kurye · para) ve varsayılanı çoğunluktan seçmek,
   * çağıranların çoğunu prop yazmaktan kurtarır.
   */
  tone?: 'olive' | 'ink';
  testID?: string;
}

export function OperationsStaffMenu({ tone = 'olive', testID }: OperationsStaffMenuProps) {
  const router = useRouter();
  const { name, email, sections } = useOperationsIdentity();
  const warehouseOptions = useWarehouseOptions();
  const [open, setOpen] = useState(false);

  const initials = staffInitials(name, email);
  const sectionLine = sections.map((section) => operationsCopy.sections[section].tab).join(' · ');

  /* Geçiş niyeti — düğme YALNIZ çekmeceyi kapatır, yönlendirme çekmece SÖKÜLÜNCE koşar
     (`onClosed`). Basış anında `router.replace` çağırmak cihazda 4/4 Fabric çökmesiydi
     (21.121, 26.08): Modal'ın kapanış animasyonu sürerken kök yığın değişince "child already
     has a parent" — gerekçenin tamamı `bottom-sheet.tsx`in `onClosed` künyesinde. */
  const pendingLeave = useRef(false);

  const leaveToCustomer = () => {
    pendingLeave.current = true;
    setOpen(false);
  };

  const onSheetClosed = () => {
    if (!pendingLeave.current) return;
    pendingLeave.current = false;
    /* Bayrak BURADA tüketilir (künyesi `use-staff-landing`te): taze girişten sonra bayrak hiç
       tüketilmemiş olabiliyor ve müşteri kabuğu monte olur olmaz kullanıcıyı buraya geri
       fırlatırdı — köprü, basıldığı anda kendini iptal ederdi. */
    markStaffLandingDone();
    /* `replace`, `push` DEĞİL: kabuk yığında ALTTA kalsaydı hem geri tuşu personeli izinsiz
       geri taşırdı hem de kabuk sökülmediği için operasyon teması müşteri ekranlarının üstünde
       kalırdı (kapının künyesindeki dikiş sınırı). Sökülme, temanın müşteriye dönmesidir. */
    router.replace('/');
  };

  return (
    <>
      <PressableSurface
        onPress={() => setOpen(true)}
        feedback="scale-small"
        style={[styles.button, styles[tone]]}
        accessibilityLabel={`${t.menuLabel}: ${name}`}
        testID={testID}
      >
        <Text style={styles.initials}>{initials}</Text>
      </PressableSurface>

      <BottomSheet
        visible={open}
        title={t.sheetTitle}
        onClose={() => setOpen(false)}
        onClosed={onSheetClosed}
        testID={testID === undefined ? undefined : `${testID}-sheet`}
      >
        <View style={styles.identity}>
          <Text style={styles.name}>{name}</Text>
          {/* E-posta YAZILMAMIŞ olabilir (sözleşme `string | null`); o hâlde satır hiç doğmaz.
              Boş bir satır bırakmak "e-postası yok" demezdi, "okunamadı" der gibi görünürdü. */}
          {email === null ? null : <Text style={styles.email}>{email}</Text>}
          {/* Bölüm satırı BOŞ olamaz — kapı bölümsüz kullanıcıyı zaten geçirmiyor. */}
          <Text style={styles.sections}>{sectionLine}</Text>
        </View>

        <View style={styles.actions}>
          {/*
            DEPO DEĞİŞTİR (30.08) — yalnız seçebileceği BİRDEN ÇOK tesisi olan personelde.

            Tek tesisli depocuda çizilmez: değiştirilecek bir şey yok ve düğme, olmayan bir seçim
            varmış gibi gösterirdi. Menüde tesis LİSTESİ de yok — seçiciyi ikinci kez yazmak
            olurdu (CLAUDE §1); burası seçimi bırakır, soruyu kapsam ekranı sorar.

            Menüde, üstbaşlıkta değil: üstbaşlık dolu (zil + kimlik) ve "hangi depodayım" günde bir
            kez sorulan bir sorudur — her ekranda duran bir kontrol, günün her saatinde
            değiştirilebilir bir bağlam gibi görünürdü.
          */}
          {warehouseOptions.length > 1 ? (
            <TextAction
              label={t.changeWarehouse}
              onPress={() => {
                clearWarehouseChoice();
                setOpen(false);
              }}
              testID="operations-staff-change-warehouse"
            />
          ) : null}
          <TextAction label={t.toCustomer} onPress={leaveToCustomer} testID="operations-staff-to-customer" />
          {/* Çıkış terracotta: kitin "dikkat isteyen eylem" tonu, hesap ekranındaki çıkışla aynı.
              Sonuç beklenmiyor ve YÖNLENDİRME DE BURADA DEĞİL: `signOut` cihaz deposunu her
              hâlükârda temizliyor, oturum düşünce kapı bunu KENDİ duyuyor ve `denied` dalıyla
              müşteri yüzeyine yönlendiriyor (`use-operations-access` künyesi).
              Buraya bir `router.replace` yazmak cazipti — cihazda ölçülen arıza tam olarak
              buydu (22.08: çıkış yapılıyor, ekran kurye rotasında kalıyor). Ama o pansuman
              olurdu: aynı boşluk oturum SÜRESİ dolduğunda açık kalırdı. Kapı sağırdı, düğme
              değil. */}
          <TextAction
            label={t.signOut}
            tone="terracotta"
            onPress={() => {
              setOpen(false);
              void signOut();
            }}
            testID="operations-staff-sign-out"
          />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    /*
      ZİLLE AYNI KUTU — ölçü DE biçim DE (görsel ajanı ölçümü 30.08, hub farkı #1).

      Künye "zille aynı çap" diyordu ama değildi: zil 40 (`iconButton`), avatar 42
      (`iconButtonOnPhoto`) çiziliyordu ve avatar TAM DAİREYDİ. Tasarım ikisini de
      `40×40 · border-radius:14` çiziyor — yani yuvarlatılmış KARE. Cihazda yan yana duran iki
      düğmeden biri daire biri kutucuktu; fark 2 dp'lik ölçüden değil, biçimden görünüyordu.

      Ölçü artık zilin durağından okunuyor; ikisi ayrı yazılsaydı biri bir gün yine kayardı.
    */
    width: operationsTheme.size.iconButton,
    height: operationsTheme.size.iconButton,
    borderRadius: operationsTheme.radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // DOLU zemin — zilin nötr kutusundan ayrılan tek fark ve avatarın bulunma sebebi. Rengi BÖLÜM
  // verir (prop künyesi): üç hubta zeytin, yönetimde mürekkep.
  olive: { backgroundColor: operationsTheme.colors.olive },
  ink: { backgroundColor: operationsTheme.colors.ink },
  initials: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title-sm--font-weight']],
    fontSize: operationsTheme.text['card-title-sm'],
    // Dolu zeytin üstünde krem: `card` tam beyaz (`operations-app.ts` eşlemesi).
    color: operationsTheme.colors.card,
  },
  identity: {
    gap: operationsTheme.space['2xs'],
    paddingBottom: operationsTheme.space['3xl'],
  },
  name: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title--font-weight']],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors.ink,
  },
  email: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.muted,
  },
  sections: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.olive,
  },
  actions: {
    gap: operationsTheme.space.md,
  },
});
