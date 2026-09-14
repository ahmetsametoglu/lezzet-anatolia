import { readFileSync } from 'node:fs';
import path from 'node:path';

import { SAFE_CONTAINERS, bodyOf, describeKeyboardScrollGuard, openingsOf } from './keyboard-scroll';
import { KIT_SRC } from './source-files';

/* Kitin kendi kaynağı da aynı üç kurala tabi; kaplar `components/ui/`de ve elle kaçınma kuralından muaf. */
describeKeyboardScrollGuard(KIT_SRC);

describe('klavye bekçisinin kendisi ve kitin kapları', () => {
  /* BEKÇİNİN KENDİSİ DE ÖLÇÜLÜR: ilk yazılışında generic tip parametresini açılış sanıyordu ve
     iki sohbet ekranını yanlışlıkla suçluyordu. Ayraç bozulursa bekçi ya yalancı kırmızı üretir
     ya da (ters yönde bozulursa) gerçek ihlali görmez — ikisi de sessiz olurdu. */
  it('generic tip parametresini AÇILIŞ sanmaz', () => {
    const source = 'const ref = useRef<ScrollView>(null);\nreturn <ScrollView><TextField /></ScrollView>;';
    expect(openingsOf(source, 'ScrollView')).toHaveLength(1);
    expect(bodyOf(source, 'ScrollView', openingsOf(source, 'ScrollView')[0]!)).toContain('<TextField');
  });

  it('korumalı kapların ÜÇÜ de klavye açıkken ilk dokunuşu korur', () => {
    // Kap adları kuralın kendisinin parçası; biri yeniden adlandırılırsa burası hatırlatır.
    expect(SAFE_CONTAINERS).toEqual(['FormScroll', 'BottomSheet', 'ChatLayout']);
    /* Korumanın İKİNCİ yarısı (MB-01) üçünde de yazılı olmalı: kaçınma alanı klavyenin üstüne
       taşır ama düğmeye ilk dokunuş yine yutulabilir — biri olmadan öteki yarım kalır. */
    for (const file of ['components/ui/form-scroll.tsx', 'components/ui/chat-layout.tsx']) {
      expect(readFileSync(path.join(KIT_SRC, file), 'utf8')).toContain('keyboardShouldPersistTaps="handled"');
    }
    /* ÇEKMECEDE KAÇINMA ARTIK KÜTÜPHANENİN (01.09): gövde `@gorhom/bottom-sheet`e geçti ve
       `KeyboardAvoidingView` yerine `keyboardBehavior` + `android_keyboardInputMode` kullanıyor —
       kaçınmayı panelin kendi konumundan yürütüyor. Ölçülen şey değişmedi, ADI değişti: kapta
       klavye koruması YAZILI olmalı. */
    expect(readFileSync(path.join(KIT_SRC, 'components/ui/bottom-sheet.tsx'), 'utf8')).toContain('keyboardBehavior');
  });
});
