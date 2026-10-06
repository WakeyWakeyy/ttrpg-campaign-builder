import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "vitest";

const projectRequire = createRequire(import.meta.url);
const nextConfigRequire = createRequire(projectRequire.resolve("eslint-config-next/core-web-vitals"));
const pluginEntry = nextConfigRequire.resolve("@next/eslint-plugin-next");
const { getRootDirs } = nextConfigRequire(path.join(path.dirname(pluginEntry), "utils/get-root-dirs.js")) as {
  getRootDirs: (context: { cwd: string; settings: { next: { rootDir: string | string[] } } }) => string[];
};

test("Next ESLint root-directory globs resolve directories with the native Node glob", () => {
  const cwd = process.cwd();
  const normalize = (value: string) => value.replaceAll("\\", "/");
  const relative = getRootDirs({ cwd, settings: { next: { rootDir: "src/*" } } });
  expect(relative).toContain("src/app");
  expect(relative).toContain("src/modules");
  expect(relative.every(value => !value.endsWith(".ts"))).toBe(true);

  const absolutePattern = path.resolve("src").replaceAll("\\", "/") + "/*";
  const absolute = getRootDirs({ cwd, settings: { next: { rootDir: absolutePattern } } });
  expect(absolute).toContain(normalize(path.resolve("src/app")));
});
