use crate::{Store, StoreExt};
use near_sdk::{AccountId, NearToken, env, near};

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    Sale,
    TabSettle,
    Refund,
    Supplier,
    Cost,
    Payout,
    Withdraw,
}

/// One move of the shop's own money. Tab deposits are customers' money and aren't logged.
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Entry {
    pub kind: Kind,
    pub account: AccountId,
    pub amount: NearToken,
    pub memo: String,
    pub block: u64,
}

impl Store {
    pub(crate) fn log(&mut self, kind: Kind, account: AccountId, amount: NearToken, memo: String) {
        self.ledger.push(Entry { kind, account, amount, memo, block: env::block_height() });
    }
}

#[near]
impl Store {
    pub fn get_ledger(&self, from: u32, limit: u32) -> Vec<Entry> {
        (from..self.ledger.len().min(from.saturating_add(limit)))
            .filter_map(|i| self.ledger.get(i).cloned())
            .collect()
    }
}
