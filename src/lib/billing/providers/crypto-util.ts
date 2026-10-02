import { createPrivateKey, createPublicKey, createSign, createVerify, randomBytes, createDecipheriv } from "node:crypto";

/** Normalize PEM stored in env with literal \\n */
export function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, "\n").trim();
}

export function rsaSignSha256(content: string, privateKeyPem: string): string {
  const key = createPrivateKey(normalizePem(privateKeyPem));
  const signer = createSign("RSA-SHA256");
  signer.update(content, "utf8");
  signer.end();
  return signer.sign(key, "base64");
}

export function rsaVerifySha256(
  content: string,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  const key = createPublicKey(normalizePem(publicKeyPem));
  const verifier = createVerify("RSA-SHA256");
  verifier.update(content, "utf8");
  verifier.end();
  return verifier.verify(key, signatureBase64, "base64");
}

export function randomNonce(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

/** WeChat Pay APIv3 resource decrypt (AEAD_AES_256_GCM). */
export function aesGcmDecryptWechat(
  apiV3Key: string,
  nonce: string,
  associatedData: string,
  ciphertextBase64: string,
): string {
  const key = Buffer.from(apiV3Key, "utf8");
  const buf = Buffer.from(ciphertextBase64, "base64");
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "utf8"));
  decipher.setAuthTag(authTag);
  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData, "utf8"));
  }
  const decoded = Buffer.concat([decipher.update(data), decipher.final()]);
  return decoded.toString("utf8");
}
