// Vouchers: a customer signs "I owe the shop this much in total so far". Must match contract/src/tabs.rs.
import { KeyPair, PublicKey, type KeyPairString } from "near-api-js";

export const voucherMessage = (store: string, customer: string, cumulativeYocto: bigint) =>
  `staffless-tab:${store}:${customer}:${cumulativeYocto}`;

export function signVoucher(privateKey: string, message: string): string {
  const { signature } = KeyPair.fromString(privateKey as KeyPairString).sign(new TextEncoder().encode(message));
  return Buffer.from(signature).toString("base64");
}

export function verifyVoucher(publicKey: string, message: string, signatureB64: string): boolean {
  try {
    return PublicKey.fromString(publicKey).verify(new TextEncoder().encode(message), Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
