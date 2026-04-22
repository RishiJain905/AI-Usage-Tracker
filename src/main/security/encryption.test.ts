import { beforeEach, describe, expect, it, vi } from "vitest";

const { safeStorageMock } = vi.hoisted(() => ({
  safeStorageMock: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  safeStorage: safeStorageMock,
}));

import { decryptKey, encryptKey } from "./encryption";

describe("encryption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
    safeStorageMock.encryptString.mockImplementation((value: string) =>
      Buffer.from(`cipher:${value}`, "utf8"),
    );
    safeStorageMock.decryptString.mockImplementation((value: Buffer) =>
      value.toString("utf8").replace("cipher:", ""),
    );
  });

  it("round-trips API keys and uses safeStorage methods", () => {
    const raw = "sk-secret-openai";
    const encrypted = encryptKey(raw);
    const decrypted = decryptKey(encrypted);

    expect(encrypted).not.toBe(raw);
    expect(decrypted).toBe(raw);
    expect(safeStorageMock.encryptString).toHaveBeenCalledWith(raw);
    expect(safeStorageMock.decryptString).toHaveBeenCalledTimes(1);
  });

  it("throws when encryption is unavailable and does not fallback", () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);

    expect(() => encryptKey("sk-123")).toThrow(
      "Secure storage is not available on this device. API keys cannot be safely stored.",
    );
    expect(safeStorageMock.encryptString).not.toHaveBeenCalled();
  });

  it("throws when decryption is unavailable", () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);

    expect(() => decryptKey("Zm9v")).toThrow(
      "Secure storage is not available. Cannot decrypt API keys.",
    );
    expect(safeStorageMock.decryptString).not.toHaveBeenCalled();
  });

  it("never includes plaintext keys in error messages", () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const plaintextKey = "sk-never-appear";

    try {
      encryptKey(plaintextKey);
      throw new Error("expected encryptKey to throw");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      expect(message).not.toContain(plaintextKey);
    }
  });
});
