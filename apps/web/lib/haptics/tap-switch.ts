import { hapticRouteOf, surfaceFactsOf, takesTapSwitch, TAP_SURFACE } from './haptics';

/*
  iPhone'da betik titreşim çalamaz, ama parmağın doğrudan değdiği anahtar kutusu sistem tıkını çalar (iOS 26.5 sonrasında kalan tek
  yol; teknik `@haptics/core` ile aynı). Bu yüzden her dokunma yüzeyinin içine onu kaplayan görünmez bir kutu konur ve kutunun
  tıklaması yüzeye aktarılır.
*/

const SWITCH_ATTR = 'data-tap-switch';
/** Yüzeyin içinde bulunursa kutunun örteceği öğeler. */
const INTERACTIVE = `button, a, input:not([${SWITCH_ATTR}]), select, textarea, label, [role="button"]`;
/** Kutu için `relative` verilen konumsuz yüzeyler; kutu sökülünce konum geri alınır. */
const positioned = new WeakSet<HTMLElement>();

function switchOf(host: Element): HTMLInputElement | null {
  return host.querySelector<HTMLInputElement>(`:scope > input[${SWITCH_ATTR}]`);
}

/** Konumsuz yüzeye `relative` verilince yerleşim kutusu değişecek mutlak bir iç öğe var mı. */
function shiftsLayout(host: HTMLElement): boolean {
  if (getComputedStyle(host).position !== 'static') return false;
  for (const child of host.querySelectorAll<HTMLElement>('*')) {
    if (getComputedStyle(child).position !== 'absolute') continue;
    if (child.offsetParent === null || !host.contains(child.offsetParent)) return true;
  }
  return false;
}

function mount(host: HTMLElement): void {
  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
    positioned.add(host);
  }
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.setAttribute('switch', '');
  box.setAttribute(SWITCH_ATTR, '');
  box.setAttribute('aria-hidden', 'true');
  box.tabIndex = -1;
  box.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;-webkit-appearance:switch;appearance:auto;opacity:0;cursor:inherit;';
  // Kutunun kendi tıklaması durdurulur ve yüzeye yeniden gönderilir: yüzey tek tıklama alır, bağlantı ve form düğmesi onunla çalışır.
  box.addEventListener('click', (event) => {
    event.stopPropagation();
    host.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  host.append(box);
}

function unmount(host: HTMLElement, box: HTMLInputElement): void {
  box.remove();
  if (positioned.delete(host)) host.style.position = '';
}

function evaluate(host: HTMLElement): void {
  const fits = takesTapSwitch({
    ...surfaceFactsOf(host),
    nestedInteractive: host.querySelector(INTERACTIVE) !== null,
    shiftsLayout: shiftsLayout(host),
  });
  const box = switchOf(host);
  if (fits && box === null) mount(host);
  if (!fits && box !== null) unmount(host, box);
}

/** Değişikliğin etkilediği yüzeyler: öğenin kendisi, içindekiler ve içinde durduğu yüzeyler. */
function surfacesAround(node: Node, withInside: boolean): HTMLElement[] {
  const element = node instanceof HTMLElement ? node : node.parentElement;
  if (element === null) return [];
  const out: HTMLElement[] = withInside ? [...element.querySelectorAll<HTMLElement>(TAP_SURFACE)] : [];
  let surface = element.closest<HTMLElement>(TAP_SURFACE);
  while (surface !== null) {
    out.push(surface);
    surface = surface.parentElement?.closest<HTMLElement>(TAP_SURFACE) ?? null;
  }
  return out;
}

/** Kökün altındaki dokunma yüzeylerine kutuyu takar ve sayfa değiştikçe günceller; yalnız iPhone'da çalışır. Dönen fonksiyon söker. */
export function attachTapSwitches(root: HTMLElement): () => void {
  if (hapticRouteOf(navigator) !== 'switch') return () => undefined;
  const pending = new Set<HTMLElement>();
  let frame = 0;
  const flush = () => {
    frame = 0;
    for (const host of pending) if (host.isConnected) evaluate(host);
    pending.clear();
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') for (const host of surfacesAround(record.target, true)) pending.add(host);
      else {
        for (const host of surfacesAround(record.target, false)) pending.add(host);
        for (const added of record.addedNodes) for (const host of surfacesAround(added, true)) pending.add(host);
      }
    }
    if (frame === 0 && pending.size > 0) frame = requestAnimationFrame(flush);
  });
  for (const host of surfacesAround(root, true)) pending.add(host);
  flush();
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'data-haptic', 'class'] });
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    for (const box of root.querySelectorAll<HTMLInputElement>(`input[${SWITCH_ATTR}]`)) {
      if (box.parentElement !== null) unmount(box.parentElement, box);
    }
  };
}
