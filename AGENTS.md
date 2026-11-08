# Agent rules: Staffless

Read SPEC.md before any work. Do only the slice the prompt names.

## Never without the human's explicit OK

These come from HACKATHON.md, plus our $0 rule.

- Push, force-push, add a remote, or make the repo public.
- Post anything, or submit the hackathon form or API.
- Touch mainnet: sign, deploy, or spend. Reading docs is fine.
- Spend money of any kind. The budget is $0.
- Install system software (Rust, MSVC Build Tools, CLIs).
- Create testnet accounts or deploy contracts beyond what the slice prompt allows.
- Commit, unless the prompt says to.

## Always

- Testnet only.
- Secrets only in `.env` (gitignored). Keep `.env.example` in sync with the variable names.
- Audit before implementing: read the docs (https://docs.near.org/llms.txt, https://docs.near.ai/llms.txt) and the code you touch. Never guess package versions, method names, endpoints or account ids.
- Before editing an existing file over 50 lines, print its first 10 lines.
- If the spec, the docs and reality disagree, stop and report. Do not build past a contradiction.
- Claims about the UI need screenshots. Claims about transactions need tx hashes.

## Code standard (ponytail ultra + thermo-nuclear)

- Make the smallest complete change. No speculative options, wrappers, config or "for later" code.
- Money rules live in the contract. The app may pre-check for UX, but the contract is the authority.
- Contract: update state before any transfer, write one ledger entry per money move, and never leave a partial update.
- Typed boundaries: no `any`, no casts to silence errors, no optional params that hide an invariant.
- No file over 1000 lines. Split by concept well before that.
- No special-case branches bolted onto shared flows. Give the concept its own module.
- Run independent work in parallel (for example, supplier quotes).
- Every non-trivial branch, parser, money path or security path gets one small test.
- Comment known limits as `shortcut: <limit>, <when to upgrade>`.

## Report at the end of every slice

1. Files changed
2. Commands run, with their key output
3. Tests passed and failed
4. Tx hashes and explorer links
5. Contradictions and open questions
6. Risks

## Review gates

After Slice 1 and before submission, the human runs `/thermo-nuclear-code-quality-review` and `/ponytail-review`.
