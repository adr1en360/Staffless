use crate::{Store, StoreExt};
use near_sdk::json_types::U64;
use near_sdk::{AccountId, NearToken, near, require};

/// The owner's rules. Set once by the owner; the shopkeeper can't change them.
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Rules {
    /// Lowest price per word the AI may agree to with a person.
    pub floor_per_word: NearToken,
    /// Fixed price per word for agents buying from a tab.
    pub list_per_word: NearToken,
    pub max_refund: NearToken,
    /// Cap on supplier payments plus recorded AI costs per UTC day.
    pub daily_spend_cap: NearToken,
    /// Cash the payout always leaves in the treasury.
    pub reserve: NearToken,
    /// Contributor's share of each payout, in basis points (2000 = 20%).
    pub contributor_bps: u16,
    /// How long after the last settle a customer must wait to close a tab.
    pub close_delay_ns: U64,
}

impl Rules {
    pub fn validate(&self) {
        require!(self.contributor_bps <= 10_000, "contributor_bps over 10000");
        require!(self.list_per_word >= self.floor_per_word, "list price below floor");
    }
}

#[near]
impl Store {
    pub fn set_rules(&mut self, rules: Rules) {
        self.assert_owner();
        rules.validate();
        self.rules = rules;
    }

    pub fn add_supplier(&mut self, supplier: AccountId, max_per_job: NearToken) {
        self.assert_owner();
        self.suppliers.insert(supplier, max_per_job);
    }

    pub fn remove_supplier(&mut self, supplier: AccountId) {
        self.assert_owner();
        self.suppliers.remove(&supplier);
    }

    /// Kill switch: stops every shop action. Withdraw and tab closing still work.
    pub fn freeze(&mut self) {
        self.assert_owner();
        self.frozen = true;
    }

    pub fn unfreeze(&mut self) {
        self.assert_owner();
        self.frozen = false;
    }

    pub fn get_rules(&self) -> Rules {
        self.rules.clone()
    }

    pub fn get_suppliers(&self) -> Vec<(AccountId, NearToken)> {
        self.suppliers.iter().map(|(a, m)| (a.clone(), *m)).collect()
    }
}

#[cfg(test)]
mod tests {
    use crate::testing::*;
    use near_sdk::NearToken;

    #[test]
    #[should_panic(expected = "only the owner")]
    fn shopkeeper_cannot_change_rules() {
        let mut s = store();
        call_as("shop.testnet", NearToken::from_yoctonear(0), DAY_NS);
        s.set_rules(rules());
    }

    #[test]
    #[should_panic(expected = "list price below floor")]
    fn rejects_list_price_below_floor() {
        let mut s = store();
        let mut r = rules();
        r.list_per_word = near(0);
        s.set_rules(r);
    }

    #[test]
    #[should_panic(expected = "store frozen")]
    fn freeze_blocks_shop_actions() {
        let mut s = store();
        s.freeze();
        call_as("shop.testnet", NearToken::from_yoctonear(0), DAY_NS);
        s.quote(acc("guest.testnet"), "hello world".into(), near(5));
    }
}
