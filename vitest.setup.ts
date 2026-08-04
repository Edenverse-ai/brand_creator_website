import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Mock server-only for testing
vi.mock("server-only", () => ({}));

afterEach(() => {
  cleanup();
});
