use crate::{Kind, Store, StoreExt};
use near_sdk::json_types::Base64VecU8;
use near_sdk::{AccountId, CurveType, NearToken, Promise, PublicKey, env, near, require};

/// A customer's prepaid tab. `settled` only ever grows, so an old voucher
/// can never be settled twice, even after the tab is closed and reopened.
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Tab {
    pub public_key: PublicKey,
    pub balance: NearToken,
    pub settled: NearToken,
    pub last_settle_ns: u64,
}

/// The exact text a customer signs for a voucher.
pub fn voucher_message(store: &AccountId, customer: &AccountId, cumulative: NearToken) -> String {
    format!("staffless-tab:{store}:{customer}:{}", cumulative.as_yoctonear())
}

#[near]
impl Store {
    /// Open or top up a tab. The key signs vouchers; it must stay the same.
    #[payable]
    pub fn open_tab(&mut self, public_key: PublicKey) {
        self.assert_open();
        require!(public_key.curve_type() == CurveType::ED25519, "tab key must be ed25519");
        let deposit = env::attached_deposit();
        require!(!deposit.is_zero(), "attach a deposit");
        let customer = env::predecessor_account_id();
        match self.tabs.get_mut(&customer) {
            Some(tab) => {
                require!(tab.public_key == public_key, "tab key cannot change");
                tab.balance = tab.balance.saturating_add(deposit);
            }
            None => {
                let tab = Tab {
                    public_key,
                    balance: deposit,
                    settled: NearToken::from_yoctonear(0),
                    last_settle_ns: env::block_timestamp(),
                };
                self.tabs.insert(customer, tab);
            }
        }
    }

    /// The shop collects everything owed up to a signed voucher, in one transaction.
    pub fn settle_tab(&mut self, customer: AccountId, cumulative: NearToken, signature: Base64VecU8) {
        self.assert_shopkeeper();
        self.assert_open();
        let message = voucher_message(&env::current_account_id(), &customer, cumulative);
        let tab = self.tabs.get_mut(&customer).unwrap_or_else(|| env::panic_str("no such tab"));
        let signature: [u8; 64] = signature.0.try_into().unwrap_or_else(|_| env::panic_str("bad signature length"));
        let key: [u8; 32] = tab.public_key.as_bytes()[1..].try_into().unwrap();
        require!(env::ed25519_verify(&signature, message.as_bytes(), &key), "bad voucher signature");
        require!(cumulative > tab.settled, "voucher already settled");
        let due = cumulative.saturating_sub(tab.settled);
        require!(due <= tab.balance, "tab underfunded");
        tab.balance = tab.balance.saturating_sub(due);
        tab.settled = cumulative;
        tab.last_settle_ns = env::block_timestamp();
        self.treasury = self.treasury.saturating_add(due);
        self.log(Kind::TabSettle, customer, due, "tab".into());
    }

    /// Returns the rest of the deposit. Waits `close_delay_ns` after the last settle
    /// so the shop can collect vouchers it already served. Works even when frozen.
    pub fn close_tab(&mut self) -> Promise {
        let customer = env::predecessor_account_id();
        let delay = self.rules.close_delay_ns.0;
        let tab = self.tabs.get_mut(&customer).unwrap_or_else(|| env::panic_str("no such tab"));
        require!(env::block_timestamp() >= tab.last_settle_ns.saturating_add(delay), "tab close delay not over");
        let refund = tab.balance;
        require!(!refund.is_zero(), "tab empty");
        tab.balance = NearToken::from_yoctonear(0);
        Promise::new(customer).transfer(refund)
    }

    pub fn get_tab(&self, customer: AccountId) -> Option<Tab> {
        self.tabs.get(&customer).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::voucher_message;
    use crate::testing::*;
    use ed25519_dalek::{Signer, SigningKey};
    use near_sdk::json_types::Base64VecU8;
    use near_sdk::{CurveType, NearToken, PublicKey};

    fn key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    fn public_key(k: &SigningKey) -> PublicKey {
        PublicKey::from_parts(CurveType::ED25519, k.verifying_key().to_bytes().to_vec()).unwrap()
    }

    fn voucher(k: &SigningKey, cumulative: NearToken) -> Base64VecU8 {
        let msg = voucher_message(&acc("store.testnet"), &acc("agent.testnet"), cumulative);
        Base64VecU8(k.sign(msg.as_bytes()).to_bytes().to_vec())
    }

    fn open(s: &mut crate::Store, deposit: NearToken) -> SigningKey {
        let k = key();
        call_as("agent.testnet", deposit, DAY_NS);
        s.open_tab(public_key(&k));
        call_as("shop.testnet", NearToken::from_yoctonear(0), DAY_NS);
        k
    }

    #[test]
    fn many_vouchers_settle_once() {
        let mut s = store();
        let k = open(&mut s, near(100));
        // 100 purchases happen off-chain; only the last voucher is settled.
        s.settle_tab(acc("agent.testnet"), near(37), voucher(&k, near(37)));
        let tab = s.get_tab(acc("agent.testnet")).unwrap();
        assert_eq!((tab.balance, tab.settled), (near(63), near(37)));
        assert_eq!(s.get_summary().treasury, near(37));
    }

    #[test]
    #[should_panic(expected = "bad voucher signature")]
    fn forged_voucher_is_rejected() {
        let mut s = store();
        open(&mut s, near(100));
        let forger = SigningKey::from_bytes(&[9u8; 32]);
        s.settle_tab(acc("agent.testnet"), near(50), voucher(&forger, near(50)));
    }

    #[test]
    #[should_panic(expected = "bad voucher signature")]
    fn shop_cannot_raise_the_amount() {
        let mut s = store();
        let k = open(&mut s, near(100));
        let sig = voucher(&k, near(10));
        s.settle_tab(acc("agent.testnet"), near(90), sig);
    }

    #[test]
    #[should_panic(expected = "voucher already settled")]
    fn voucher_cannot_be_replayed() {
        let mut s = store();
        let k = open(&mut s, near(100));
        s.settle_tab(acc("agent.testnet"), near(10), voucher(&k, near(10)));
        s.settle_tab(acc("agent.testnet"), near(10), voucher(&k, near(10)));
    }

    #[test]
    #[should_panic(expected = "tab underfunded")]
    fn cannot_settle_more_than_deposit() {
        let mut s = store();
        let k = open(&mut s, near(5));
        s.settle_tab(acc("agent.testnet"), near(6), voucher(&k, near(6)));
    }

    #[test]
    #[should_panic(expected = "tab close delay not over")]
    fn close_waits_for_delay() {
        let mut s = store();
        open(&mut s, near(5));
        call_as("agent.testnet", NearToken::from_yoctonear(0), DAY_NS + 1);
        let _ = s.close_tab();
    }

    #[test]
    fn close_returns_balance_after_delay() {
        let mut s = store();
        open(&mut s, near(5));
        call_as("agent.testnet", NearToken::from_yoctonear(0), DAY_NS + 600_000_000_000);
        let _ = s.close_tab();
        assert!(s.get_tab(acc("agent.testnet")).unwrap().balance.is_zero());
    }
}
