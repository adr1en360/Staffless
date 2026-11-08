// An AI support bot buys translations sentence by sentence from a prepaid tab: many purchases, two transactions.
import { KeyPair, type KeyPairString } from "near-api-js";
import { accountId, env, store } from "../lib/near";
import { contract } from "../lib/store";
import { formatNear, toYocto, words } from "../lib/money";
import { tabs } from "../modules/tabs";
import { signVoucher, voucherMessage } from "../modules/tabs/voucher";
import { done, fail, info, step, tx } from "./log";

const SENTENCES = [
  "Thanks for reaching out.", "Your order has shipped.", "It should arrive within three days.",
  "Here is your tracking number.", "Sorry for the delay.", "We have refunded your payment.",
  "Can you send a photo of the item?", "Our team is looking into it.", "You can return it within thirty days.",
  "The discount code is applied at checkout.", "We are open every day except Sunday.", "Please check your spam folder.",
  "Your account has been updated.", "We will email you when it is back in stock.", "That size is sold out.",
  "Delivery is free on orders over fifty dollars.", "You can change your address before it ships.",
  "We have sent a replacement.", "Is there anything else I can help with?", "Have a great day.",
];
const LANGUAGE = "Spanish";
const DEPOSIT = toYocto("0.05");

const customer = accountId("agent");
const secret = env("AGENT_CUSTOMER_PRIVATE_KEY");
const publicKey = KeyPair.fromString(secret as KeyPairString).getPublicKey().toString();
const hashes: string[] = [];

step(`1. The support bot opens a tab with ${formatNear(DEPOSIT)} NEAR (transaction 1)`);
const opened = await contract.openTab(publicKey, DEPOSIT);
if (!opened.ok) fail(`open_tab: ${opened.error}`);
hashes.push(opened.hash);
tx("Tab opened", opened.hash);

const tab = await contract.tab(customer);
if (!tab) fail("tab not found after opening");
let cumulative = BigInt(tab.settled);
const perWord = BigInt((await contract.rules()).list_per_word);

step(`2. It buys ${SENTENCES.length} translations, signing a voucher for each (no transactions)`);
for (const [i, text] of SENTENCES.entries()) {
  cumulative += perWord * BigInt(words(text));
  const signature = signVoucher(secret, voucherMessage(store(), customer, cumulative));
  const res = await tabs().buy({ customer, text, language: LANGUAGE, cumulativeYocto: cumulative.toString(), signature });
  if (!res.ok) fail(`purchase ${i + 1}: ${res.error}`);
  info(`${String(i + 1).padStart(2)}. ${formatNear(res.priceYocto, 6)} NEAR  "${text}" -> "${res.translation}"`);
}

step("3. The shop collects everything with the latest voucher (transaction 2)");
const settled = await tabs().settle(customer);
if (!settled.ok) fail(`settle: ${settled.error}`);
hashes.push(settled.hash);
tx("Settled", settled.hash);
const after = await contract.tab(customer);
if (!after) fail("tab disappeared");
info(`Tab: ${formatNear(after.settled, 6)} NEAR paid in total, ${formatNear(after.balance, 6)} NEAR left on deposit`);

done(`${SENTENCES.length} purchases, ${hashes.length} transactions.`);
