import { expect, type Page } from '@playwright/test';

/** Locate the current SVG handle after scrolling, then verify the real event
 * target. A bounding box taken before layout settles is not a drag contract. */
export async function beginStableSeDrag(page: Page, label: string) {
  const handle = page.getByRole('button', { name: label, exact: true });
  await handle.scrollIntoViewIfNeeded();
  await handle.hover();
  await expect.poll(async () => {
    const box = await handle.boundingBox();
    if (!box) return null;
    return page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('aria-label') ?? null,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }).toBe(label);
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  await page.evaluate(() => {
    (window as any).__resizePointerDown = null;
    document.addEventListener('pointerdown', event => {
      (window as any).__resizePointerDown = {
        aria: (event.target as Element | null)?.getAttribute('aria-label') ?? null,
        x: event.clientX, y: event.clientY,
        scrollTop: document.querySelector('.document-pane')?.scrollTop ?? null,
      };
    }, { capture: true, once: true });
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const actual = await page.evaluate(() => (window as any).__resizePointerDown);
  console.log(JSON.stringify({ resizePointerDown: actual, expected: label, start }));
  if (actual?.aria !== label) await page.mouse.up();
  expect(actual?.aria).toBe(label);
  return start;
}
