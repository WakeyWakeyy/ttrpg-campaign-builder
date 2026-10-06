import { expect, test, vi } from "vitest";
import { notFound } from "next/navigation";
import { readError } from "../../src/app/read-error";
import { ItemNotFoundError } from "../../src/modules/items";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_HTTP_ERROR_FALLBACK;404"); }),
  redirect: vi.fn(),
}));

test("missing or unowned items use the shared not-found response", () => {
  expect(() => readError(new ItemNotFoundError())).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  expect(notFound).toHaveBeenCalledOnce();
});

test("unexpected read errors still surface", () => {
  const unexpected = new Error("Database unavailable");
  expect(() => readError(unexpected)).toThrow(unexpected);
});
