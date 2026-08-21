'use client';

import { useState } from 'react';
import type { ConversationSource } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { DateField } from '@/components/operation/form/date-field';
import { toDay } from '@/components/operation/form/calendar-math';
import { FieldShell } from '@/components/operation/form/field-shell';
import { InputField, Textarea } from '@/components/operation/form/input';
import { openManualDmAction, recordFollowUpInboundAction } from './actions';
import { SOURCE_LABELS } from './social-labels';

/**
 * **Gelen DM'i işle** (15.1'in yüzey yarısı · üç kanal 15.15) — iki kapı, tek pencere:
 *
 * · **Yeni numara** (`existing` yok): numaradan konuşmayı açar, mesajı deftere yazar. **Yalnız
 *   WhatsApp** — kimlik anahtarı telefondur ve operatör onu telefonundan okur; Messenger/IG kişi
 *   kimliği (PSID/IGSID) operatörce bilinemez, o konuşmaları webhook doğuracak (15.7).
 * · **Devam** (`existing` dolu): var olan sohbete düşen yeni mesajı işler — KANAL-NÖTR, konuşma
 *   kimliğiyle çalışır; anahtar yeniden yazılmaz ve yazılamaz: değiştirilebilir olsaydı mesaj
 *   farkında olmadan başka birinin sohbetine düşerdi.
 *
 * Bu pencere olmadan gelen kutusunun WhatsApp tarafında VERİ KAYNAĞI YOK: konuşma satırlarını bugün
 * yalnız elle işleme doğurabiliyor, webhook 15.7 ile geliyor.
 *
 * **E-posta İSTEĞE BAĞLI ve ikinci kimlik anahtarıdır** (yalnız yeni numarada). Numara kayıtsız ama
 * e-posta tanıdıksa müşteri o zaman bulunur. İkisi AYRI müşterilere çıkarsa konuşma bilerek
 * AÇILMAZ — sessizce birini seçmek, yanlış hesaba bağlanmış bir sohbet üretirdi (DOMAIN §10).
 */

interface ManualDmDialogProps {
  /** Dolu ise: var olan sohbetin devamı — anahtar kilitli, kimlik alanları gizli. */
  existing?: { conversationId: string; title: string; source: ConversationSource };
  onClose: () => void;
  onOpened: (conversationId: string) => void;
}

