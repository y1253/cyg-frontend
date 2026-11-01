/**
 * step11 (2026-11-01): where a click on the agent's live picture lands on its page. The
 * picture is drawn `object-contain`, so the box can have empty bars beside or above it;
 * the answer is the point as 0..1 fractions of the PICTURE (the agents server scales it to
 * the page), or null for a click on a bar.
 */
export function picturePoint(
  click: { x: number; y: number },
  box: { width: number; height: number },
  natural: { width: number; height: number },
): { x: number; y: number } | null {
  if (!box.width || !box.height || !natural.width || !natural.height) return null;
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  const left = (box.width - width) / 2;
  const top = (box.height - height) / 2;
  const x = (click.x - left) / width;
  const y = (click.y - top) / height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}
