import { describe, it, expect } from "vitest";
import { isOwnedStoragePath } from "../path-ownership";

const cases: Array<{ description: string; path: string; ownerId: string; expected: boolean }> = [
  {
    description: "accepts a simple owned path",
    path: "user1/task/x.jpg",
    ownerId: "user1",
    expected: true,
  },
  {
    description: "rejects a traversal segment escaping the owner prefix",
    path: "user1/../user2/x.jpg",
    ownerId: "user1",
    expected: false,
  },
  {
    description: "rejects a path owned by a different user",
    path: "user2/x.jpg",
    ownerId: "user1",
    expected: false,
  },
  {
    description: "rejects a leading slash",
    path: "/user1/x.jpg",
    ownerId: "user1",
    expected: false,
  },
  {
    description: "rejects an empty segment from a double slash",
    path: "user1//x.jpg",
    ownerId: "user1",
    expected: false,
  },
  {
    description: "rejects a current-directory segment",
    path: "user1/./x.jpg",
    ownerId: "user1",
    expected: false,
  },
  {
    description: "rejects a backslash",
    path: "user1\\evil",
    ownerId: "user1",
    expected: false,
  },
  {
    description: "rejects a path with no second segment",
    path: "user1",
    ownerId: "user1",
    expected: false,
  },
  {
    description: "rejects an empty path",
    path: "",
    ownerId: "user1",
    expected: false,
  },
  {
    description: "rejects lowercase percent-encoded traversal (%2e%2e)",
    path: "user1/%2e%2e/victim/x.mp3",
    ownerId: "user1",
    expected: false,
  },
  {
    description: "rejects uppercase percent-encoded traversal (%2E%2E)",
    path: "user1/%2E%2E/x",
    ownerId: "user1",
    expected: false,
  },
  {
    description: "rejects a percent-encoded slash embedded in a segment",
    path: "user1/a%2fb",
    ownerId: "user1",
    expected: false,
  },
];

describe("isOwnedStoragePath", () => {
  it.each(cases)("$description", ({ path, ownerId, expected }) => {
    expect(isOwnedStoragePath(path, ownerId)).toBe(expected);
  });

  it("rejects when ownerId itself is empty", () => {
    expect(isOwnedStoragePath("user1/x.jpg", "")).toBe(false);
  });
});
