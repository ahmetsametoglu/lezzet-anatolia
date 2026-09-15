import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { alertAllowed, hasNewInbound } from '@lezzet/domain-core';

import { hapticSuccess } from '@lezzet/mobile-kit/src/lib/haptics/haptics';
import { fetchSocialInbox } from '@/lib/api/social';
import { useBellChannel } from '@/lib/realtime/use-bell-channel.hook';

/*
  YENİ MESAJ SESİ — uygulama AÇIKKEN (15.35 · kullanıcı isteği 15.09: "en azından uygulama açıkken ses
  çaldırabiliriz"). Müşteriden mesaj gelince kısa bir tını + titreşim; hangi ekranda olunursa olunsun.

  ── NE ZAMAN ÇALAR — KARAR MOTORDA ──────────────────────────────────────────
  Kuyruk zili ajan taslağında, çeviride ve bizim cevabımızda da çalar. Ses yalnız kuyruğun en son GELEN
  mesaj anı ilerlediğinde çalar; açılıştaki ilk ölçüm taban çizgisidir, art arda mesajda 3 saniyede tek
  ses (`hasNewInbound` · `alertAllowed`, `@lezzet/domain-core`). Web aynı kararı okur (15.34).

  ── YALNIZ ÖN PLANDA ────────────────────────────────────────────────────────
  Uygulama arka plandayken sistem onu kısa sürede dondurur; zil duyulmaz, ses de çalamaz — orada doğru yol
  push'tur (14.16). Arka planda duyulan zil TABAN ÇİZGİSİNİ ilerletmez: öne dönüşte ölçülür ve arada gelen
  mesaj varsa BİR KEZ çalar.

  ── PUSH İLE ÇİFT SES OLMAZ (14.16'nın kuralı) ───────────────────────────────
  Personel push'u geldiğinde ön plan bildirim davranışı push'un kendi sesini susturmalı; sesi bu kanca
  çalar. Bugün hiçbir uygulamada ön plan davranışı tanımlı değil (ölçüldü 15.09) — açıkken gelen push
  zaten ses çıkarmıyor.

  ── SESSİZ MOD ──────────────────────────────────────────────────────────────
  Ses modu uygulama geneli: sesli mesaj oynatıcısı açıldığında "sessizde de çal"a geçer
  (`audio-player.tsx`) ve sonrasında tını da sessizde çalar. Titreşim her durumda var.
*/

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro ses varlığını require ile paketler (`brother.ts`in aynı kararı)
const CHIME = require('../../../assets/sounds/new-message.wav') as number;

export function useMessageChime(enabled: boolean): void {
  const player = useAudioPlayer(CHIME);
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  });

  const [bellChannel, setBellChannel] = useState<string | null>(null);
  // `undefined` = henüz ölçülmedi — ilk ölçüm taban çizgisidir (`hasNewInbound`).
  const latestInbound = useRef<string | null | undefined>(undefined);
  const lastChimeAt = useRef<number | null>(null);

  const pulse = useCallback(async () => {
    const result = await fetchSocialInbox({ limit: 1 });
    // Düşen okuma sessiz geçer: bir sonraki zil yeniden ölçer; ses bir uyarıdır, kayıt değil.
    if (result.error !== null) return;
    setBellChannel(result.data.channel);
    if (AppState.currentState !== 'active') return;

    const next = result.data.rows[0]?.lastInboundAt ?? null;
    const now = Date.now();
    if (hasNewInbound(latestInbound.current, next) && alertAllowed(lastChimeAt.current, now)) {
      lastChimeAt.current = now;
      void playerRef.current.seekTo(0);
      playerRef.current.play();
      hapticSuccess();
    }
    latestInbound.current = next;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void pulse();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void pulse();
    });
    return () => subscription.remove();
  }, [enabled, pulse]);

  useBellChannel(enabled ? bellChannel : null, () => void pulse());
}
