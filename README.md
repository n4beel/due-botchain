# Due

Create a payment link. Share it. Get paid.

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
