import { formatPrice } from '@lezzet/helper';
import { LOCALES, type Locale, type LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { pullRefreshColors } from '@/components/ui/pull-refresh';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextAction } from '@/components/ui/text-action';
import { TextField } from '@/components/ui/text-field';
import { makeDefaultAddress, type MeAddress } from '@/lib/api/addresses';
import { redeemPoints } from '@/lib/api/points';
import { deleteAccount, updateMe, updatePreferences } from '@/lib/api/me';
import { resolvePostalCode } from '@/lib/api/places';
import { signOut } from '@/lib/auth/sign-out';
import { FONT_SCALES, readFontScale, saveFontScale, type FontScale } from '@/lib/settings/font-scale';
import { publishToast } from '@/lib/toast/toast-store';
import { setAppLocale, useAppLocale } from '@/lib/i18n/app-locale';
import { publishMe } from '@/screens/customer-kit/use-me.hook';
import { AddressSheet, type AddressSheetTarget } from '@/screens/customer-kit/address-sheet';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { NavRow } from '@/screens/customer-kit/nav-row';
import { PointsEarnList, type PointsEarnActions } from '@/screens/customer-kit/points-earn-list';
import { ToggleSwitch } from '@/screens/customer-kit/toggle-switch';
import { useAddresses } from '@/screens/customer-kit/use-addresses.hook';
import { AddressCard } from './address-card';
import { AccountAddressesSkeleton, AccountPointsSkeleton } from './account-skeleton';
import { accountData, type AccountData } from './account-fixture';
import { usePoints } from './use-points.hook';
import messages from './messages.json';

/*
  HESABIM (v3 `vHesap`) — profil, profesyonel künye, puanlar, referans kodu, menü, adresler,
  dil tercihi, kampanya iletişimi, veri notu ve çıkış.

  ── UI-ONLY (21.14 ilk etap) ────────────────────────────────────────────────
  `/api/v1/me` sözleşmesi VAR ama bu ekran ona BAĞLANMADI (görevin açık kısıtı); veri fixture'dan
  ve tercihler ekranın kendi durumunda yaşıyor — anahtarlar, dil seçimi ve puan çevirme GERÇEKTEN
  çalışıyor, yalnız kalıcı değiller. Bağlanma günü değişecek olan okuma ve üç yazma çağrısıdır.

  ── ŞABLONDAN SAPMALAR ──────────────────────────────────────────────────────
  1. **Profil ve adres düzenleme AYRI SAYFADA** (`/account/edit`, 21.14 ikinci dilim). Şablon
     ikisini de yüzen sayfada açıyor; gerekçe o ekranın künyesinde. Buradaki üç giriş (profil
     "Düzenle", adres "Düzenle", "＋ Yeni adres ekle") artık oraya gider — ilk etapta doğrulama
     kapısına bağlıydılar.
  2. **Dil seçimi kitin `Chip`i ile.** Şablon üç eşit genişlikte kutu çiziyor; kitte tam bu rolde
     bir öğe var (seçili/boş çip) ve ikinci bir seçim kutusu türü açmak kitin sözlüğünü büyütürdü.
  3. **Dil listesi `LOCALES`ten türer**, elle yazılmaz: yeni bir dil açıldığında bu ekran
     kendiliğinden öğrenir (CLAUDE §1). Seçim UYGULAMANIN DİLİNİ ANINDA DEĞİŞTİRİR (kullanıcı
     kararı 09.08): çipler `useAppLocale()`i gösterir — yani ekranda okunan dilin kendisini.
     Girişli kullanıcıda o değer ZATEN profilden gelir (`/me`.preferredLanguage, `use-me.hook`
     uygular), o yüzden çip ile kart hiçbir zaman ayrışmaz; ekran ayrıca `data.preferredLanguage`
     TAŞIMAZ (ikinci yol = ayrışma kapısı). Değişiklik önce yerele, sonra `PATCH /me/preferences`e
     gider — dil bir görünüm ayarı değil, müşteriyle yazışma dilidir (zincir: `lib/i18n/app-locale`).
  4. **Puan çevirme eşiğin altında ENGELLİ**, şablonda ise basılınca hiçbir şey olmuyor. Engelli
     düğme + eksik puan satırı, kuralı basmadan önce söylüyor.
*/

type Messages = LocalizedCopy<typeof messages>;

interface AccountScreenProps {
  data?: AccountData;
  /** Oturum durumu — misafirde doğrulama kapısı çıkar. */
  signedIn?: boolean;
  /**
   * Aşağı çekildiğinde KİMLİĞİ tazeleyen kapı (21.29c). Ekran `/me`yi kendi okumaz; rota okur ve
   * `data` olarak verir, o yüzden tazeleme de rotanın elinde. Verilmezse yenileme yalnız puan ve
   * adresleri kapsar — testlerin ve demo hâllerinin çağırdığı yol.
   */
  onRefreshIdentity?: () => void;
}

