import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './icon';
import { PressableSurface } from './pressable-surface';

/*
  SES ÇALAR — uygulamanın İÇİNDE (kullanıcı kararı 07.09: *"Sesli mesaj uygulama içerisinde
  dinlenebilmeli… Uygulama dışına çıkışlar olmamalı."*).

  ── ÖNCEKİ HÂL VE NEDEN YETMEDİ ─────────────────────────────────────────────
  Sesli mesaja dokunuş imzalı adresi sistem tarayıcısında açıyordu. Çalışıyordu — cihazda ölçüldü,
  dosya indi ve çaldı — ama operatörü yazışmadan çıkarıyordu: sesi dinleyip geri döndüğünde
  konuşmanın neresinde kaldığını yeniden bulmak zorundaydı. Bir sesli mesaj, cevabı yazarken
  dinlenmek ister.

  ── `expo-audio`, `expo-av` DEĞİL ───────────────────────────────────────────
  `expo-av` SDK 54'ten beri yerini `expo-audio`ya bıraktı; yeni kurulumda onu seçmek bir gün
  gelecek bir taşımayı bugünden yapmak demek. Modül NATİFtir: eklenmesi dev client'ın yeniden
  derlenmesini gerektirdi (`pnpm rebuild:android`) — bedeli bu, ve kullanıcı kararı bu bedeli
  kabul etti.

  ── DURUM SÜRÜCÜDEN OKUNUR, TAHMİN EDİLMEZ ──────────────────────────────────
  `useAudioPlayerStatus` çalma hâlini, geçen süreyi ve toplam süreyi sürücünün kendisinden verir.
  Yerel bir sayaç tutulsaydı arabelleğe alma sırasında ekran ilerlemeye devam eder ve operatör
  duymadığı bir saniyeyi geçmiş sayardı.

  Süre `null` gelebilir (henüz yüklenmedi) ve o zaman SIFIR YAZILMAZ — ölçülemeyen değer sıfır
  değildir (CLAUDE §1). Ekran o an yalnız geçen süreyi gösterir.
*/

interface AudioPlayerLabels {
  play: string;
  pause: string;
  /** Yükleniyor — kaynak henüz hazır değil; düğme basılamaz. */
  loading: string;
}

interface AudioPlayerProps {
  /** İmzalı okuma adresi. `null` = dosya elimizde yok; çağıran zaten kendi cümlesini yazar. */
  uri: string;
  labels: AudioPlayerLabels;
  testID?: string;
}

/** `mm:ss` — saat gerekmez; sesli mesaj dakikalarla ölçülür. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function AudioPlayer({ uri, labels, testID }: AudioPlayerProps) {
  const { theme } = useUnistyles();
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  /*
    SESSİZ MODDA DA ÇALAR (SDK 57 `setAudioModeAsync` · `playsInSilentMode`). Varsayılan davranış
    iOS'ta sessiz anahtarına uyar — yani operatörün telefonu sessizdeyken düğmeye basar, çubuk
    ilerler, HİÇBİR ŞEY DUYULMAZ. Sebebi görünmeyen bir sessizlik, arızaların en sinsisidir.

    Kip her çalarda kurulur ve bu ucuz: çağrı bir ayarı yazar, kaynak açmaz. Hata yutulmuyor ama
    yükseltilmiyor da — kip kurulamazsa ses yine çalar, yalnız sessiz anahtarına uyar.
  */
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  const playing = status.playing;
  const ready = status.isLoaded;
  /* Süre 0'sa henüz bilinmiyor demektir (sürücü yüklemeden önce 0 verir) — "0:00 / 0:00" yazmak,
     bilinmeyeni ölçülmüş gibi göstermek olurdu. */
  const total = status.duration > 0 ? status.duration : null;

  const toggle = () => {
    if (!ready) return;
    if (playing) {
      player.pause();
      return;
    }
    // Sonuna gelmiş bir kayıtta "çal" baştan başlatır; yoksa düğme hiçbir şey yapmıyor görünürdü.
    if (total !== null && status.currentTime >= total - 0.1) void player.seekTo(0);
    player.play();
  };

  const label = !ready ? labels.loading : playing ? labels.pause : labels.play;

  return (
    <View style={styles.row} testID={testID}>
      <PressableSurface
        onPress={toggle}
        disabled={!ready}
        feedback="opacity"
        compact
        style={styles.button}
        accessibilityLabel={label}
        testID={testID === undefined ? undefined : `${testID}-toggle`}
      >
        <Icon name={playing ? 'pause' : 'play'} size={ICON} color={theme.colors.olive} />
      </PressableSurface>

      <View style={styles.track} testID={testID === undefined ? undefined : `${testID}-track`}>
        {/* İlerleme çubuğu SÜRÜKLENMEZ: sesli mesaj kısadır ve bir "sarma" tutamağı, kazara
            dokunuşla operatörün duyduğu yeri kaybettirirdi. Baştan dinlemek için düğme yeter. */}
        <View
          style={[styles.fill, { width: total === null ? 0 : `${Math.min(100, (status.currentTime / total) * 100)}%` }]}
        />
      </View>

      <Text style={styles.time} testID={testID === undefined ? undefined : `${testID}-time`}>
        {total === null ? clock(status.currentTime) : `${clock(status.currentTime)} / ${clock(total)}`}
      </Text>
    </View>
  );
}

const ICON = 20;
/** Çubuk kalınlığı — yapısal ölçü, boşluk ölçeğinden alınmaz (dolgu değil, öğenin kendi ölçüsü). */
const TRACK_HEIGHT = 4;

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  button: {
    width: theme.size.iconButton,
    height: theme.size.iconButton,
    borderRadius: theme.size.iconButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['olive-bg'],
  },
  /* Çubuk ESNER (`flex: 1`): kalan genişliği alır, sabit ölçü dar ekranda süreyi taşırdı. */
  track: {
    flex: 1,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
    backgroundColor: theme.colors['sand-300'],
  },
  fill: {
    height: '100%',
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: theme.colors.olive,
  },
  time: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
    // Rakamlar sabit genişlikte hizalanır: saniye ilerlerken satır oynamasın.
    fontVariant: ['tabular-nums'],
  },
}));
