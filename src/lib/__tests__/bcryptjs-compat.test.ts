import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";

// Hash of "test-password-123", rounds=10, generated with bcryptjs ($2a$ prefix).
// Native bcrypt writes $2b$; the algorithms are identical, only the prefix label
// differs, so the prefix-swapped assertion pins compatibility with stored rows.
const HASH_2A = "$2a$10$rmaUF4KOPiANt9GyrIYw8O5OfxI/qF.AAhp9/t12sMXOBpOSIr486";
const HASH_2B = HASH_2A.replace(/^\$2a\$/, "$2b$");

describe("bcryptjs compatibility with stored bcrypt hashes", () => {
  it("verifies the correct password", () => {
    expect(bcrypt.compareSync("test-password-123", HASH_2A)).toBe(true);
  });
  it("rejects a wrong password", () => {
    expect(bcrypt.compareSync("wrong-password", HASH_2A)).toBe(false);
  });
  it("verifies $2b$-prefixed hashes (native bcrypt format)", () => {
    expect(bcrypt.compareSync("test-password-123", HASH_2B)).toBe(true);
  });
});
