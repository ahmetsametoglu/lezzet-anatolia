import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/*
  CANLI TAZELEME — "ekranda gördüğüm şey şu anki gerçek mi" sorusunun TEK kapısı (02.09).

  ── ÖLÇÜLEN ARIZA ───────────────────────────────────────────────────────────
  Ekranlarımızın çoğu veriyi YALNIZ monte olurken okuyor; telefonlar da kapatılmaz, cebe konur.
  Kullanıcı cihazda iki hâlini birden yakaladı:

  · **Sipariş durumu** — sipariş 17:52'de hazırlandı, ekran 18:23'te hâlâ "Alındı" diyordu
    (`21.209`ın ölçümü; vitrindeki takip şeridi de aynı cümleyi taşıyordu).
  · **Teslimat kapsamı** — kapsanmayan bir kod aktif rotaya eklendi, sistem müşteriye BİLDİRİM
    gönderdi, açık duran uygulama hâlâ "buraya gelmiyoruz" diyordu. İki yüzey aynı anda
    birbirini yalanlıyor ve bildirimi güvenilmez kılıyordu.

  İkincisi ötekinden ağır: orada yalnız bayat bir sayı yok, SİSTEMİN KENDİ HABERİNİ yalanlayan bir
  ekran var.

  ── İKİ TETİKLEYİCİ, ÇÜNKÜ İKİ AYRI "ŞİMDİ" (kullanıcı kararı 02.09) ──────────
  İlk tur yalnız öne dönüşü dinliyordu ve kullanıcı eksiği hemen gördü: *"bu arka plana gitmeden
  ön plandayken de yenilenmesi lazım"*. İki yol da gerçek ve ikisi ayrı anı yakalıyor:

  1. **Öne dönüş** — uygulama arka plandaydı, kullanıcı geri geldi.
  2. **Süre** — kullanıcı ekranda DURUYOR ve hiçbir şey yapmıyor. Kapsam ve sipariş durumu
     sunucuda değişebilir; sayfada oturan biri değişikliği görmek için bir şey yapmak zorunda
     kalmamalı. Başka bir ekrana gidip GERİ dönmek de bu yolla karşılanıyor: alttaki ekran
     sökülmez, sayacı çalışmaya devam eder.

  Aşağı çekme (`RefreshControl`) üçüncü yol ama BURADA DEĞİL: o bir jesttir, çağıranın kendi
  kaydırma alanına bağlanır — kancanın döndürdüğü `refresh` doğrudan `onRefresh`e verilir.

  ── ODAK KANCASI BİLEREK KULLANILMADI (ölçüldü 02.09) ───────────────────────
  Bir tur `useFocusEffect` ile "odağa dönüşte tazele" eklendi ve geri alındı: kanca `expo-router`a
  bağımlılık getiriyor ve ekran testlerinin 18'i o modülü kendi fabrikasıyla taklit ediyor —
  hepsi anında `useFocusEffect is not a function` ile düştü. Bedeli kazancından büyüktü: bugünden
  sonra `expo-router`ı taklit eden HER yeni ekran testi aynı duvara çarpardı, üstelik kancanın
  eklediği tek şey "60 saniyeyi beklemeden tazele"ydi. Gezinme bağımlılığı olmayan bir ilkel,
  kitin her yerinden çağrılabilir olan ilkeldir.

  ── ARALIK PARAMETRİK, VARSAYILANI ÖLÇÜYE GÖRE (CLAUDE §4) ──────────────────
  60 sn: kapsam kararı saat başı koşan bir işten geliyor (`zone_available`), sipariş durumu ise
  depocunun eliyle değişiyor — ikisi de dakikalar mertebesinde. Daha sık sormak pil ve tel
  harcar, daha seyrek sormak "ekranda duruyordum, değişmedi" şikâyetini geri getirir.

  SAYAÇ YALNIZ ÖNDE İŞLER: arka plandayken tıklasa da tazeleme yapılmaz — görünmeyen bir ekran
  için tel açmak olurdu; dönüşü zaten birinci yol yakalıyor.
*/

/** Ekranda beklerken tazeleme aralığı (ms). Parametrik — çağıran kısaltabilir/uzatabilir. */
export const LIVE_REFRESH_INTERVAL_MS = 60_000;

interface LiveRefreshOptions {
  /** `0` = süreli tazeleme kapalı; ekranın verisi zamanla değişmiyorsa çağıran kapatır. */
  intervalMs?: number;
}

/**
 * Veriyi CANLI tutar: uygulama öne döndüğünde ve ekranda beklerken düzenli olarak `refresh`i
 * çağırır. İLK okumayı YAPMAZ — o çağıranın kendi efektinin işi; burada da yapmak her açılışta
 * ikinci bir istek demekti.
 *
 * `refresh` kimliği DEĞİŞEBİLİR (çağıranların çoğu onu `useCallback`siz veriyor); abonelikler onu
 * bağımlılık olarak almaz, ref'ten okur — yoksa her çizimde dinleyici sökülüp yeniden kurulurdu ve
 * tam o karede gelen bir geçiş kaybolurdu.
 */
export function useLiveRefresh(refresh: () => void, options: LiveRefreshOptions = {}): void {
  const { intervalMs = LIVE_REFRESH_INTERVAL_MS } = options;
  const latest = useRef(refresh);
  latest.current = refresh;

  /*
    ── ÖLÇÜT "ARKA PLANI GÖRMÜŞ OLMAK", ÖNCEKİ DURUM DEĞİL ───────────────────
    İlk kurgu *"önceki hâl `active` değilse tazele"* diyordu ve testi kırdı — haklı olarak. iOS üç
    hâl üretiyor ve ikisi bizim sorumuzun cevabı DEĞİL:

    · bildirim merkezini aşağı çekmek / arama çubuğu / gelen çağrı → `active → inactive → active`
      (uygulama hiç arka plana düşmedi: burada tazelemek her sıyırmada bir istek demek),
    · gerçekten çıkıp dönmek → `background → inactive → active` (yani `active`ten hemen ÖNCEKİ hâl
      `background` değil, `inactive`).

    İkisi de "önceki hâl `active` değil" testinden geçiyor; biri yanlış tazeler, öteki `background`a
    bakan katı bir kuralda hiç tazelenmezdi. Doğru soru anlıktaki geçiş değil: **son tazelemeden bu
    yana arka plana düştük mü?** Bayrak `background` görülünce yanar, dönüşte harcanır.
  */
  useEffect(() => {
    let wasAway: boolean = AppState.currentState === 'background';

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        wasAway = true;
        return;
      }
      if (next !== 'active' || !wasAway) return;
      wasAway = false;
      latest.current();
    });

    return () => {
      subscription.remove();
    };
  }, []);

  /*
    SÜRE — ekranda bekleyen kullanıcı için. Zamanlayıcı montajla doğar, sökülünce ölür.
  */
  useEffect(() => {
    if (intervalMs <= 0) return;
    const timer = setInterval(() => {
      // Arka planda tazelemek görünmeyen bir ekran için istek demekti — dönüşü yukarıdaki
      // abonelik zaten yakalıyor.
      if (AppState.currentState === 'active') latest.current();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
}
