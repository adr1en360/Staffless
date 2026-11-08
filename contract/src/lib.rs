//! Staffless store: holds the shop's money and enforces the owner's rules.
//! The AI shopkeeper can only call the methods that check those rules.

mod ledger;
mod orders;
mod rules;
mod tabs;
mod treasury;

pub use ledger::{Entry, Kind};
pub use orders::{Order, Status};
pub use rules::Rules;
pub use tabs::Tab;
pub use treasury::Summary;

use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{AccountId, BorshStorageKey, NearToken, PanicOnDefault, env, near, require};

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Suppliers,
    Orders,
    Tabs,
    Ledger,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Store {
    owner: AccountId,
    shopkeeper: AccountId,
    contributor: AccountId,
    rules: Rules,
    frozen: bool,
    /// Approved suppliers and the most the shop may pay each per job.
    suppliers: IterableMap<AccountId, NearToken>,
    orders: LookupMap<u64, Order>,
    next_order_id: u64,
    tabs: LookupMap<AccountId, Tab>,
    /// The shop's own money. Never includes customers' tab deposits.
    treasury: NearToken,
    spend_day: u64,
    spend_today: NearToken,
    ledger: Vector<Entry>,
}

#[near]
impl Store {
    #[init]
    pub fn new(owner: AccountId, shopkeeper: AccountId, contributor: AccountId, rules: Rules) -> Self {
        require!(owner != shopkeeper, "owner and shopkeeper must differ");
        rules.validate();
        Self {
            owner,
            shopkeeper,
            contributor,
            rules,
            frozen: false,
            suppliers: IterableMap::new(StorageKey::Suppliers),
            orders: LookupMap::new(StorageKey::Orders),
            next_order_id: 0,
            tabs: LookupMap::new(StorageKey::Tabs),
            treasury: NearToken::from_yoctonear(0),
            spend_day: 0,
            spend_today: NearToken::from_yoctonear(0),
            ledger: Vector::new(StorageKey::Ledger),
        }
    }
}

impl Store {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "only the owner");
    }

    fn assert_shopkeeper(&self) {
        require!(env::predecessor_account_id() == self.shopkeeper, "only the shopkeeper");
    }

    fn assert_open(&self) {
        require!(!self.frozen, "store frozen");
    }
}

#[cfg(test)]
pub(crate) mod testing {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    pub const DAY_NS: u64 = 86_400_000_000_000;

    pub fn near(milli: u128) -> NearToken {
        NearToken::from_millinear(milli)
    }

    pub fn acc(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    pub fn rules() -> Rules {
        Rules {
            floor_per_word: near(1),
            list_per_word: near(2),
            max_refund: near(50),
            daily_spend_cap: near(100),
            reserve: near(10),
            contributor_bps: 2_000,
            close_delay_ns: 600_000_000_000.into(),
        }
    }

    /// Sets who is calling, with what deposit, at what time.
    pub fn call_as(who: &str, deposit: NearToken, ts: u64) {
        testing_env!(
            VMContextBuilder::new()
                .current_account_id(acc("store.testnet"))
                .predecessor_account_id(acc(who))
                .attached_deposit(deposit)
                .block_timestamp(ts)
                .build()
        );
    }

    pub fn store() -> Store {
        call_as("owner.testnet", NearToken::from_yoctonear(0), DAY_NS);
        let mut s = Store::new(acc("owner.testnet"), acc("shop.testnet"), acc("contrib.testnet"), rules());
        s.add_supplier(acc("supplier-a.testnet"), near(30));
        s
    }

    /// A paid order worth `price` from guest; leaves the caller as the shopkeeper.
    pub fn paid_order(s: &mut Store, words: usize, price: NearToken) -> u64 {
        call_as("shop.testnet", NearToken::from_yoctonear(0), DAY_NS);
        let id = s.quote(acc("guest.testnet"), vec!["word"; words].join(" "), price);
        call_as("guest.testnet", price, DAY_NS);
        s.pay(id);
        call_as("shop.testnet", NearToken::from_yoctonear(0), DAY_NS);
        id
    }
}
