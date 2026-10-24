import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
const header = Buffer.from("ETHOS_BACKUP_V1");
export function encryptBackup(plain, key) {
  if (key.length !== 32) throw Error("INVALID_BACKUP_KEY");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([header, iv, cipher.getAuthTag(), encrypted]);
}
export function decryptBackup(encrypted, key) {
  const offset = header.length;
  if (
    key.length !== 32 ||
    encrypted.length < offset + 28 ||
    !encrypted.subarray(0, offset).equals(header)
  )
    throw Error("INVALID_BACKUP_ENVELOPE");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    encrypted.subarray(offset, offset + 12),
  );
  decipher.setAAD(header);
  decipher.setAuthTag(encrypted.subarray(offset + 12, offset + 28));
  return Buffer.concat([
    decipher.update(encrypted.subarray(offset + 28)),
    decipher.final(),
  ]);
}
