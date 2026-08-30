import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';

/*
  YÖNETİMİN MESAJ BALONCUĞU — iki yazışma ekranının ORTAK anatomisi (kullanıcı kararı 30.08, N10).

  ── NİÇİN VAR ───────────────────────────────────────────────────────────────
  Yönetimde iki mesajlaşma ekranı var ve kullanıcı ikisini de aynı gözle okuyor: *"sistemde iki
  ayrı mesajlaşma bölümü var… mevcut sosyal mesajlaşma tasarımını alıp talep ekranında
  kullanabiliriz."* Bugün ikisi aynı şeyi iki kez tarif ediyordu (ölçüm 30.08: `bubble`,
  `bubbleLeft/Right`, `bubbleCustomer`, `bubbleBody`, `bubbleCaption` — sosyal sohbette ve
  şikâyet ekranında ayrı ayrı) ve İKİSİ FARKLI ÇİZİYORDU: sosyal v3'ün anatomisindeydi (künye
  baloncuğun DIŞINDA, bizim söz koyu, kuyruk köşesi sivri), şikâyet v2'nin (künye baloncuğun
  İÇİNDE, iki taraf da açık zeminli).

  ── V3'ÜN ANATOMİSİ (sosyal sohbetten devralındı, v3:2246-2250) ─────────────
  · **Künye baloncuğun DIŞINDA, altında ve kendi tarafına hizalı.** İçeride olduğunda mesajın ilk
    satırı gibi okunuyordu — göz metni arıyor, önce künyeyi buluyordu.
  · **Bizim sözümüz KOYU** (`ink`), müşterininki beyaz kart. Kontrast "kim konuşuyor"u hizadan
    bağımsız söyler; iki açık baloncuk yan yana gelince hiza tek başına yetmiyordu.
  · **Kuyruk köşesi**: konuşanın tarafına bakan alt köşe sivrileşir (v3 5 px; ölçekte en yakın
    durak `tight` = 8) — baloncuk konuşana "yapışır".
  · **Genişlik en çok %86**: baloncuk satırı doldurmaz, boşluk da bir bilgidir.

  ── DÖRT TON, ÜÇÜ GÖNDERİLMİŞ BİRİ TASLAK ──────────────────────────────────
  `customer` gelen · `operator` bizim gönderdiğimiz · `ai` asistanın GÖNDERİLMİŞ mesajı (operatörden
  ayrı ton: ekran AI'ı gizlemez) · `draft` henüz gönderilmemiş öneri, KESİKLİ çerçeveyle. Taslağın
  kesikli olması kitin `invite` tonuyla aynı dili konuşur: "burada bir şey var ama henüz olmadı".

  ── ALTLIK (`footer`) BALONCUĞUN DIŞINDA ────────────────────────────────────
  Çeviri düğmesi ("orijinali gör") gibi ekler künyenin altına iner, baloncuğun içine değil: baloncuk
  yalnız SÖYLENEN ŞEYİ taşır. İçeride olduğunda düğme mesajın parçası gibi okunuyordu.
*/

export type ChatBubbleTone = 'customer' | 'operator' | 'ai' | 'draft';

interface ManagementChatBubbleProps {
  tone: ChatBubbleTone;
  /** Mesajın kendisi. */
  body: string;
  /** Baloncuğun ALTINDAKİ künye — damga, yazar, kalıp adı. Yoksa satır hiç doğmaz. */
  caption?: string;
  /** Künyenin altına inen ek (çeviri düğmesi, taslak eylemleri). */
  footer?: ReactNode;
  testID?: string;
}

/** Gelen mesaj solda, bizim ve asistanın sözü sağda — taslak da bizim tarafımızdadır. */
const SIDE = {
  customer: 'left',
  operator: 'right',
  ai: 'right',
  draft: 'right',
} as const satisfies Record<ChatBubbleTone, 'left' | 'right'>;

export function ManagementChatBubble({ tone, body, caption, footer, testID }: ManagementChatBubbleProps) {
  return (
    <View style={[styles.line, SIDE[tone] === 'left' ? styles.lineLeft : styles.lineRight]} testID={testID}>
      <View style={[styles.bubble, styles[tone]]}>
        <Text style={tone === 'operator' ? styles.bodyOnInk : styles.body}>{body}</Text>
      </View>
      {caption === undefined ? null : <Text style={styles.caption}>{caption}</Text>}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    maxWidth: '86%',
    gap: operationsTheme.space['2xs'],
  },
  lineLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  lineRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
  },
  customer: {
    borderBottomLeftRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
  },
  operator: {
    borderBottomRightRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors.ink,
  },
  ai: {
    borderBottomRightRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  /** Taslak: gönderilmemiş sözün çerçevesi KESİKLİ — şeklinden okunur, rengine bakılmaz. */
  draft: {
    borderBottomRightRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderStyle: 'dashed',
  },
  body: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  bodyOnInk: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['on-image'],
  },
  caption: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['sand-600'],
  },
});
