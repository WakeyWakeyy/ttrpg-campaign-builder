import { expect, test } from "vitest";
import { createDatabase } from "../../src/infrastructure/db";

test.each(["", " ", "\t\n"])(
  "rejects a blank connection string (%j) synchronously without connecting",
  (connectionString) => {
    expect(() => createDatabase(connectionString)).toThrow(
      "DATABASE_URL is required to initialize the database.",
    );
  },
);
