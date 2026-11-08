use crate::{Kind, Store, StoreExt};
use near_sdk::{AccountId, CryptoHash, NearToken, Promise, env, near, require};

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Status {
    Quoted,
    Paid,
    Refunded,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Order {
    pub customer: AccountId,
    pub words: u32,
    pub price: NearToken,
    pub text_hash: CryptoHash,
    pub status: Status,
}

#[near]
impl Store {
    /// The AI registers a price for a text. The contract counts the words itself,
    /// so a talked-down AI can't agree to less than the owner's floor.
    pub fn quote(&mut self, customer: AccountId, text: String, price: NearToken) -> u64 {
        self.assert_shopkeeper();
        self.assert_open();
        let words = text.split_whitespace().count();
        require!(words > 0, "empty text");
        let floor = self.rules.floor_per_word.saturating_mul(words as u128);
        require!(price >= floor, "below floor");
        let id = self.next_order_id;
        self.next_order_id += 1;
        let order = Order {
            customer,
            words: words as u32,
            price,
            text_hash: env::sha256_array(text.as_bytes()),
            status: Status::Quoted,
        };
        self.orders.insert(id, order);
        id
    }

    #[payable]
    pub fn pay(&mut self, order_id: u64) {
        self.assert_open();
        let order = self.orders.get_mut(&order_id).unwrap_or_else(|| env::panic_str("no such order"));
        require!(env::predecessor_account_id() == order.customer, "not your order");
        require!(order.status == Status::Quoted, "order not payable");
        require!(env::attached_deposit() == order.price, "attach exactly the quoted price");
        order.status = Status::Paid;
        let (customer, price) = (order.customer.clone(), order.price);
        self.treasury = self.treasury.saturating_add(price);
        self.log(Kind::Sale, customer, price, format!("order {order_id}"));
    }

    pub fn refund(&mut self, order_id: u64, amount: NearToken) -> Promise {
        self.assert_shopkeeper();
        self.assert_open();
        let max_refund = self.rules.max_refund;
        let treasury = self.treasury;
        let order = self.orders.get_mut(&order_id).unwrap_or_else(|| env::panic_str("no such order"));
        require!(order.status == Status::Paid, "order not refundable");
        require!(amount <= order.price && amount <= max_refund, "refund over limit");
        require!(amount <= treasury, "insufficient treasury");
        order.status = Status::Refunded;
        let customer = order.customer.clone();
        self.treasury = self.treasury.saturating_sub(amount);
        self.log(Kind::Refund, customer.clone(), amount, format!("order {order_id}"));
        // shortcut: a transfer to a deleted account returns funds untracked; customers just paid, so they exist.
        Promise::new(customer).transfer(amount)
    }

    pub fn get_order(&self, order_id: u64) -> Option<Order> {
        self.orders.get(&order_id).cloned()
    }
}

#[cfg(test)]
mod tests {
    use crate::testing::*;
    use crate::{Kind, Status};
    use near_sdk::NearToken;

    #[test]
    #[should_panic(expected = "below floor")]
    fn quote_below_floor_is_rejected() {
        let mut s = store();
        call_as("shop.testnet", NearToken::from_yoctonear(0), DAY_NS);
        // 10 words at a floor of 1 milliNEAR each = 10 milliNEAR minimum.
        s.quote(acc("guest.testnet"), vec!["w"; 10].join(" "), near(9));
    }

    #[test]
    #[should_panic(expected = "only the shopkeeper")]
    fn only_shopkeeper_quotes() {
        let mut s = store();
        call_as("guest.testnet", NearToken::from_yoctonear(0), DAY_NS);
        s.quote(acc("guest.testnet"), "hi".into(), near(5));
    }

    #[test]
    fn pay_moves_money_into_treasury_and_logs_sale() {
        let mut s = store();
        let id = paid_order(&mut s, 10, near(20));
        assert_eq!(s.get_order(id).unwrap().status, Status::Paid);
        assert_eq!(s.treasury, near(20));
        assert_eq!(s.get_ledger(0, 10)[0].kind, Kind::Sale);
    }

    #[test]
    #[should_panic(expected = "attach exactly the quoted price")]
    fn pay_requires_exact_price() {
        let mut s = store();
        call_as("shop.testnet", NearToken::from_yoctonear(0), DAY_NS);
        let id = s.quote(acc("guest.testnet"), "one two".into(), near(5));
        call_as("guest.testnet", near(4), DAY_NS);
        s.pay(id);
    }

    #[test]
    #[should_panic(expected = "not your order")]
    fn someone_else_cannot_pay() {
        let mut s = store();
        call_as("shop.testnet", NearToken::from_yoctonear(0), DAY_NS);
        let id = s.quote(acc("guest.testnet"), "one two".into(), near(5));
        call_as("stranger.testnet", near(5), DAY_NS);
        s.pay(id);
    }

    #[test]
    #[should_panic(expected = "refund over limit")]
    fn refund_over_max_is_rejected() {
        let mut s = store();
        let id = paid_order(&mut s, 100, near(100));
        let _ = s.refund(id, near(60)); // max_refund is 50
    }

    #[test]
    #[should_panic(expected = "order not refundable")]
    fn refund_only_once() {
        let mut s = store();
        let id = paid_order(&mut s, 10, near(20));
        let _ = s.refund(id, near(5));
        let _ = s.refund(id, near(5));
    }
}
