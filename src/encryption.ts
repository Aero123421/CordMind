import crypto from "crypto";
import { config } from "./config.js";

const KEY = Buffer.from(config.encryptionKeyBase64, "base64");
if (KEY.length !== 32) {
  throw new Error("DISCORDAI_ENCRYPTION_KEY must be 32 bytes base64");
}

const VERSION_PREFIX = "enc_v1";

export const encrypt = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, encrypted, tag]).toString("base64");
  return `${VERSION_PREFIX}:${payload}`;
};

export const decrypt = (ciphertext: string): string => {
  const [prefix, payload] = ciphertext.split(":", 2);
  if (prefix !== VERSION_PREFIX || !payload) {
    throw new Error("Invalid encrypted payload format");
  }
  const data = Buffer.from(payload, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(data.length - 16);
  const enc = data.subarray(12, data.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
  return decrypted.toString("utf8");
};
