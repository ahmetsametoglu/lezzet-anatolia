import type { ReactNode } from 'react';
import { View } from 'react-native';

import { operationsTheme } from '@/theme/unistyles';

/*
  BAŞLIK SIZDIRMASI — gövdenin dolgusunu başlığın üstünden geri alan sarmalayıcı.

  ── NEDEN VAR (kullanıcı bulgusu 08.09) ─────────────────────────────────────
  `OperationsStackHeader`ın KENDİ dolgusu var ve tasarımın ölçüsü odur: sayfa kenarı 20, üst nefes
  18 (o dosyanın v3 ölçümü). Ama ekranlar aynı başlığı DURUMA GÖRE iki ayrı kaba koyuyor:

    · yükleme/hata/boş dallarında ekran kökünün doğrudan çocuğu  → kendi ölçüsünde
    · veri gelince kaydırıcının gövdesinin içinde                → gövdenin dolgusu üstüne biner

  Sonuç iki arıza birden: veri geldiği anda başlık YER DEĞİŞTİRİYOR, ve hazır hâl TASARIMDAN
  SAPIYOR — doğru olan yükleme hâliydi. Cihazda ölçüldü (Oppo CPH1907, ölçek 2,55): geri düğmesi
  107 px = 42 birim (20 + 22), olması gereken 51 px = 20 birim.

  ── NEDEN BAŞLIK KOMPONENTİ BUNU KENDİ ÇÖZEMİYOR ────────────────────────────
  Kullanıcının sorusu haklıydı (*"ortak bir komponent değil mi bu?"*): başlık ortak ve kusur ONDA
  DEĞİL, kendi dolgusu doğru. Kusur YERLEŞTİRMEDE — bir komponent kendisinin hangi kabın içine
  konduğunu ve o kabın dolgusunun ne olduğunu ÖĞRENEMEZ. Bu yüzden düzeltme, kabı bilen tarafın
  bildireceği bir değerle çalışmak zorunda: ekran kendi gövdesinin dolgusunu `pad` ile söyler.

  Yani ortak olan DÜZELTME, ölçü değil. Ölçü ekrandan ekrana değişiyor (bugün `2xl`den `6xl`e
  beş ayrı durak) ve tek bir sabite bağlanamaz; ama gerekçe, künye ve mekanik tek yerde durur.
  Yirmiye yakın ekranda aynı stil bloğunu ve aynı yorumu kopyalamak CLAUDE §1'in yasakladığı
  duplication'ın ta kendisiydi.

  ── KULLANIMI ──────────────────────────────────────────────────────────────
  Yalnız başlık kaydırıcının İÇİNDE çizilen dalda sarılır; kabın dışında duran dallarda başlık
  zaten kendi ölçüsünde, sarılmaz.

    <OperationsHeadBleed pad="6xl">{header}</OperationsHeadBleed>
    <OperationsHeadBleed pad="5xl" padTop="sm">{header}</OperationsHeadBleed>

  `padTop` yalnız gövdenin ÜST dolgusu varsa verilir — o dolgu da yalnız hazır dalda var, yani
  verilmezse başlık dikeyde de yer değiştirir (ölçüldü: `sm` = 6 birim = 15 px, gözle görülüyor).
*/

type OperationsSpace = keyof typeof operationsTheme.space;

interface OperationsHeadBleedProps {
  /** Kapsayan gövdenin YATAY dolgusu — geri alınacak olan ölçü. */
  pad: OperationsSpace;
  /** Gövdenin ÜST dolgusu; yoksa verilmez. */
  padTop?: OperationsSpace;
  children: ReactNode;
}

export function OperationsHeadBleed({ pad, padTop, children }: OperationsHeadBleedProps) {
  return (
    <View
      style={[
        { marginHorizontal: -operationsTheme.space[pad] },
        padTop === undefined ? null : { marginTop: -operationsTheme.space[padTop] },
      ]}
    >
      {children}
    </View>
  );
}
