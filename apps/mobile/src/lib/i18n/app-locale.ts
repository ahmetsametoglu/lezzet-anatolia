import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { LOCALES, type Locale } from '@lezzet/i18n';

import { DEVICE_STORE_KEYS, deviceStore } from '@/lib/storage/device-store';

import { deviceLocale } from './locale';

/*
  UYGULAMANIN DİLİ (kullanıcı kararı 09.08) — dil artık cihazın dayattığı bir olgu değil,
  KULLANICININ SEÇİMİ. Bu modül o seçimin uygulama içindeki TEK KAYNAĞIDIR: hem ekran metinlerinin
  sözlüğü (`messages[locale]`) hem sunucuya giden `?locale=` buradan okunur — ürün adı bir dilden,
  başlık başka dilden gelemesin (`lib/api/catalog.ts` künyesindeki söz).

  ── DİL NEREDE YAŞAR: ARAYÜZ TERCİHİ DEĞİL, MÜŞTERİNİN DİLİ ─────────────────
  Bu değer bir görünüm ayarı değildir; müşteriyle kurulan YAZIŞMANIN dilidir ve asıl yeri
  VERİTABANIDIR: `user_profiles.preferred_language` (`supabase/migrations/0001_auth_user_profiles.sql`
  — `not null default 'fr'`). Onu okuyanlar uygulamanın dışındadır: geri bildirim davet mailleri,
  bölge-açıldı bildirimi, OTP maili, sipariş anlık görüntüsü. Yani burada tutulan şey kaynağın
  KENDİSİ değil, cihazdaki YANSIMASIDIR.

  ZİNCİR ZATEN KURULU (iki yüzeyde aynı, mobil için yeniden yazılmadı):
  · Misafirde dil cihazın dilidir (`deviceLocale()`), onboarding'de seçilirse onun cevabıdır.
  · HESAP AÇILIŞINDA o dil profile TOHUMLANIR — yalnız YENİ kartta
    (`packages/application/src/auth/otp.ts` → `seedPreferredLanguage`; web ikizinin künyesi:
    "var olan müşterinin dilini ezmeyiz"). Mobil OTP çağrısı `locale`i zaten gönderiyor
    (`lib/auth/otp.ts` ← giriş ekranı bu modülden okur), yani mobilden açılan kartta da doğru düşer.
    BU YÜZDEN onboarding seçimi için AYRI bir yazma YOK: ikinci bir yol, tohumla yarışırdı.
  · Sonradan değişiklik `PATCH /me/preferences` ile profilin üstüne yazar (hesap ekranı).

  ── ÖNCELİK SIRASI (kaynak profildir, yerel kayıt onun ÖNBELLEĞİDİR) ────────
  1. GİRİŞLİ kullanıcıda `/me`.preferredLanguage KAZANIR — cihaz dili de, bu cihazda daha önce
     yapılmış yerel seçim de onu EZMEZ (`applyProfileLocale`). Kişi dilini Hesabım'dan ya da
     web'den değiştirmiş olabilir; kartındaki cevap, telefonun tahmininden üstündür.
  2. MİSAFİRDE yerel seçim (onboarding), o da yoksa cihaz dili.
  3. ÇEVRİMDIŞI / `/me` OKUNAMADI: son bilinen değerle açılır, cihaz diline DÜŞÜLMEZ — düşülseydi
     kullanıcının seçtiği dil bir ağ arızasında kaybolmuş gibi görünürdü (CLAUDE §1: ölçülemeyen
     değer varsayılan değildir). Yerel kayıt tam bu yüzden var.
  Hesap ekranındaki değişiklik ÖNCE yerele yazılır (anında görünsün), sonra `PATCH`e gider; ret
  gelirse geri alınır — o ekranın mevcut iyimser-yazım deseni.

  DESEN — modül durumu + abonelik (`lib/toast/toast-store.ts` ile aynı, `useSyncExternalStore`):
  dil değişince ABONE HER EKRAN yeniden çizilir. React context'i seçilmedi çünkü bu değer ağacın
  DIŞINDAN da yazılıyor (profil `use-me.hook`tan geliyor) ve senkron okunabilir olması gerekiyor;
  context bunun için bir sağlayıcı ve bir köprü daha isterdi.

  İLK KARE DOĞRU DİLDE: yerel kayıt okunmadan ağaç çizilirse ekran bir an cihaz dilinde görünüp
  sıçrardı. Kök layout `initAppLocale()` kapısını bekler (yazı ölçeğinin `readFontScale` kapısıyla
  aynı desen, `app/_layout.tsx`). Profil cevabı ağdan sonra gelir; farklıysa ekranlar o an döner —
  kapının ardında beklenmez, çünkü ağ cevabını beklemek uygulamayı açılışta ağa bağımlı kılardı.
*/

/* Cihaz deposu TEK KAPIDAN (`lib/storage/device-store`): ham anahtar dizgesi burada yazılmaz ve
   yeniden kurulum temizliği bu kaydı kendiliğinden kapsar (o modülün kendi künyesi). */
const STORE_KEY = DEVICE_STORE_KEYS.appLocale;

