# Staffless

A translation shop with no staff. An AI agent runs the business, and a NEAR smart contract holds the money and enforces the owner's rules, so even a fooled AI can't give the shop away.

Built for NEAR HACKATHON (tracks: Autonomous Business, Agent Economy). Runs on NEAR testnet.

> **Status: in progress.** This README only lists what works today. See [SPEC.md](SPEC.md) for the full plan.

## The problem

An AI that runs a business needs to handle money. AI agents can be talked into things: a customer can haggle them below cost, or claim to be the owner and ask for the cash. Rules written in a prompt can be argued away.

## How Staffless solves it

The owner's rules live in a NEAR contract, not in the prompt. The AI holds a key that can only call the contract's shop methods, and the contract checks every money move:

| Rule | Enforced by the contract |
|---|---|
| Lowest price per word | `quote` counts the words itself and rejects prices below the floor |
| Who can be paid | `pay_supplier` only pays approved suppliers, up to a max per job |
| Daily spending limit | Supplier payments and AI costs share one daily cap |
| Refund limit | One refund per order, capped |
| Cash reserve and profit split | `payout` splits only what is above the reserve |
| Kill switch | `freeze` stops every shop action; the owner can still withdraw |
| Only the owner withdraws | `withdraw` checks the caller |

AI agents can also buy from the shop through a prepaid **tab**: they sign a voucher per purchase, and the shop collects many vouchers in one transaction. The contract verifies each voucher's ed25519 signature, so the shop can't overcharge and a voucher can't be used twice.

## What works today

- The store contract (`contract/`) with all rules above and unit tests.

## Run the contract tests

Requirements: Rust (the version is pinned in `contract/rust-toolchain.toml`) and, on Windows, Microsoft C++ Build Tools.

```bash
cd contract
cargo test
```

Expected: `25 passed; 0 failed`, including the attack cases (paying an unapproved account, quoting below the floor, a forged voucher, a replayed voucher, the AI trying to withdraw).

Build the contract for the blockchain:

```bash
cd contract
cargo near build non-reproducible-wasm --no-abi
```

Expected: `target/near/staffless_store.wasm` (about 208 KB). `--no-abi` skips the optional interface file, whose generation step fails on Windows.

## Built with

- [near-sdk](https://github.com/near/near-sdk-rs) 5.30 (Rust) and [cargo-near](https://github.com/near/cargo-near)
- [ed25519-dalek](https://github.com/dalek-cryptography/curve25519-dalek) (tests only, to sign vouchers)
- [NEAR AI Cloud](https://docs.near.ai) for the shopkeeper model (GLM 5.3 Flash)

## License

[MIT](LICENSE)
