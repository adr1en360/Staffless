// The only module that reads the chain or signs transactions.
import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";

export type Role = "shopkeeper" | "guest" | "agent";

export type TxResult<T> = { ok: true; value: T; hash: string } | { ok: false; error: string; hash?: string };

const KEYS: Record<Role, [string, string]> = {
  shopkeeper: ["SHOPKEEPER_ACCOUNT_ID", "SHOPKEEPER_PRIVATE_KEY"],
  guest: ["GUEST_ACCOUNT_ID", "GUEST_PRIVATE_KEY"],
  agent: ["AGENT_CUSTOMER_ACCOUNT_ID", "AGENT_CUSTOMER_PRIVATE_KEY"],
};

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

let provider: JsonRpcProvider | undefined;
const rpc = () => (provider ??= new JsonRpcProvider({ url: env("NEAR_RPC_URL") }));

const accounts = new Map<Role, Account>();
function account(role: Role): Account {
  let acc = accounts.get(role);
  if (!acc) {
    const [id, key] = KEYS[role];
    acc = new Account(env(id), rpc(), env(key) as KeyPairString);
    accounts.set(role, acc);
  }
  return acc;
}

export const store = () => env("STORE_CONTRACT_ID");
export const accountId = (role: Role) => env(KEYS[role][0]);
export { explorerTx } from "./links";

export async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await rpc().callFunction({ contractId: store(), method, args })) as T;
}

/** Calls a store method as `role`. Contract panics come back as `{ ok: false, error }`, never as throws. */
export async function call<T = unknown>(
  role: Role,
  method: string,
  args: Record<string, unknown>,
  depositYocto: bigint = 0n,
): Promise<TxResult<T>> {
  try {
    const tx = await account(role).callFunctionRaw({
      contractId: store(),
      methodName: method,
      args,
      deposit: depositYocto,
      gas: 100_000_000_000_000n,
    });
    const hash = tx.transaction.hash;
    const status = tx.status as { SuccessValue?: string; Failure?: unknown };
    if (status.SuccessValue === undefined) return { ok: false, error: JSON.stringify(status.Failure), hash };
    const raw = Buffer.from(status.SuccessValue, "base64").toString();
    return { ok: true, value: (raw ? JSON.parse(raw) : undefined) as T, hash };
  } catch (err) {
    const e = err as { message?: string; transactionResult?: { transaction?: { hash?: string } } };
    const error = (e.message ?? String(err)).replace(/^Smart contract panicked: /, "");
    return { ok: false, error, hash: e.transactionResult?.transaction?.hash };
  }
}
