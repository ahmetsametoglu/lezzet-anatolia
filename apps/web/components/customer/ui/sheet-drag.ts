const CLOSE_RATIO = 0.25;
/** px/ms. */
const FLICK_VELOCITY = 0.4;
const FLICK_MIN_OFFSET = 16;

/**
 * Bırakılan çekmece boyunun dörtte birinden fazla aşağı çekildiyse ya da hızla fiskelendiyse kapanır. Fiske de en az bir parmak payı
 * yol ister, yoksa dokunuştaki titreşim çekmeceyi kapatırdı.
 */
export function sheetDragCloses(offset: number, panelHeight: number, velocity: number): boolean {
  if (offset > panelHeight * CLOSE_RATIO) return true;
  return offset >= FLICK_MIN_OFFSET && velocity > FLICK_VELOCITY;
}
