# Due

Create a payment link. Share it. Get paid.

### BOT Chain mainnet (677) — live

| | |
|---|---|
| Contract | [`0x45B737380Ad888C1c279D5d9f373aD5c90D724D6`](https://scan.botchain.ai/address/0x45B737380Ad888C1c279D5d9f373aD5c90D724D6) · source verified |
| Deploy block | 27323055 |

### Bohr testnet (968) — live

| | |
|---|---|
| Contract | [`0xe7b5d33BEDdf88f8f4Df64F0bdF04284b3A97A6c`](https://scan.bohr.life/address/0xe7b5d33BEDdf88f8f4Df64F0bdF04284b3A97A6c) · source verified |
| Deploy block | 27397195 |

The two addresses differ because the deployer's nonce diverged between the chains; each is this
contract on its own network. The site targets mainnet.

---

## What it does
Due lets anyone create an on-chain invoice with an exact amount and an optional memo. The payee shares a `/i/[id]` link. The payer connects any native BOT Chain wallet and pays the exact amount, which transfers directly to the payee in the same transaction.

## Design decision: exact amount
The contract requires `msg.value == amount` exactly. Accepting more and refunding introduces reentrancy surface for zero benefit; accepting less leaves an ambiguous half-paid invoice nobody can reason about.

## What it deliberately cannot do
- **No custody**: the contract does not hold funds; payment moves directly to the payee
- **No owner**: no fee rake, no pause, no admin
- **No memo storage**: the memo string is emitted in `InvoiceCreated` event logs rather than SSTORE to keep gas minimal

## Gas
- `create()`: ~92k gas (target: ~90k)
- `pay()`: ~54k gas (target: ~55k)
- `cancel()`: ~30k gas

## Honest limits
- Anyone who knows the invoice ID can pay it; payees should verify payment receipt on chain
- Cancel is only possible while the invoice remains unpaid
