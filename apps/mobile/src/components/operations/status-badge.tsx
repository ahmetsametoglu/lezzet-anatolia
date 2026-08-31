import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { emToDp } from '../../theme/parse';
import { operationsTheme } from '../../theme/unistyles';

/*
  DURUM ROZETİ — düz, DOLGULU, dokunulamaz (v3 · 31.08).

  ── NEDEN AYRI BİR KOMPONENT ────────────────────────────────────────────────
  Tasarımda aynı geometri iki ayrı ekranda geçiyor ve ikisi de bir DURUM söylüyor:
    · v3:16 "Araçtaki Seferler" → seferin hâli ("sürülüyor" · "araçta bekliyor")
    · v3:18 "Araca Yükle"       → sefer grubunun sayacı ("3/8")
  İkisi de `border-radius:10px · padding:5px 9-10px · 800 küçük punto · harf aralığı` — yani tek
  bir karar. Ayrı ayrı çizilseydi biri bir gün ötekinden ayrılırdı ve fark hiçbir yerde
  görünmezdi (CLAUDE §1'in "hiçbir türde duplication yok" dalı).

  ── KİTTEKİ ÖTEKİ ROZETLERDEN FARKI ─────────────────────────────────────────
  `Tag` müşteri yüzeyinin EĞİK rozeti (fiyat çipi, "Tükendi") — dönüşü ve gölgesi var, buradaki
  düz durum etiketiyle akrabalığı yok. `Chip` ise BASILABİLİR bir seçim öğesi; bu rozet bir eylem
  değil bir gerçektir, dokunulmaz. Kurye gün ekranındaki `stopTag` da bu değil: o ZEMİNSİZ, yalnız
  renkli metin (v3:15'in kendi kararı) — dolgulu bir rozete çevirmek durak kartlarının sakin
  hiyerarşisini bozardı.

  ── KÖŞE KADEMESİ ───────────────────────────────────────────────────────────
  Tasarım 10px yazıyor; token setinin `badge` kademesi 12px. Yeni bir kademe AÇILMADI: 2px'lik
  fark gözle ayırt edilmiyor ve dört kademeli köşe kararını beşe çıkarmak, tasarımın kendi
  envanterine (00-ortak §0) ikinci bir kaynak eklemek olurdu.
*/

/** Ton = rozetin SÖYLEDİĞİ şey; renk oradan türer, çağıran renk seçmez. */
export type OperationsStatusTone = 'active' | 'idle' | 'warn' | 'error';

interface OperationsStatusBadgeProps {
  /** Rozet metni — i18n üstte çözülür, komponent metin gömmez. */
  label: string;
  tone?: OperationsStatusTone;
  testID?: string;
}

export function OperationsStatusBadge({ label, tone = 'idle', testID }: OperationsStatusBadgeProps) {
  return (
    <Text style={[styles.badge, styles[tone]]} testID={testID}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.md,
    overflow: 'hidden',
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
  },
  /** Sürülen sefer, tamamlanmış grup — işin AKTİF ya da bitmiş hâli. */
  active: {
    color: operationsTheme.colors['olive-dark'],
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  /** Bekleyen sefer, henüz başlamamış grup — sessiz. */
  idle: {
    color: operationsTheme.colors.muted,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  /** Eksik yükleme gibi "dikkat ama engel değil" hâller. */
  warn: {
    color: operationsTheme.colors.warehouse,
    backgroundColor: operationsTheme.colors['warning-bg'],
  },
  error: {
    color: operationsTheme.colors.error,
    backgroundColor: operationsTheme.colors['error-bg'],
  },
});
