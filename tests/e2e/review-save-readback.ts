import type { Page } from "@playwright/test";
import { expect } from "./fixture.ts";

export async function saveReviewWithReadback(page: Page): Promise<void> {
  let documentId = "";
  let expectedRevision = -1;
  const saved = page.waitForResponse(response => {
    const match = /^\/api\/documents\/([^/]+)\/review$/u.exec(new URL(response.url()).pathname);
    if (!match || response.request().method() !== "PUT" || response.status() !== 200) return false;
    documentId = match[1];
    expectedRevision = Number(response.request().postDataJSON()?.revision) + 1;
    return true;
  }, { timeout: 30_000 });
  const readback = page.waitForResponse(async response => {
    if (!documentId || response.request().method() !== "GET" || response.status() !== 200 || new URL(response.url()).pathname !== `/api/documents/${documentId}`) return false;
    const body = await response.json().catch(() => null);
    return body?.id === documentId && body?.revision === expectedRevision;
  }, { timeout: 30_000 });
  await page.getByRole("button", { name: "保存复核", exact: true }).click();
  const savedResponse = await saved;
  expect((await savedResponse.json()).revision).toBe(expectedRevision);
  const readbackResponse = await readback;
  const body = await readbackResponse.json();
  expect(body.id).toBe(documentId);
  expect(body.revision).toBe(expectedRevision);
}