/** `HH:MM` — 24 saat. Saat alanı serbest metin olduğu için biçim BURADA elenir, sunucuya gitmeden. */
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function ManualDmDialog({ existing, onClose, onOpened }: ManualDmDialogProps) {
  const followUp = Boolean(existing);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // Gün BUGÜNE düşer, saat DÜŞMEZ: gün neredeyse hep bugündür (operatör okuduğu mesajı işler), saat
  // ise asıl sorulan şeydir — ona bir varsayılan koymak, kapının yasakladığı "şimdi"yi arka kapıdan
  // geri getirirdi.
  const [day, setDay] = useState(() => toDay(new Date()));
  const [time, setTime] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = !followUp && !phone.trim()
    ? 'Numara yazılmalı'
    : !day
      ? 'Mesajın geldiği gün seçilmeli'
      : !TIME.test(time.trim())
        ? 'Saat SS:DD biçiminde yazılmalı (ör. 09:30)'
        : !text.trim()
          ? 'Mesaj metni yazılmalı'
          : null;

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    setError(null);
    // Gün + saat YEREL okunur (`new Date('2026-08-08T09:30')`), çünkü operatör telefonundaki saati
    // giriyor ve o saat yerel. UTC'ye çevirme sunucuya değil buraya ait: kullanıcının saati, onun
    // tarayıcısının diliminde anlam taşır.
    const receivedAt = new Date(`${day}T${time.trim()}`).toISOString();
    const { data, error: actionError } = existing
      ? await recordFollowUpInboundAction({ conversationId: existing.conversationId, text, receivedAt }).then((r) => ({
          data: r.data ? { conversationId: existing.conversationId } : null,
          error: r.error,
        }))
      : await openManualDmAction({
          phone,
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          text,
          receivedAt,
        });
    setBusy(false);
    if (!data) {
      setError(actionError ?? 'Konuşma açılamadı.');
      return;
    }
    onOpened(data.conversationId);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={520}
      title={followUp ? 'Gelen mesaj işle' : 'Gelen DM işle'}
      subtitle={
        followUp
          ? `${existing ? SOURCE_LABELS[existing.source] : ''} sohbetine düşen yeni mesajı deftere yazar`
          : 'Telefondan okunan WhatsApp mesajını sisteme geçirir'
      }
      footer={
        <>
          {/* Metin düğmeleri EZMEZ (`min-w-0` + `flex-none`): uzun bir hata cümlesi düğmeyi iki
              satıra bölüyordu ve birincil eylem okunmaz hâle geliyordu. */}
          <span className="mr-auto min-w-0 font-ops-body text-ops-xs text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : 'Aynı kişi ikinci sohbet açmaz'}
          </span>
          <Button variant="secondary" className="flex-none" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button
            variant="primary"
            className="flex-none whitespace-nowrap"
            onClick={() => void submit()}
            disabled={busy || blocked !== null}
            title={blocked ?? undefined}
          >
            {busy ? 'İşleniyor…' : followUp ? 'Deftere işle' : 'Konuşmayı aç'}
          </Button>
        </>
      }
    >
      {/* Devamda anahtar alanı YOK: sohbet zaten belli ve başlıkta yazıyor — kilitli bir kutu bile
          "değiştirilebilir bir şey var" hissi verirdi. Yeni numarada alan WhatsApp'ındır. */}
      {followUp ? (
        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
          Sohbet: <span className="font-semibold text-ops-ink">{existing?.title}</span>
        </span>
      ) : (
        <>
          <InputField
            label="WhatsApp numarası"
            required
            mono
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+33 6 12 34 56 78"
            // Yerel yazım da kabul: normalize uygulama kapısında (`normalizePhone`) — operatörün numarayı
            // ekranda gördüğü biçimde yazabilmesi, yazım hatasını azaltır.
          />

          <InputField
            label="WhatsApp adı"
            labelAside="isteğe bağlı"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Profilde görünen ad"
            // Ad YALNIZ yeni kayıtta kullanılır, mevcut müşterinin adını EZMEZ (kapının kuralı):
            // WhatsApp profil adı bir takma ad olabilir, fatura adının yerine geçmemeli.
          />

          <InputField
            label="E-posta"
            labelAside="biliniyorsa"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Numara kayıtsız ama müşteriyi tanıyorsanız"
          />
        </>
      )}

      {/* GÜN + SAAT, ikisi de FORM KİTİNDEN. Bir tur ham `<input type="datetime-local">` yazılmıştı
          (kullanıcı bildirdi, 08.08) ve `DateField`'ın kendi künyesi tam da onu yasaklıyor:
          tarayıcının yerli takvimi her platformda başka görünür ve dili tarayıcının dilidir —
          operasyon yüzeyi ise Türkçe. Ekranda "dd/mm/yyyy" diye çıkıyordu.
          Saat AYRI bir kutu, çünkü kitte saat kontrolü yok ve tek kullanım için kite yeni bir
          kontrol eklemek, `Input`'un zaten yaptığı işi ikinci kez yazmak olurdu. */}
      <div className="flex items-start gap-3">
        <DateField label="Mesajın geldiği gün" required className="flex-1" value={day} onChange={setDay} clearable={false} />
        <InputField
          label="Saat"
          required
          labelAside="ör. 09:30"
          mono
          fieldClassName="w-[112px] flex-none"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="14:30"
          maxLength={5}
        />
      </div>
      <span className="-mt-1 font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
        24 saatlik cevap süresi bu andan başlar — telefonda mesajın yanında yazan saati girin.
      </span>

      <FieldShell label="Mesaj" required>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Müşterinin yazdığı mesajı olduğu gibi geçirin."
        />
      </FieldShell>
    </Dialog>
  );
}
