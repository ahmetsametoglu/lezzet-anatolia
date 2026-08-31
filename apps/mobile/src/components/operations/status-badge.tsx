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
export type OperationsStatusTone = 'live' | 'active' | 'idle' | 'pending' | 'warn' | 'error';

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
  /*
    ŞU AN OLAN ŞEY — DOLU zeytin, krem yazı (v3:16 `rozetBg:#5f7a2c · rozetFg:#f5f1e6`).

    `active`ten AYRI bir ton ve ayrım tasarımın kendi ayrımı: "sürülüyor" bir DURUM değil bir
    AN'dır — listedeki tek kartı ötekilerden koparması gerekir. Yumuşak `active` ile çizilmişti ve
    cihazda üç kart aynı ağırlıkta duruyordu (tur 31.08).
  */
  live: {
    color: operationsTheme.colors['on-image'],
    backgroundColor: operationsTheme.colors.olive,
  },
  /** Tamamlanmış grup, olumlu ama sakin hâl — yumuşak zeytin (v3:18 `#46601f` / `#e3ecd2`). */
  active: {
    color: operationsTheme.colors['olive-dark'],
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  /** Bekleyen sefer, henüz başlamamış grup — sessiz. */
  idle: {
    color: operationsTheme.colors.muted,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  /*
    EKSİK AMA ENGEL DEĞİL — terracotta (v3:18 `grupFg:#b05c2e · grupBg:#f6e6d6`).

    `warn`dan ayrı: `warn` UYARIDIR (amber, "dikkat et"), bu ise henüz BİTMEMİŞ bir sayaçtır ve
    tasarım onu operasyonun terracotta ailesiyle yazıyor. Nötr griyle çizilmişti; yükleme
    listesinde biten grupla bitmeyen grup ayırt edilemiyordu (tur 31.08).
  */
  pending: {
    color: operationsTheme.colors.terracotta,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
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