/** Depodan dönen değer bizim yazdığımız değer olmayabilir (eski sürüm, bozuk kayıt) — doğrulanır. */
const AppLocaleSchema = z.enum(LOCALES);

/** Bilinen dil — kullanıcının seçimi ya da profilden gelen cevap; `null` = hiç bilinmiyor. */
let chosen: Locale | null = null;
/** Depo okundu mu — "kayıt yok" hükmü ancak okuma bittikten SONRA verilebilir. */
let initialized = false;
/** Kapı kapanmadan gelen profil cevabı — init bitince uygulanır (yarış: taze olan kazanır). */
let pendingProfile: Locale | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

async function persist(locale: Locale): Promise<void> {
  try {
    await deviceStore.setItem(STORE_KEY, locale);
  } catch {
    // Kalıcılık düşerse seçim BU oturumda yine geçerli; sonraki açılış cihaz diline döner —
    // ayar kaybı okunur bir arıza, sessiz de olsa kırıcı değil (yazı ölçeğindeki hükümle aynı;
    // mobilde log altyapısı yok — 01-teknoloji §9).
  }
}

/**
 * Uygulamanın dili — hook'suz, senkron okuma; kapı kapanmadan çağrılırsa cihaz dilini döndürür
 * (ilk kare zaten kapının ARDINDA çizilir).
 *
 * BİLEREK İHRAÇ EDİLMEDİ: bugün tek okuyanı `useAppLocale`, sunucuya giden `?locale=` de dili
 * ekranlardan alıyor. Komponent OLMAYAN bir çağıran (arka plan işi, bildirim kaydı) doğduğu gün
 * başına `export` yazmak yeter — bugünden ihraç etmek, kullanılmayan bir kapı açmaktı (`knip`).
 */
function getAppLocale(): Locale {
  return chosen ?? deviceLocale();
}

async function runInit(): Promise<void> {
  try {
    const raw = await deviceStore.getItem(STORE_KEY);
    const parsed = AppLocaleSchema.safeParse(raw);
    if (parsed.success) chosen = parsed.data;
  } catch {
    // Okuma düşerse "kayıt yok" ile aynı kapıya çıkar: cihaz dili geçerli olur, uygulama kararmaz.
  }
  initialized = true;
  emit();
  /* Kapı kapanmadan profil cevabı geldiyse ŞİMDİ uygulanır — ve depodan okunanı EZER: profil
     kaynaktır, buradaki kayıt onun önbelleğidir. */
  const profile = pendingProfile;
  pendingProfile = null;
  if (profile !== null) applyProfileLocale(profile);
}

/** Tek uçuşlu söz (`ensureFreshInstall` deseni): kaç kez çağrılırsa çağrılsın depo bir kez okunur. */
let init: Promise<void> | null = null;

/** Cihazdaki son bilinen dili okur — kök layout ağacı çizmeden önce bunu bekler. */
export function initAppLocale(): Promise<void> {
  init ??= runInit();
  return init;
}

/**
 * Kullanıcının SEÇİMİ (onboarding · Hesabım) — anında uygulanır, sonra cihaza yazılır.
 *
 * Profile YAZMAZ ve yazmamalı: girişliyken karta işlemek hesap ekranının `PATCH /me/preferences`
 * çağrısının işidir (ret hâlinde geri alınabilsin diye), misafirde ise seçim giriş anında OTP
 * çağrısıyla tohum olarak zaten gider (künye: zincir). Buradan üçüncü bir yazma yolu açmak,
 * ikisiyle de yarışırdı.
 */
export async function setAppLocale(locale: Locale): Promise<void> {
  const changed = chosen !== locale;
  chosen = locale;
  if (changed) emit();
  /* Değer AYNI olsa bile yazılır: cihazda hiç kayıt yokken dil "cihazın tahmini"dir; seçimden
     sonra "kullanıcının cevabı"dır ve çevrimdışı açılışta okunacak olan odur. */
  await persist(locale);
}

/**
 * Profilden gelen dil (`/me`.preferredLanguage) — GİRİŞLİ kullanıcıda KAYNAK budur ve yereldeki
 * değeri EZER (künye: öncelik sırası §1). Kalıcı yazılır ki bir sonraki açılış, ağ olmasa da
 * kullanıcının kendi dilinde açılsın.
 *
 * Değer zaten aynıysa hiçbir şey yapılmaz: her `/me` okumasında yayın yapmak (her açılış, her
 * oturum değişimi) tüm ekranları boşuna yeniden çizerdi.
 */
export function applyProfileLocale(locale: Locale): void {
  if (!initialized) {
    pendingProfile = locale;
    return;
  }
  if (chosen === locale) return;
  chosen = locale;
  emit();
  void persist(locale);
}

/* Abonelik fonksiyonu MODÜL DÜZEYİNDE: her render'da yeni bir kapanış verilseydi React her
   çizimde aboneliği söküp yeniden kurardı — bu hook yirmiden fazla ekranda çağrılıyor. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ekranların okuduğu dil — değişince abone ekran yeniden çizilir. */
export function useAppLocale(): Locale {
  return useSyncExternalStore(subscribe, getAppLocale);
}
