import { useSyncExternalStore } from 'react';

/*
  DEPOCUNUN AKTİF ALANI — "hangi dolabın önündesin" (kullanıcı kararı 03.09).

  ── NEDEN VAR ───────────────────────────────────────────────────────────────
  Partinin alanı "son görüldüğü yer"dir ve sistem onu ZATEN yapılan işten öğrenir: depocu sayımda
  hangi dolabın önünde durduğunu bir kez söyler, orada okuttuğu/seçtiği parti oraya yazılır
  (`batch-area.ts`). Bu dosya o "bir kez"in yeri: seçim sayım ve stok düşümü ekranlarının ORTAK
  bilgisidir — dondurucu 1'de sayım yapıp aynı dolapta hasarlı paket düşen depocuya iki kez
  sormak, kaçındığımız prosedürün kendisi olurdu.

  ── NEDEN CİHAZA YAZILMIYOR (yazıcı ve depo seçiminin AKSİNE) ───────────────
  Yazıcı ve depo seçimi günlerce doğru kalır; dolap seçimi dakikalarca. Uygulama yarın açıldığında
  "dondurucu 1" hâlâ seçili dursaydı, soğuk odada okutulan ilk parti sessizce dondurucuya yazılırdı
  — kimsenin görmediği, yanlış bir adres. Oturumla yaşayan seçim en fazla bir günü etkiler ve
  seçici her açılışta seçimi GÖSTERİR; sessiz bir bayatlık yok.

  ── NEDEN MODÜL DÜZEYİNDE ───────────────────────────────────────────────────
  İki ekran, tek seçim (`warehouse-choice.ts`in aynı gerekçesi). React bağlamı da olurdu; ama
  seçimi okuyan tek şey ekranlar değil, konu hook'unun seçim anındaki yazımı — o da bir bağlam
  sağlayıcısına muhtaç olmamalı.
*/

let activeId: string | null = null;
const listeners = new Set<() => void>();

function publish(next: string | null): void {
  if (next === activeId) return;
  activeId = next;
  for (const listener of listeners) listener();
}

/** Seçer ya da bırakır (`null`) — aynı çipe ikinci dokunuş bırakmadır, ekran öyle çağırır. */
export function chooseActiveArea(areaId: string | null): void {
  publish(areaId);
}

/** Testlerin sıfırlaması — bir dosyanın seçimi ötekine sızmasın. */
export function resetActiveArea(): void {
  publish(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): string | null {
  return activeId;
}

/** Ekranın bağlandığı seçim; `null` = belirtilmedi (seçim isteğe bağlıdır, yokluğu hiçbir şeyi kilitlemez). */
export function useActiveAreaId(): string | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