export function AccountScreen({ data = accountData(), signedIn = true, onRefreshIdentity }: AccountScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  /* DİL + KAMPANYA İZİNLERİ GERÇEK (21.16): başlangıç değeri profilden gelir (`/me`), değişim
     anında `PATCH /me/preferences`e gider ve dönen profil yayınlanır (`publishMe` — vitrin
     selamlaması ve kart aynı anda döner). İYİMSER yazım: anahtar hemen kayar, ret gelirse
     ESKİ değere döner ve satır altında söylenir — kaydedilmemiş bir seçimi kaydedilmiş
     göstermek, kullanıcıya olmayan bir izni vermiş gibi okutur. */
  const [prefsFailed, setPrefsFailed] = useState(false);

  /* Yenileme halkasının durumu (21.29c). BURADA, ekranın en üstünde: aşağıda misafir/boş hâller
     için erken `return`lar var ve hook'un onların ALTINDA kalması render'lar arasında hook sayısını
     değiştiriyordu — cihazda ölçüldü (11.08): *"Rendered more hooks than during the previous
     render"*. Hook'lar koşulsuz ve en üstte durur; kullanıldığı yerin yakınında değil. */
  const [refreshing, setRefreshing] = useState(false);

  const savePreference = (patch: { preferredLanguage?: Locale; marketingConsent?: Record<string, boolean> }, revert: () => void) => {
    setPrefsFailed(false);
    void updatePreferences(patch).then((result) => {
      if (result.error !== null) {
        revert();
        setPrefsFailed(true);
        return;
      }
      publishMe(result.data);
    });
  };

  /* Davet paylaşımı — v3 iki satırlık ÖZEL çekmece çiziyor (WhatsApp · bağlantıyı kopyala);
     native'de karşılığı SİSTEM paylaşım sayfasıdır ve ikisini de zaten içerir (üstelik müşterinin
     kendi seçtiği uygulamayı). Kendi çekmecemizi çizmek panoya kopyalama için ikinci bir paket
     (rebuild) isterdi ve sistemin seçeneklerini daraltırdı — sapma bilinçli. */
  /* PAYLAŞILAN ŞEY KOD DEĞİL BAĞLANTIDIR (21.43). Eskiden mesaja çıplak kod yazılıyordu
     ("Davet kodum: AB12CD34") ve o kodun girilebileceği bir yer HİÇBİR ekranda yoktu — davetli
     kodu eline alıp yapacak bir şey bulamıyordu, zincir orada kopuyordu. Kullanıcı kararı 11.08:
     *"kod göndermek gibi bir yöntem istemiyorum, her hâlükârda link gönderilsin"*.

     ADRESİ EKRAN KURMAZ, SUNUCU VERİR (`wallet.inviteUrl`): rota adı üç dilde ayrı ve web'de
     yaşıyor; burada birleştirilseydi bir gün 404'e düşen ikinci bir bağlantı taşırdık. */
  const shareReferral = () => {
    if (wallet?.inviteUrl == null) return;
    void Share.share({ message: t.referral.shareMessage.replace('{url}', wallet.inviteUrl) });
  };

  /* PUAN KAZANMA YOLLARININ DÜĞMELERİ — liste, ikonlar ve metinler artık KİTTE
     (`customer-kit/points-earn-list.tsx`, kullanıcı kararı 12.08); burada kalan tek şey "bu
     yüzeyde bu satıra basınca nereye gidilir" sorusunun cevabı, çünkü hedefler ekranın kendi
     gezinme ağacına ait.

     `Partial` ve bu bilinçli: `visit` kendiliğinden yazılır, `feedback_purchase` zaten teslim
     edilmiş siparişin ekranında yapılır — ikisi de müşterinin gidebileceği bir yere işaret etmez
     ve düğme koymak basınca hiçbir şey olmayan bir yüzey demekti. Tanımadığı anahtar sessizce
     düşer: kit satırı düğmesiz çizer, çökmez.

     (Tarihçe: burada eskiden `discovery` yazıyordu, uç ise `feedback_candidate` gönderiyordu ve
     keşif satırı hiç ÇİZİLMİYORDU — ölçüldü 09.08. Sözlük o günden beri `MePointsEarnWayKey`e
     bağlı; ekrana özel ikinci bir ad açmak sözlüğü ayrıştırır.) */
  const earnActions: PointsEarnActions = {
    referral: shareReferral,
    neighbor: () => router.push('/orders'),
    review: () => router.push('/orders'),
    feedback_candidate: () => router.push('/discover'),
  };

  /* Dil seçimi ÖNCE yerele (anında, tüm ekranlar), SONRA karta (`PATCH /me/preferences` — asıl
     kaynak orası; dil yazışmanın dilidir). Başarıda dönen profil `publishMe` ile yayınlanır ve
     aynı değeri geri uygular (sıçrama yok); RET gelirse arayüz de eski dile döner —
     kaydedilmemiş bir seçimi kaydedilmiş göstermek, izinlerdeki hükümle aynı sebeple yasak. */
  const pickLanguage = (next: Locale) => {
    const previous = locale;
    void setAppLocale(next);
    savePreference({ preferredLanguage: next }, () => void setAppLocale(previous));
  };

  const toggleConsent = (channel: 'email' | 'whatsapp', next: boolean) => {
    const apply = channel === 'email' ? setMarketingEmail : setMarketingWhatsApp;
    apply(next);
    savePreference({ marketingConsent: { [channel]: next } }, () => apply(!next));
  };

  /* Yazı boyutu (kullanıcı kararı 09.08) — cihaz ayarı, hesaptan bağımsız GERÇEK: açılışta
     kayıtlı seçim okunur, seçim anında uygulanıp saklanır (onboarding'in aynı deposu). */
  const [fontScale, setFontScale] = useState<FontScale>('normal');
  useEffect(() => {
    void readFontScale().then(setFontScale);
  }, []);
  const pickFontScale = (next: FontScale) => {
    setFontScale(next);
    void saveFontScale(next);
  };
  const [marketingEmail, setMarketingEmail] = useState(data.marketingEmail);
  const [marketingWhatsApp, setMarketingWhatsApp] = useState(data.marketingWhatsApp);
  /* PUAN CÜZDANI GERÇEK (21.17): bakiye · eşik · kuponlar uçtan. Kartın çizilme koşulu tek
     yerde — `wallet` null ise (B2B ya da düşen okuma) bölüm hiç görünmez. */
  const pointsWallet = usePoints(signedIn);
  const wallet = pointsWallet.view?.points ?? null;
  const coupons = pointsWallet.view?.coupons ?? [];
  const [redeeming, setRedeeming] = useState(false);
  const [redeemFailed, setRedeemFailed] = useState(false);
  /* "Nasıl puan kazanılır" çekmecesi (kullanıcı isteği 12.08) — kartın merak sorusuna cevabı. */
  const [earnSheetOpen, setEarnSheetOpen] = useState(false);

  /* Hesabı silme çekmecesi (GDPR md. 17 · App Store 5.1.1(v)) — iki adım, gerekçesi çekmecenin
     kendi künyesinde. `deleting` düğmeyi kilitler: `anonymize` idempotent ama ikinci çağrı
     silinmiş bir profili arayıp 404 döner ve müşteri "olmadı" sanır. */
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  /* Profil çekmecesi (v3 `shPf`) — GERÇEK kayıt (21.14c): taslak alanlar açılışta karttan dolar,
     Kaydet `PATCH /me`ye gider; başarı `publishMe` ile yayınlanır (kart ve vitrin selamlaması
     aynı anda döner), adlı retler (`name_required` · `phone_invalid` · `phone_taken`) cümleye
     çevrilip çekmecede söylenir. */
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const openProfileSheet = () => {
    setDraftName(data.name === data.email ? '' : data.name);
    setDraftPhone(data.phone);
    setProfileError(null);
    setProfileSheetOpen(true);
  };

  /* Adresler GERÇEK (21.15): liste `/me/addresses`ten, yazımlar v3 `shAddr` çekmecesinden.
     Her yazma cevabı GÜNCEL listedir (sözleşme kararı) — ekran ikinci bir GET atmaz, `publish`ler. */
  const addressBook = useAddresses(signedIn);

  /* BÖLGE-DIŞI TALEP BLOĞU (kullanıcı kararı 09.08) — varsayılan adres teslimat rotamızın dışına
     düşüyorsa kampanya kartı bir SORU sorar: "buraya teslimat açılsın" der misin? Ayrım kasıtlı —
     posta kodu girmek ZAYIF sinyaldir (belki merak etti), kanal açıp talep bildirmek KUVVETLİ
     sinyaldir (hattı açarsak müşteri olur) ve ikisi aynı sayılırsa yatırım kararı yanlış veriden
     çıkar. Yer sorusu gerçek uca gider (`/places/by-postal-code`), tahmin edilmez. */
  const defaultAddress = addressBook.addresses.find((a) => a.isDefault) ?? addressBook.addresses[0];
  const zipOfDefault = defaultAddress?.postalCode;
  const [outOfZone, setOutOfZone] = useState(false);
  useEffect(() => {
    if (zipOfDefault === undefined) {
      setOutOfZone(false);
      return;
    }
    let alive = true;
    void resolvePostalCode(zipOfDefault).then((result) => {
      // Çözülemeyen kod "bölge dışı" SAYILMAZ: bilinmeyeni olumsuz okumak, ölçemediğimiz şeyi
      // ölçmüş gibi göstermek olurdu (CLAUDE §1).
      if (alive && result.error === null) setOutOfZone(result.data.kind === 'resolved' && !result.data.place.inRoute);
    });
    return () => {
      alive = false;
    };
  }, [zipOfDefault]);

  const [interestSent, setInterestSent] = useState(false);
  /**
   * Kuvvetli talep. BUGÜN KAYDEDİLEN ŞEY İZİNDİR: talebin kendisi (hangi posta kodundan kaç kişi
   * istedi) için tablo YOK — `BEKLEYEN(21.15)`, web denetmene talep açıldı
   * (`docs/talep/talep-web-teslimat-talebi-kaydi.md`); tablo gelince buraya tek çağrı eklenir.
   * Düğme boş söz vermiyor: kanalı açıyor, yani hat açıldığında haber gerçekten gidebilir.
   */
  const sendZoneInterest = () => {
    setInterestSent(true);
    publishToast(t.marketing.zone.sent);
    if (!marketingEmail) toggleConsent('email', true);
  };

  /* Adres yazımının TAMAMI kitin ortak çekmecesinde (`customer-kit/address-sheet`, 10.08): form,
     doğrulama, BAN önerileri ve üç yazma çağrısı oraya TAŞINDI — checkout de aynı çekmeceyi
     açıyor, ikinci bir nüsha yok. Bu ekranda kalan tek şey çekmecenin AÇILMASI ve dönen listenin
     yayınlanmasıdır. */
  const [addressSheet, setAddressSheet] = useState<AddressSheetTarget | null>(null);
  const [defaultFailed, setDefaultFailed] = useState(false);

  const makeDefault = (address: MeAddress) => {
    void makeDefaultAddress(address.id).then((result) => {
      if (result.error !== null) return setDefaultFailed(true);
      setDefaultFailed(false);
      addressBook.publish(result.data);
      // Başlık kartla aynı kural: etiketsiz adreste şehir (v3'ün `a.n+' varsayılan yapıldı'`sı).
      publishToast(t.addresses.defaultDone.replace('{label}', address.label ?? address.city));
    });
  };

  const saveProfile = () => {
    setProfileSaving(true);
    setProfileError(null);
    void updateMe({ name: draftName, phone: draftPhone.trim() === '' ? null : draftPhone }).then((result) => {
      setProfileSaving(false);
      if (result.error !== null) {
        const known = result.error as keyof Messages['edit']['errors'];
        setProfileError(t.edit.errors[known] ?? t.edit.errors.unexpected);
        return;
      }
      publishMe(result.data);
      setProfileSheetOpen(false);
      publishToast(t.edit.saved);
    });
  };

  /**
   * Hesabın silinmesi — SIRA KRİTİK: önce sunucu siler, sonra cihaz çıkış yapar (çekmecenin
   * künyesi). Düşen bir silmede oturum korunur, yani müşteri hesabıyla kalır ve neden olmadığını
   * çekmecede okur.
   *
   * Çıkış BAŞARI DALINDA yutulmuyor, `signOut` zaten yarım kalmıyor (`clearStoredSession` her
   * durumda koşar). Çekmece kapatılMAZ ve toast basılmaz: `useMe` dinleyicisi oturum ölünce
   * ekranı misafir hâline döndürüyor — kapanış zaten geliyor, ayrıca bir "silindi" ekranı
   * yazmak silinmiş bir hesabın son karesini uzatmak olurdu.
   */
  const confirmDelete = async (): Promise<void> => {
    setDeleting(true);
    setDeleteFailed(false);
    const result = await deleteAccount();
    if (result.error !== null) {
      setDeleting(false);
      setDeleteFailed(true);
      return;
    }
    await signOut();
  };

  if (!signedIn) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title} accessibilityRole="header">
          {t.title}
        </Text>
        <EmptyState
          icon={<Icon name="account" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.guest.title}
          description={t.guest.body}
          action={<PrimaryButton label={t.guest.cta} shape="pill" onPress={() => router.push('/login')} testID="account-login" />}
          testID="account-guest"
        />
      </View>
    );
  }

  /* Çevirme GERÇEK (21.17): gövde YOK — kaç puanın harcanacağını istemci söylemez, motor
     bakiyenin tamamını çevirir (sözleşme kararı). Cevap TAM görünüm taşır, ikinci GET atılmaz. */
  const convertPoints = () => {
    setRedeeming(true);
    setRedeemFailed(false);
    void redeemPoints().then((result) => {
      setRedeeming(false);
      if (result.error !== null) return setRedeemFailed(true);
      pointsWallet.publish(result.data);
      publishToast(t.points.converted);
    });
  };


  /* AŞAĞI ÇEKİP YENİLE (21.29c) — bu ekranın üç okuması da ekran açıkken eskiyebiliyor: kimlik
     (ad/telefon web'den değişmiş olabilir), PUAN (sipariş puanı TESLİMATTA yazılıyor —
     `rewardCompletedOrder`, yani müşteri beklerken bakiye artar) ve ADRES defteri. Yenileme
     olmadan üçünü de görmenin tek yolu uygulamayı kapatıp açmaktı (kullanıcı bulgusu 10.08).

     KİMLİK PROP'TAN TAZELENİR: bu ekran `/me`yi kendi okumuyor, rota okuyup `data` olarak veriyor
     (`app/(tabs)/account.tsx` künyesi) — tazeleme de oradan gelmeli, yoksa ekran kimliği ikinci
     bir yoldan okur ve iki kaynak ayrışırdı.

     Halka ÜÇÜ BİRDEN bekler ama TEK döner: üç ayrı gösterge, kullanıcıya üç ayrı yükleme varmış
     izlenimi verirdi (vitrin ekranının aynı kararı). Kimlik beklenmiyor çünkü prop'un arkasındaki
     okuma bu ekrana bir söz vermiyor — o tazelendiğinde `data` kendiliğinden yenilenir. */
  const refreshAll = async (): Promise<void> => {
    setRefreshing(true);
    onRefreshIdentity?.();
    await Promise.all([pointsWallet.reload(), addressBook.reload()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshAll()}
            {...pullRefreshColors(theme.colors.olive)}
          />
        }
        testID="account-scroll"
      >
        <Text style={styles.title} accessibilityRole="header">
          {t.title}
        </Text>

        <View style={styles.profileCard} testID="account-profile">
          <AvatarThumb initial={data.name.slice(0, 1)} accessibilityLabel={data.name} size="lg" tone="olive" />
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{data.name}</Text>
            <Text style={styles.profileMeta}>{data.email}</Text>
            {/* Telefon girilmemişse satır çizilmez (gerçek hesapta alan boş olabilir — 21.14c). */}
            {data.phone === '' ? null : <Text style={styles.profileMeta}>{data.phone}</Text>}
          </View>
          <TextAction
            label={t.profile.edit}
            onPress={openProfileSheet}
            accessibilityHint={t.profile.editLabel}
            testID="account-edit"
          />
        </View>

        {data.company === null ? null : (
          <View style={styles.companyCard} testID="account-company">
            <Text style={styles.companyEyebrow}>{t.company.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
            <Text style={styles.companyName}>{data.company.name}</Text>
            <Text style={styles.companyMeta}>
              {t.company.identifiers.replace('{siret}', data.company.siret).replace('{vat}', data.company.vatNumber)}
            </Text>
            <Text style={styles.companyNote}>{t.company.note}</Text>
          </View>
        )}

        {/* PUAN CÜZDANI GERÇEK (21.17). Bölüm B2B'de ve okuma düştüğünde HİÇ çizilmez (yanlış
            bakiye göstermektense göstermemek). Bakiye SIFIRSA kart boş kalmaz: kullanıcı kararı
            09.08 — "burası boş kalmasın, puan kazanacağı yere itelim". Eşik ve kupon değeri
            SUNUCUDAN gelir (`redeem.minimumPoints`/`valueCents`), ekran sayı uydurmaz. */}
        {/* Cüzdan OKUNURKEN kartın yeri tutulur (kullanıcı isteği 10.08): bölüm eskiden yüklenirken
            hiç çizilmiyor, veri gelince ekranın ortasına girip altındaki her şeyi aşağı itiyordu.
            Okuma DÜŞERSE ya da B2B ise kart yine hiç çizilmez — orada bekleyen bir şey yok. */}
        {pointsWallet.status === 'loading' ? <AccountPointsSkeleton testID="account-points-loading" /> : null}

        {wallet === null ? null : (
          <View style={styles.pointsCard} testID="account-points">
            <View style={styles.pointsHead}>
              <Text style={styles.cardTitle}>{t.points.title}</Text>
              <Text style={styles.pointsValue}>{t.points.value.replace('{n}', String(wallet.balance))}</Text>
            </View>

            {wallet.balance === 0 ? (
              <>
                <Text style={styles.cardBody}>{t.points.emptyBody}</Text>
                {/* Liste ARTIK KİTTEN (kullanıcı kararı 12.08): aynı anlatım onboarding'in son
                    adımında ve aşağıdaki çekmecede de çiziliyor. Üç kopya, bir ödül değiştiğinde
                    ikisinin unutulduğu üç ayrı metin demekti. `wallet` sözleşme gereği kuralın
                    kendisini de taşıyor (`MePointsCardSchema` = kural + kimlik), o yüzden ayrı bir
                    okuma turu atılmıyor. */}
                <PointsEarnList rules={wallet} actions={earnActions} testID="account-earn-list" />
              </>
            ) : (
              <>
                <Text style={styles.cardBody}>
                  {t.points.body
                    .replace('{threshold}', String(wallet.redeem.minimumPoints))
                    .replace('{value}', formatPrice(wallet.redeem.valueCents, locale))}
                </Text>
                {wallet.balance < wallet.redeem.minimumPoints ? (
                  <Text style={styles.pointsGap}>
                    {t.points.gap.replace('{n}', String(wallet.redeem.minimumPoints - wallet.balance))}
                  </Text>
                ) : null}
                <PrimaryButton
                  label={
                    redeeming
                      ? t.points.converting
                      : t.points.convert
                          .replace('{threshold}', String(wallet.redeem.minimumPoints))
                          .replace('{value}', formatPrice(wallet.redeem.valueCents, locale))
                  }
                  onPress={convertPoints}
                  disabled={redeeming || wallet.balance < wallet.redeem.minimumPoints}
                  testID="account-convert"
                />
              </>
            )}

            {redeemFailed ? <Note description={t.points.failed} tone="terracotta" testID="account-points-error" /> : null}

            {/* "NASIL PUAN KAZANIRIM?" — kullanıcı isteği 12.08. Kart bir BAŞVURU YERİ, öğretmen
                değil (karar seti 2h): öğretme işini bağlam mesajları yapar, burası merak edene
                cevap verir. Bakiyesi OLAN müşteri de görüyor — eski kurguda liste yalnız bakiye
                sıfırken çiziliyordu, yani ilk puanını kazanan müşteri geri kalan yolları bir daha
                hiç göremiyordu. */}
            <TextAction
              label={t.points.howTo}
              onPress={() => setEarnSheetOpen(true)}
              testID="account-points-howto"
            />

            {/* PUAN GEÇMİŞİ (MB-59 · kullanıcı isteği 15.08) — *"hangi puan nereden geldi."*
                Kartın YANINDA değil İÇİNDE, çünkü aynı cüzdanın üçüncü yüzü: bakiye (ne kadarım
                var) · kuponlar (ne harcayabilirim) · geçmiş (nereden geldi). Ayrı bir ekrana
                gidiyor, kartın içine liste konmuyor: defter veriyle sınırsız büyüyor ve sonsuz
                kaydırma istiyor (ekranın kendi künyesi).

                Kapı kartın İÇİNDE olduğu için B2B ölçütü ikinci kez yazılmıyor — kart zaten
                `wallet !== null` koşulunda çiziliyor (`MePointsCardSchema` künyesinin "tek koşul,
                tek karar" gerekçesi). */}
            <TextAction
              label={t.points.history}
              onPress={() => router.push('/points-history')}
              testID="account-points-history"
            />

            {/* Kuponlar puan kartının içinde: ikisi aynı cüzdanın iki yüzü (kazanılan ↔ harcanabilir). */}
            {coupons.map((coupon) => (
              <View key={coupon.id} style={styles.couponRow} testID={`account-coupon-${coupon.code}`}>
                <CustomerIcon name="coupon" size={theme.size.inlineIcon} color={theme.colors.terracotta} />
                <Text style={styles.couponCode}>{coupon.code}</Text>
                <Text style={styles.couponValue}>
                  {coupon.amountCents === null
                    ? t.points.couponPercent.replace('{n}', String(coupon.percent ?? 0))
                    : t.points.couponValue.replace('{value}', formatPrice(coupon.amountCents, locale))}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* KOŞUL PROFİLDEN DEĞİL CÜZDANDAN OKUNUR (21.43): `data.referralCode` profil satırının HAM
            aynasıdır ve boş olabilir — kart ise kodu GARANTİLER (yoksa üretir). Eskiden bu blok
            profile bakıyordu, yani kodu henüz üretilmemiş müşteri davet bölümünü hiç görmüyordu.
            Bağlantı da aynı yerden geliyor; ikisi tek koşulla düşer (sözleşmenin kendi kararı). */}
        {wallet?.inviteUrl == null || wallet.referralCode === null ? null : (
          <View style={styles.pointsCard} testID="account-referral">
            <Text style={styles.cardTitle}>{t.referral.title}</Text>
            <Text style={styles.cardBody}>{t.referral.body}</Text>
            <View style={styles.referralRow}>
              {/* Kod GÖRÜNMEYE devam ediyor ama paylaşılan şey bağlantı: kod telefonda okunur/
                  söylenir, bağlantı paylaşılır — ikisinin işi ayrı (sözleşmedeki aynı ayrım). */}
              <Text style={styles.referralCode}>{wallet.referralCode}</Text>
              <SecondaryButton
                label={t.referral.share}
                onPress={shareReferral}
                tone="olive"
                shape="pill"
                accessibilityHint={t.referral.shareLabel}
                testID="account-share"
              />
            </View>
          </View>
        )}

        <View style={styles.menuCard}>
          <NavRow
            label={t.menu.orders}
            onPress={() => router.push('/orders')}
            icon={<Icon name="orders" size={theme.size.inlineIcon} color={theme.colors.muted} />}
            testID="account-menu-orders"
          />
          <NavRow
            label={t.menu.tickets}
            onPress={() => router.push('/support')}
            icon={<Icon name="whatsapp" size={theme.size.inlineIcon} color={theme.colors.muted} />}
            divider
            testID="account-menu-tickets"
          />
          <NavRow
            label={t.menu.write}
            onPress={() => router.push('/support/new')}
            icon={<CustomerIcon name="mail" size={theme.size.inlineIcon} color={theme.colors.muted} />}
            divider
            testID="account-menu-write"
          />
          <NavRow
            label={t.menu.delivery}
            onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'delivery' } })}
            icon={<CustomerIcon name="truck" size={theme.size.inlineIcon} color={theme.colors.muted} />}
            divider
            testID="account-menu-delivery"
          />
        </View>

        {/* Adresler GERÇEK (21.15, v3:857-868): bölüm koşulsuz çizilir — boş listede de başlık ve
            "＋ Yeni adres ekle" durur, ekleme kapısı adressiz müşteriye de lazım. Yüklenirken kart
            çizilmez (v3'te iskelet yok); düşen okuma/yazım tek hata satırında söylenir. */}
        {/* Adresler — "Puanlarım" kartının deseni (kullanıcı kararı 09.08): başlık KARTIN İÇİNDE,
            satırlar kesikli çizgiyle ayrılır. Adres kartının kendi zemini kalktı; kart zaten yüzey. */}
        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>{t.addresses.title}</Text>
          {/* Liste OKUNURKEN satırların yeri tutulur (kullanıcı isteği 10.08). Eskiden liste boş
              dizi olarak başlıyordu ve ekran "hiç adresin yok" ile "adresler yükleniyor"u aynı
              gösteriyordu — ölçülemeyen değeri sıfır saymanın ta kendisi (CLAUDE §1). */}
          {addressBook.status === 'loading' ? <AccountAddressesSkeleton testID="account-addresses-loading" /> : null}
          {addressBook.addresses.map((address, index) => (
            <View key={address.id} style={index > 0 ? styles.settingsDivider : undefined}>
              <AddressCard
                address={address}
                copy={t.addresses}
                onMakeDefault={() => makeDefault(address)}
                onEdit={() => setAddressSheet({ editing: address })}
                testID={`account-address-${address.id}`}
              />
            </View>
          ))}
          {addressBook.status === 'error' || defaultFailed ? (
            <Note
              description={addressBook.status === 'error' ? t.addresses.loadError : t.addresses.defaultFailed}
              tone="terracotta"
              testID="account-address-error"
            />
          ) : null}
          <View style={addressBook.addresses.length > 0 ? styles.settingsDivider : undefined}>
            <TextAction label={t.addresses.add} onPress={() => setAddressSheet({ editing: null })} testID="account-address-add" />
          </View>
        </View>

        {/* Dil + yazı boyutu TEK kartta (kullanıcı kararı 09.08): ikisi de "nasıl okuyorum"
            sorusunun cevabı; ayrı kartlara bölmek aynı konuyu iki kez sorardı. Yazı boyutu
            seçimi ANINDA uygulanır — bu kart dahil bütün ekran yeniden çizilir. */}
        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>{t.language.title}</Text>
          <View style={styles.languageRow}>
            {LOCALES.map((option) => (
              <Chip
                key={option}
                label={t.language[option]}
                selected={locale === option}
                onPress={() => pickLanguage(option)}
                testID={`account-language-${option}`}
              />
            ))}
          </View>
          <View style={styles.settingsDivider}>
            <Text style={styles.cardTitle}>{t.fontSize.title}</Text>
          </View>
          <View style={styles.languageRow}>
            {FONT_SCALES.map((option) => (
              <Chip
                key={option}
                label={t.fontSize[option]}
                selected={fontScale === option}
                onPress={() => pickFontScale(option)}
                testID={`account-fontsize-${option}`}
              />
            ))}
          </View>
        </View>

        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>{t.marketing.title}</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t.marketing.email}</Text>
            <ToggleSwitch
              value={marketingEmail}
              onToggle={() => toggleConsent('email', !marketingEmail)}
              accessibilityLabel={`${t.marketing.title} · ${t.marketing.email}`}
              testID="account-marketing-email"
            />
          </View>
          <View style={[styles.switchRow, styles.switchDivider]}>
            <Text style={styles.switchLabel}>{t.marketing.whatsapp}</Text>
            <ToggleSwitch
              value={marketingWhatsApp}
              onToggle={() => toggleConsent('whatsapp', !marketingWhatsApp)}
              accessibilityLabel={`${t.marketing.title} · ${t.marketing.whatsapp}`}
              testID="account-marketing-whatsapp"
            />
          </View>
          <Text style={styles.switchNote}>{t.marketing.note}</Text>
          {/* Yazılamayan tercih SESSİZ KALMAZ: anahtar eski hâline döndü, sebep burada söylenir —
              dil ve izin aynı uca gittiği için tek satır ikisini de kapsar. */}
          {prefsFailed ? <Note description={t.marketing.saveFailed} tone="terracotta" testID="account-prefs-error" /> : null}

          {/* Bölge dışı müşteriye SORU (v3'te yok, kullanıcı kararı 09.08): gerekçe hook künyesinde. */}
          {outOfZone ? (
            <View style={styles.zoneBox}>
              <Text style={styles.zoneTitle}>{t.marketing.zone.title}</Text>
              <Text style={styles.zoneBody}>
                {t.marketing.zone.body.replace('{place}', defaultAddress?.city ?? '')}
              </Text>
              {interestSent ? (
                <Text style={styles.zoneDone}>{t.marketing.zone.done}</Text>
              ) : (
                <PrimaryButton label={t.marketing.zone.cta} onPress={sendZoneInterest} testID="account-zone-interest" />
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.dataCard}>
          <Text style={styles.dataTitle}>{t.data.title}</Text>
          <Text style={styles.dataBody}>{t.data.body}</Text>
          <TextAction
            label={t.data.privacy}
            onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'privacy' } })}
            testID="account-privacy"
          />
          {/* HESABI SİLME — kartın EN ALTINDA ve terracotta, ama vurgulu düğme DEĞİL: hesap
              sayfasının işi hesabı yönetmek, silmek onun en uç ucu (web'in aynı kararı). Dolgulu
              bir düğme sayfanın en güçlü çağrısı olur ve müşteriyi silmeye davet ederdi. */}
          <TextAction
            label={t.deleteAccount.action}
            onPress={() => {
              setDeleteFailed(false);
              setDeleteSheetOpen(true);
            }}
            tone="terracotta"
            testID="account-delete"
          />
        </View>

        <View style={styles.logoutRow}>
          {/* Gerçek çıkış (21.14c): oturum cihazdan silinir, `useMe` dinleyicisi vitrini misafire
              döndürür; sekme yerinde kalır ("oturumsuz kullanım = müşteri gezinmesi", 02-mimari §4).
              Çıkış hatası yutulMAZ ama ekrana da taşınmaz: depo temizliği deterministik
              (`clearStoredSession`), müşteri için sonuç aynı — çıkmıştır. */}
          <TextAction
            label={t.logout}
            onPress={() => {
              void signOut();
            }}
            tone="terracotta"
            testID="account-logout"
          />
        </View>
      </ScrollView>

      {/* ── "Nasıl puan kazanılır" çekmecesi (kullanıcı isteği 12.08) ────────────────
          Kaynağı KART, ayrı bir okuma değil: `wallet` sözleşme gereği kuralın kendisini de taşıyor
          (`MePointsCardSchema` = kural + kimlik). Çekmece yalnız kart varken açılabildiği için
          `wallet` burada hiç `null` olmaz — B2B'de düğme de çizilmiyor.

          ÇEKMECE, ayrı bir SAYFA değil: müşteri bir merak sorusu soruyor ve cevabı aldıktan sonra
          bulunduğu yere dönmek istiyor. Sayfa açsaydık geri tuşuyla dönülen bir gezinme adımı
          doğardı — kartın "başvuru yeri" rolüne ağır kaçardı. */}
      <BottomSheet
        visible={earnSheetOpen && wallet !== null}
        title={t.points.howToTitle}
        onClose={() => setEarnSheetOpen(false)}
        testID="account-earn-sheet"
      >
        {wallet === null ? null : (
          <PointsEarnList
            rules={wallet}
            actions={{
              ...earnActions,
              /* Çekmeceden gidilen her hedef ÖNCE çekmeceyi kapatır: altında açık bir modal
                 bırakıp gezinmek, geri dönüldüğünde ekranı kilitli gösterirdi. */
              referral: () => {
                setEarnSheetOpen(false);
                shareReferral();
              },
              neighbor: () => {
                setEarnSheetOpen(false);
                router.push('/orders');
              },
              review: () => {
                setEarnSheetOpen(false);
                router.push('/orders');
              },
              feedback_candidate: () => {
                setEarnSheetOpen(false);
                router.push('/discover');
              },
            }}
            showRules
            testID="account-earn-sheet-list"
          />
        )}
      </BottomSheet>

      {/* ── Hesabı silme çekmecesi (GDPR md. 17 · App Store 5.1.1(v)) ───────────────
          NEDEN İKİ ADIM: işlem geri alınamaz ve düğmenin kendisi bunu anlatamaz. Çekmece bir
          "emin misiniz?" değil, NE OLACAĞINI söyleyen bir ekran — web'in `delete-account.tsx`
          künyesindeki karar, native'de aynen.

          KALANI SÖYLEMEK, GİDENİ SÖYLEMEK KADAR ÖNEMLİ: silme bir `DELETE` değil; sipariş ve
          fatura kayıtları yasal olarak duruyor, FATURADAKİ AD VE ADRES DÂHİL. Yazmazsak
          "hesabımı sildim" diyen müşteri bir gün faturasında adını gördüğünde haklı olarak
          yanıltıldığını düşünür. İki blok da AYNI AĞIRLIKTA çizilir; dipnot olsaydı okunmazdı
          ve tam da okunmayan yer, sonradan "bana söylenmedi" denilecek yerdir.

          SİLDİKTEN SONRA ÇIKIŞ DA YAPILIR: sunucu `auth.users` satırını siliyor ama cihazdaki
          jetona dokunamıyor — web'de ÖLÇÜLMÜŞ tuzak (08.08: silme bitince oturum çerezi yerinde
          kalıyordu). Sıra da oradaki gibi: önce silme başarılı olur, SONRA oturum kapanır.
          Tersi olsaydı silmenin düştüğü bir koşuda müşteri hem hesabıyla hem çıkışla kalırdı. */}
      <BottomSheet
        visible={deleteSheetOpen}
        title={t.deleteAccount.title}
        onClose={() => setDeleteSheetOpen(false)}
        testID="account-delete-sheet"
      >
        <View style={styles.deleteBody}>
          <Text style={styles.deleteIntro}>{t.deleteAccount.body}</Text>

          <View style={styles.deleteBlock}>
            <Text style={styles.deleteBlockTitle}>{t.deleteAccount.goesTitle}</Text>
            <Text style={styles.deleteBlockBody}>{t.deleteAccount.goes}</Text>
          </View>

          <View style={[styles.deleteBlock, styles.deleteStays]}>
            <Text style={[styles.deleteBlockTitle, styles.deleteStaysTitle]}>{t.deleteAccount.staysTitle}</Text>
            <Text style={styles.deleteBlockBody}>{t.deleteAccount.stays}</Text>
          </View>

          <Text style={styles.deleteWarning}>{t.deleteAccount.irreversible}</Text>
          {deleteFailed ? <Note description={t.deleteAccount.failed} tone="terracotta" testID="account-delete-error" /> : null}

          {/* HİÇBİRİ DOLGULU DEĞİL (14.08, cihazda görülerek düzeltildi): ilk sürüm onayı
              `PrimaryButton` ile çiziyordu — dolgulu zeytin, ekranın en güçlü çağrısı — ve
              çekmecenin kendi künyesiyle çelişiyordu. Web'in aynı diyaloğunun kararı: vazgeç
              sessiz metin, onay DOLGUSUZ terracotta. Sıra da bilinçli: geri çekilme yolu solda
              ve ilk okunan, yıkıcı olan sağda. */}
          <View style={styles.deleteActions}>
            <TextAction
              label={t.deleteAccount.cancel}
              onPress={() => setDeleteSheetOpen(false)}
              disabled={deleting}
              testID="account-delete-cancel"
            />
            <SecondaryButton
              label={deleting ? t.deleteAccount.deleting : t.deleteAccount.confirm}
              onPress={() => void confirmDelete()}
              disabled={deleting}
              tone="terracotta"
              shape="pill"
              testID="account-delete-confirm"
            />
          </View>
        </View>
      </BottomSheet>

      {/* ── Profil çekmecesi (v3 `shPf`, v3:253-260) — üç alan + WhatsApp notu + Kaydet ── */}
      <BottomSheet
        visible={profileSheetOpen}
        title={t.edit.title}
        onClose={() => setProfileSheetOpen(false)}
        testID="account-profile-sheet"
      >
        <View style={styles.sheetForm}>
          <TextField
            value={draftName}
            onChangeText={(value) => {
              setDraftName(value);
              setProfileError(null);
            }}
            accessibilityLabel={t.edit.nameLabel}
            placeholder={t.edit.namePlaceholder}
            content="name"
            testID="profile-name"
          />
          {/* E-posta SALT OKUNUR (v3'te yazılabilir görünür): e-posta kimliğin kendisidir (auth
              anahtarı) — değişimi yeni adrese kod doğrulatan ayrı bir akış ister; sessizce
              yazılabilir göstermek kaydetmeyecek bir söz olurdu. */}
          <TextField
            value={data.email}
            onChangeText={() => undefined}
            editable={false}
            accessibilityLabel={t.edit.emailLabel}
            placeholder={t.edit.emailPlaceholder}
            testID="profile-email"
          />
          <TextField
            value={draftPhone}
            onChangeText={(value) => {
              setDraftPhone(value);
              setProfileError(null);
            }}
            accessibilityLabel={t.edit.phoneLabel}
            placeholder={t.edit.phonePlaceholder}
            helperText={t.edit.phoneNote}
            content="tel"
            testID="profile-phone"
          />
          {profileError === null ? null : <Note description={profileError} tone="terracotta" testID="profile-error" />}
          <PrimaryButton
            label={profileSaving ? t.edit.saving : t.edit.save}
            onPress={saveProfile}
            disabled={profileSaving}
            testID="profile-save"
          />
        </View>
      </BottomSheet>

      {/* ── Adres çekmecesi (v3 `shAddr`) — kitin ortak formu; checkout'la AYNI dosya. Dönen
          liste doğrudan yayınlanır: her yazma cevabı GÜNCEL listedir (uçların sözleşme kararı). */}
      <AddressSheet
        target={addressSheet}
        addresses={addressBook.addresses}
        onClose={() => setAddressSheet(null)}
        onSaved={(next) => addressBook.publish(next)}
        testID="account-address-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  sheetForm: {
    gap: theme.space.lg,
  },
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  content: {
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: theme.space['5xl'],
    gap: theme.space['2xl'],
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['card-title'],
    color: theme.colors.ink,
    paddingTop: theme.space.sm,
    paddingHorizontal: theme.space['4xl'],
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space['2xl'],
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
  },
  profileText: { flex: 1, gap: theme.space['2xs'] },
  profileName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['step-sm'],
    color: theme.colors.ink,
  },
  profileMeta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },

  companyCard: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.control,
    padding: theme.space['3xl'],
    gap: theme.space.xs,
  },
  companyEyebrow: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    color: theme.colors['olive-light'],
  },
  companyName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.button,
    color: theme.colors['sand-50'],
  },
  companyMeta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors['neutral-400'],
  },
  companyNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors['neutral-400'],
    marginTop: theme.space.xs,
  },

  pointsCard: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
    gap: theme.space.md,
  },
  pointsHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space.lg,
  },
  cardTitle: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  pointsValue: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['h2-sm'],
    color: theme.colors['olive-dark'],
  },
  cardBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  pointsGap: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  /* Puan KAZANMA yolları — sıfır bakiyede kartın içi (kullanıcı kararı 09.08). Satır düzeni
     ödeme/teslimat listelerinin aynısı (ikon · metin · eylem), ayraç kart içi kesikli çizgi. */
  earnList: { gap: theme.space.xs },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  earnText: { flex: 1, gap: theme.space['2xs'] },
  earnTitle: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  earnBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.hairline,
    borderStyle: 'dashed',
    borderColor: theme.colors['olive-line'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['2xl'],
  },
  couponCode: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.terracotta,
  },
  couponValue: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  referralCode: {
    flex: 1,
    textAlign: 'center',
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors['sand-500'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    letterSpacing: theme.text['body-sm'] * 0.06,
    color: theme.colors.ink,
    overflow: 'hidden',
  },

  menuCard: {
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    overflow: 'hidden',
  },

  block: { gap: theme.space.md },
  blockTitle: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  /* AYAR KARTI (kullanıcı kararı 09.08 — v3'te yok): adres/dil-yazı/izin bölümleri çıplak zeminde
     akıyor ve birbirine giriyordu. Yeni bir dil icat edilmedi — "Puanlarım" kartının deseni
     tekrarlandı (`pointsCard` ile aynı yüzey, yarıçap ve dolgu; başlık kartın İÇİNDE). */
  settingsCard: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
    gap: theme.space.md,
  },
  /* Bölge-dışı talep kutusu — kartın içinde İKİNCİ bir yüzey (terracotta ailesi): "bu senin
     durumun" demenin görsel yolu; kampanya satırlarıyla aynı tonda olsaydı okunmazdı. */
  zoneBox: {
    backgroundColor: theme.colors['terracotta-bg'],
    borderRadius: theme.radius.control,
    padding: theme.space['2xl'],
    gap: theme.space.md,
    marginTop: theme.space.md,
  },
  zoneTitle: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.terracotta,
  },
  zoneBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  zoneDone: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    color: theme.colors['olive-dark'],
  },
  /* Kart içi ayraç — menü kartının kesikli çizgisi; üstten nefes verir ki satırlar yapışmasın. */
  settingsDivider: {
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
    paddingTop: theme.space.lg,
    marginTop: theme.space.xs,
  },
  languageRow: {
    flexDirection: 'row',
    gap: theme.space.md,
  },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.space.xl,
  },
  switchDivider: {
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  switchLabel: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  switchNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors['sand-600'],
  },

  dataCard: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    padding: theme.space['2xl'],
    gap: theme.space.xs,
  },
  dataTitle: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.ink,
  },
  dataBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  logoutRow: {
    alignItems: 'center',
    paddingVertical: theme.space.md,
  },

  /* Silme çekmecesi — iki blok AYNI ağırlıkta, yalnız rengi ayrı: giden nötr zeminde, kalan
     bal renginde (uyarı değil, "dikkat: bu duruyor"). Metinler `body-sm`in altına inmez
     (MB-46'nın ölçütü): burada okunan her satır müşterinin KARAR için okuduğu metindir. */
  deleteBody: {
    gap: theme.space.lg,
    paddingBottom: theme.space.xl,
  },
  deleteIntro: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  deleteBlock: {
    gap: theme.space.xs,
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['2xl'],
  },
  deleteStays: {
    backgroundColor: theme.colors['honey-bg'],
    borderWidth: theme.border.hairline,
    borderColor: theme.colors['honey-line'],
  },
  deleteBlockTitle: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  deleteStaysTitle: {
    color: theme.colors.honey,
  },
  deleteBlockBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  deleteWarning: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.terracotta,
  },
  deleteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.space.lg,
  },
}));
