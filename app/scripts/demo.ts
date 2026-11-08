// One full loop on testnet: chat quote -> customer pays -> supplier hired and checked -> supplier paid -> payout.
import { contract } from "../lib/store";
import { formatNear } from "../lib/money";
import { reply } from "../modules/shopkeeper";
import { checkout } from "../modules/checkout";
import { done, fail, info, step, tx } from "./log";

const TEXT = "Our shop opens at nine and closes at six. Payment is due when the work is delivered.";
const LANGUAGE = "French";

step("1. A customer asks the AI shopkeeper for a price");
info(`Customer: Please translate this into ${LANGUAGE}: "${TEXT}"`);
const chat = await reply([{ role: "user", content: `Please translate this into ${LANGUAGE}: "${TEXT}" What's your price?` }]);
info(`Shopkeeper: ${chat.reply}`);
const quote = chat.events.find((e) => e.type === "quote");
if (!quote || quote.type !== "quote") fail("the shopkeeper did not register a quote on-chain");
tx(`Quote registered on-chain: order ${quote.orderId}, ${quote.words} words, ${formatNear(quote.priceYocto, 6)} NEAR`, quote.hash);

step("2. The customer pays; the shop buys the job from a supplier and checks it");
const result = await checkout(quote.orderId, quote.text, quote.language);
if (!result.ok) fail(`checkout: ${result.error}`);
tx("Customer paid", result.payTx);
for (const a of result.receipt.attempts) {
  info(`${a.supplier}: quoted ${formatNear(a.quotedYocto, 6)} NEAR -> ${a.outcome}`);
  if (a.counter) info(`  counter: ${a.counter.reason} (${a.counter.accepted ? "accepted" : "rejected"})`);
  if (a.review) info(`  review: ${a.review.score}/10, ${a.review.reason}`);
}
const delivered = result.receipt.delivered;
if (!delivered) fail("no supplier delivered; the customer was refunded");
tx(`Supplier paid ${formatNear(delivered.paidYocto, 6)} NEAR`, delivered.tx);
tx(`AI cost booked: ${result.receipt.cost?.ok ? "ok" : result.receipt.cost?.error}`, result.receipt.cost?.hash);
info(`Translation: ${delivered.translation}`);

step("3. Payout: profit above the reserve is split between owner and contributor");
const payout = await contract.payout();
if (!payout.ok) fail(`payout: ${payout.error}`);
tx("Payout sent", payout.hash);
const summary = await contract.summary();
info(`Treasury now ${formatNear(summary.treasury, 6)} NEAR (the reserve); spent today ${formatNear(summary.spend_today, 6)} NEAR`);

done("Full loop complete.");
