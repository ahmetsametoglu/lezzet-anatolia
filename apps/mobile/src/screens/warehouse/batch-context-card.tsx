import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { ResolvedBatchContract } from '@lezzet/types';

import { OperationsSurface } from '@/components/operations/surface';
import { TextAction } from '@/components/ui/text-action';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { shortDate } from './warehouse-format';

/*
  BAĞLAM KARTI — "hangi parti, elimde ne var" (D4 · D4b · v3:08/09), 02.09.

  ── EKRANIN EN ÖNEMLİ İKİ SAYISI ────────────────────────────────────────────
  Eski ekran yalnız künyeyi yazıyordu (kod · ad) ve depocu adet alanına yazarken KARŞILAŞTIRACAK
  sayıyı göremiyordu. Sayım tam da bir karşılaştırmadır: raftaki adet ile kayıttaki adet.

  İkinci sayı (ürünün depodaki toplamı) ilkinden bağımsız bir soruyu cevaplıyor: *"bu üründen
  başka partim var mı"*. Aynı ürünün rafta üç partisi olabilir ve tek partiye bakan depocu 2 yazan
  bir partiden düşerken malın bittiğini sanır. İkisi yan yana durunca karar bağlamıyla veriliyor.

  ── TARİHİN YANINDA REJİM VAR ───────────────────────────────────────────────
  `DLC` mi `DDM` mi — D3'te ölçülen arızanın (21.191) burada da mümkün olanı: rejimi söylenmeyen
  bir tarih, depocuya satılabilir malı imha ettirebilir. Rozet süsleme değil, uyarı.

  ── "DEĞİŞTİR" BİR GERİ TUŞU DEĞİL ──────────────────────────────────────────
  Yanlış partiyi seçen depocunun çıkışı ekranı terk etmek olmamalı: eylem aynı ekranda, konunun
  yanında durur. Metin eylemi (`TextAction`) bilinçli — düğme olsaydı ekranın asıl eylemiyle
  (kaydet) aynı ağırlıkta görünürdü.
*/

const t = warehouseCopy;

interface BatchContextCardProps {
  batch: ResolvedBatchContract;
  /** Konuyu bırakma — seçiciye döner. */
  onChange: () => void;
  testID: string;
}

export function BatchContextCard({ batch, onChange, testID }: BatchContextCardProps) {
  return (
    <OperationsSurface tone="panel" padding="lg" testID={testID}>
      <View style={styles.head}>
        <View style={styles.headBody}>
          <Text style={styles.name}>{batch.name}</Text>
          <Text style={styles.meta}>
            {fillCopy(t.adjustment.context.meta, {
              code: batch.lotNumber ?? t.adjustment.picker.noLot,
              area: batch.storageAreaName ?? t.adjustment.picker.noArea,
              dateType: batch.dateType,
              date: shortDate(batch.expiryDate) ?? batch.expiryDate,
            })}
          </Text>
        </View>
        <TextAction label={t.adjustment.context.change} onPress={onChange} testID={`${testID}-change`} />
      </View>

      <View style={styles.rule} />

      <View style={styles.numbers}>
        <View style={styles.number}>
          <Text style={styles.value} testID={`${testID}-batch-qty`}>
            {batch.physicalQty}
          </Text>
          <Text style={styles.label}>{t.adjustment.context.batchQty}</Text>
        </View>
        {/* İkinci kolon ÇİZGİYLE ayrılıyor: iki sayı bitişik durursa aynı büyüklüğün iki hâli gibi
            okunur — oysa biri partinin, öteki ürünün. */}
        <View style={[styles.number, styles.numberSplit]}>
          <Text style={styles.value} testID={`${testID}-variant-qty`}>
            {batch.variantWarehouseQty}
          </Text>
          <Text style={styles.label}>{t.adjustment.context.variantQty}</Text>
        </View>
      </View>
    </OperationsSurface>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: operationsTheme.space.md,
  },
  headBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  name: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  meta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  rule: {
    height: operationsTheme.border.base,
    backgroundColor: operationsTheme.colors['sand-300'],
    marginVertical: operationsTheme.space.lg,
  },
  numbers: {
    flexDirection: 'row',
  },
  number: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  numberSplit: {
    borderLeftWidth: operationsTheme.border.hairline,
    borderLeftColor: operationsTheme.colors['sand-300'],
    paddingLeft: operationsTheme.space.lg,
  },
  /** Sayı SERİF (Lora): tasarımın kendi ayrımı — büyük sayılar başlık ailesinden. */
  value: {
    fontFamily: operationsTheme.font.display[600],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors.ink,
  },
  label: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
