import { describe, expect, it } from "vitest";
import { suggestSecretDiscoveryPaths } from "../../src/modules/intelligence/secret-suggestions";

const available = { archivedAt: null, deletedAt: null };

describe("secret discovery suggestions", () => {
  it("suggests a path only when an available secret lacks an available linked clue", () => {
    const removed = new Date();
    const secrets = [
      { id: "one", title: "Hidden patron", ...available },
      { id: "two", title: "Known route", ...available },
      { id: "three", title: "Archived truth", archivedAt: removed, deletedAt: null },
      { id: "four", title: "Trashed truth", archivedAt: null, deletedAt: removed },
    ];
    const clues = [
      { secretId: "one", archivedAt: removed, deletedAt: null },
      { secretId: "two", ...available },
      { secretId: "three", ...available },
      { secretId: null, ...available },
    ];
    expect(suggestSecretDiscoveryPaths(secrets, clues)).toEqual([
      { secretId: "one", secretTitle: "Hidden patron" },
    ]);
  });
});
