import { safeStorage } from "electron";

const ENCRYPTION_UNAVAILABLE_ERROR =
  "Secure storage is not available on this device. API keys cannot be safely stored.";
const DECRYPTION_UNAVAILABLE_ERROR =
  "Secure storage is not available. Cannot decrypt API keys.";

function assertEncryptionAvailable(errorMessage: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(errorMessage);
  }
}

export function encryptKey(key: string): string {
  assertEncryptionAvailable(ENCRYPTION_UNAVAILABLE_ERROR);
  return safeStorage.encryptString(key).toString("base64");
}

export function decryptKey(encrypted: string): string {
  assertEncryptionAvailable(DECRYPTION_UNAVAILABLE_ERROR);
  return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
}
