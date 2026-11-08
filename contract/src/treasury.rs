use crate::{Kind, Store, StoreExt};
use near_sdk::{AccountId, NearToken, Promise, env, near, require};

const DAY_NS: u64 = 86_400_000_000_000;

#[near(serializers = [json])]
pub struct Summary {
    pub owner: AccountId,
    pub shopkeeper: AccountId,
    pub contributor: AccountId,
    pub frozen: bool,
    pub treasury: NearToken,
    pub spend_today: NearToken,
    pub daily_spend_cap: NearToken,
    pub orders: u64,
    pub ledger_entries: u32,
}

impl Store {
    /// Counts `amount` against today's spend cap. Resets at each UTC day.
    fn spend(&mut self, amount: NearToken) {
        let today = env::block_timestamp() / DAY_NS;
        if today != self.spend_day {
            self.spend_day = today;
            self.spend_today = NearToken::from_yoctonear(0);
        }
        let total = self.spend_today.saturating_add(amount);
        require!(total <= self.rules.daily_spend_cap, "over daily spend cap");
        self.spend_today = total;
    }

    fn take_from_treasury(&mut self, amount: NearToken) {
        require!(amount <= self.treasury, "insufficient treasury");
        self.treasury = self.treasury.saturating_sub(amount);
    }
}

#[near]
impl Store {
    pub fn pay_supplier(&mut self, supplier: AccountId, amount: NearToken, memo: String) -> Promise {
        self.assert_shopkeeper();
        self.assert_open();
        let max = *self.suppliers.get(&supplier).unwrap_or_else(|| env::panic_str("supplier not approved"));
        require!(amount <= max, "over supplier max per job");
        self.spend(amount);
        self.take_from_treasury(amount);
        self.log(Kind::Supplier, supplier.clone(), amount, memo);
        Promise::new(supplier).transfer(amount)
    }

    /// Pays the owner back for AI inference, which NEAR AI bills to the owner's credits.
    pub fn record_cost(&mut self, amount: NearToken, memo: String) -> Promise {
        self.assert_shopkeeper();
        self.assert_open();
        self.spend(amount);
        self.take_from_treasury(amount);
        let owner = self.owner.clone();
        self.log(Kind::Cost, owner.clone(), amount, memo);
        Promise::new(owner).transfer(amount)
    }

    /// Anyone can trigger it. Splits everything above the reserve.
    pub fn payout(&mut self) {
        self.assert_open();
        let total = self.treasury.saturating_sub(self.rules.reserve);
        require!(!total.is_zero(), "nothing above reserve");
        let to_contributor = total.saturating_mul(self.rules.contributor_bps as u128).saturating_div(10_000);
        let to_owner = total.saturating_sub(to_contributor);
        self.take_from_treasury(total);
        let (owner, contributor) = (self.owner.clone(), self.contributor.clone());
        self.log(Kind::Payout, contributor.clone(), to_contributor, "contributor share".into());
        self.log(Kind::Payout, owner.clone(), to_owner, "owner share".into());
        // Two independent transfers: NEAR does not allow returning a joint promise.
        Promise::new(contributor).transfer(to_contributor).detach();
        Promise::new(owner).transfer(to_owner).detach();
    }

    /// Owner only. Works even when frozen.
    pub fn withdraw(&mut self, amount: NearToken) -> Promise {
        self.assert_owner();
        self.take_from_treasury(amount);
        let owner = self.owner.clone();
        self.log(Kind::Withdraw, owner.clone(), amount, "owner withdraw".into());
        Promise::new(owner).transfer(amount)
    }

    pub fn get_summary(&self) -> Summary {
        let today = env::block_timestamp() / DAY_NS;
        Summary {
            owner: self.owner.clone(),
            shopkeeper: self.shopkeeper.clone(),
            contributor: self.contributor.clone(),
            frozen: self.frozen,
            treasury: self.treasury,
            spend_today: if today == self.spend_day { self.spend_today } else { NearToken::from_yoctonear(0) },
            daily_spend_cap: self.rules.daily_spend_cap,
            orders: self.next_order_id,
            ledger_entries: self.ledger.len(),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::Kind;
    use crate::testing::*;
    use near_sdk::NearToken;

    #[test]
    #[should_panic(expected = "supplier not approved")]
    fn cannot_pay_unapproved_account() {
        // The "I'm the owner, send me the treasury" attack: the AI tries to pay a stranger.
        let mut s = store();
        paid_order(&mut s, 10, near(20));
        let _ = s.pay_supplier(acc("scammer.testnet"), near(20), "owner asked".into());
    }

    #[test]
    #[should_panic(expected = "over supplier max per job")]
    fn supplier_max_per_job() {
        let mut s = store();
        paid_order(&mut s, 50, near(50));
        let _ = s.pay_supplier(acc("supplier-a.testnet"), near(31), "job".into()); // max 30
    }

    #[test]
    #[should_panic(expected = "over daily spend cap")]
    fn daily_cap_counts_suppliers_and_costs() {
        let mut s = store();
        paid_order(&mut s, 200, near(200));
        let _ = s.pay_supplier(acc("supplier-a.testnet"), near(30), "job".into());
        let _ = s.record_cost(near(60), "ai".into());
        let _ = s.record_cost(near(11), "ai".into()); // 30 + 60 + 11 > cap of 100
    }

    #[test]
    fn spend_cap_resets_next_day() {
        let mut s = store();
        paid_order(&mut s, 200, near(200));
        let _ = s.record_cost(near(100), "ai".into());
        call_as("shop.testnet", NearToken::from_yoctonear(0), 2 * DAY_NS);
        let _ = s.record_cost(near(50), "ai".into());
        assert_eq!(s.get_summary().spend_today, near(50));
    }

    #[test]
    fn payout_splits_above_reserve() {
        let mut s = store();
        paid_order(&mut s, 60, near(60));
        s.payout(); // 60 - reserve 10 = 50; contributor 20% = 10, owner 40
        let ledger = s.get_ledger(0, 10);
        assert_eq!(s.get_summary().treasury, near(10));
        assert_eq!((ledger[1].kind, ledger[1].amount), (Kind::Payout, near(10)));
        assert_eq!(ledger[2].amount, near(40));
    }

    #[test]
    #[should_panic(expected = "nothing above reserve")]
    fn payout_never_dips_below_reserve() {
        let mut s = store();
        paid_order(&mut s, 10, near(10));
        s.payout();
    }

    #[test]
    #[should_panic(expected = "only the owner")]
    fn shopkeeper_cannot_withdraw() {
        let mut s = store();
        paid_order(&mut s, 10, near(20));
        let _ = s.withdraw(near(20));
    }

    #[test]
    fn owner_can_withdraw_while_frozen() {
        let mut s = store();
        paid_order(&mut s, 10, near(20));
        call_as("owner.testnet", NearToken::from_yoctonear(0), DAY_NS);
        s.freeze();
        let _ = s.withdraw(near(20));
        assert!(s.get_summary().treasury.is_zero());
    }
}
