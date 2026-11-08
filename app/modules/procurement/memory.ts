// The shopkeeper's memory of its suppliers, kept in the contract's public ledger notes.
// Writing: payment and AI-cost notes carry a small, fixed format. Reading: parse recent notes back into a track record.
import { contract, type Entry } from "../../lib/store";
import { formatNear, toYocto } from "../../lib/money";

export type Track = {
  paidJobs: number;
  scores: Array<{ language: string; score: number }>;
  failedReviews: number;
  acceptedPerWord: bigint[];
  declinedPerWord: bigint[];
};

/** What the AI sees about one supplier. */
export type TrackSummary = {
  paid_jobs: number;
  failed_reviews: number;
  average_score: number | null;
  average_score_for_this_language: number | null;
  lowest_paid_per_word_near: string | null;
  declined_offers_per_word_near: string[];
};

export const HISTORY_ENTRIES = 100;
const SCORE = String.raw`(\d+(?:\.\d+)?)`;
const PAY = new RegExp(String.raw`^order \d+, (.+), (\d+) words, review ${SCORE}/10$`);
const DECLINED = /^(\S+) declined ([\d.]+)\/word$/;
const FAILED = new RegExp(String.raw`^(\S+) failed review ${SCORE}/10 on (.+)$`);

/** Languages go into notes, so keep them to one lowercase phrase without separators. */
const lang = (language: string) => language.trim().toLowerCase().replace(/[,;]/g, " ").replace(/\s+/g, " ");
const perWord = (yocto: bigint) => formatNear(yocto, 10);

export const payMemo = (orderId: number, language: string, words: number, score: number) =>
  `order ${orderId}, ${lang(language)}, ${words} words, review ${score}/10`;
export const declinedNote = (account: string, perWordYocto: bigint) => `${account} declined ${perWord(perWordYocto)}/word`;
export const failedNote = (account: string, score: number, language: string) =>
  `${account} failed review ${score}/10 on ${lang(language)}`;
export const costMemo = (orderId: number, notes: string[]) => [`order ${orderId}`, ...notes].join("; ");

export function readTracks(entries: Entry[]): Map<string, Track> {
  const tracks = new Map<string, Track>();
  const get = (account: string) => {
    let t = tracks.get(account);
    if (!t) tracks.set(account, (t = { paidJobs: 0, scores: [], failedReviews: 0, acceptedPerWord: [], declinedPerWord: [] }));
    return t;
  };

  for (const e of entries) {
    if (e.kind === "Supplier") {
      const t = get(e.account);
      t.paidJobs++;
      const m = PAY.exec(e.memo); // older notes ("order 5") still count as paid jobs, without a score
      if (m) {
        t.scores.push({ language: m[1], score: Number(m[3]) });
        t.acceptedPerWord.push(BigInt(e.amount) / BigInt(m[2]));
      }
    } else if (e.kind === "Cost") {
      for (const note of e.memo.split("; ").slice(1)) {
        const d = DECLINED.exec(note);
        if (d) get(d[1]).declinedPerWord.push(toYocto(d[2]));
        const f = FAILED.exec(note);
        if (f) {
          const t = get(f[1]);
          t.failedReviews++;
          t.scores.push({ language: f[3], score: Number(f[2]) });
        }
      }
    }
  }
  return tracks;
}

const average = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function summarize(t: Track | undefined, language: string): TrackSummary {
  const scores = t?.scores ?? [];
  const lowest = t?.acceptedPerWord.reduce<bigint | null>((a, b) => (a === null || b < a ? b : a), null) ?? null;
  return {
    paid_jobs: t?.paidJobs ?? 0,
    failed_reviews: t?.failedReviews ?? 0,
    average_score: average(scores.map((s) => s.score)),
    average_score_for_this_language: average(scores.filter((s) => s.language === lang(language)).map((s) => s.score)),
    lowest_paid_per_word_near: lowest === null ? null : perWord(lowest),
    declined_offers_per_word_near: (t?.declinedPerWord ?? []).map(perWord),
  };
}

/** The recent public ledger, read back as supplier track records. */
export async function loadTracks(): Promise<Map<string, Track>> {
  const { ledger_entries } = await contract.summary();
  const from = Math.max(0, ledger_entries - HISTORY_ENTRIES);
  return readTracks(await contract.ledger(from, HISTORY_ENTRIES));
}
