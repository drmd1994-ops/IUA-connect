# M27: Payments: membership fees and event fees

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 2 (not in the roadmap's list; needed for real use). Size: L. Needs first: M17 and M18. The association's bank or payment provider, and its accountant.

## 1. Goal

A member pays their membership fee and an event's fee online and gets a receipt; the office sees who paid without setting it by hand.

**Why:** Membership has a payment status set by hand. The early documents promised prepared tables and a connection point; they were not built (`KNOWN_LIMITATIONS.md`).

## 2. Scope

**In**

- Fees per membership type and year; an event's price, with member and non-member prices.
- Paying through a payment provider's own page: card details never touch IUA Connect.
- Receipts and tax invoices as Israeli law requires, most likely through an invoicing service.
- Renewal reminders; a membership becomes active on payment where the type says so.
- The office: payments list, refunds, manual payments (bank transfer, cash) with a reference, reports for the accountant.
- On the site; in the app, paying opens the provider's page in the browser.

**Not in**

- Storing card numbers, ever.
- Paying inside the app through the stores (they take a share and forbid some uses; decided against unless required).
- Subscriptions charged automatically, unless question 3 asks for them.

## 3. Rules

- IUA Connect never sees or stores a card number; it keeps the provider's reference only.
- A payment is recorded from the provider's signed message to the server, never from the browser saying "paid".
- Every refund and manual entry has a person and a reason in the audit log.
- Money amounts are whole agorot, never fractions.

## 4. What is built

**Data:** `fees`, `payments` (append-only), `refunds`, invoice references.

- Server: a `payments` module behind a `PaymentProvider` interface, with a pretend provider for the demo and tests. Site: paying, receipts, the office's screens.

## 5. New libraries, services and costs (each needs the owner's approval)

- A payment provider that serves Israeli associations (for example Tranzila, Cardcom, PayPlus, or Stripe if available to the association) and an invoicing service. Each charges fees per payment.

## 6. Tests

- A forged "paid" message is refused; a repeated one is counted once.
- Totals reconcile with a hand-worked example; refunds; a payment that arrives after the member closed the page.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved, with the provider chosen
2. Data, the interface, the pretend provider
3. Membership fees
4. Event fees
5. Receipts and invoices
6. The office's screens and reports
7. The real provider, in its test mode
8. Documents, status, demo

## 8. Risks

| Risk                                  | What is done about it                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Tax and invoicing rules are got wrong | The accountant reviews the plan and the first invoices; an invoicing service does the legal part |
| A double charge                       | One payment per order by design; reconciliation report daily                                     |

## 9. Questions for the owner

1. Which payment provider does the association use or prefer?
2. Who is the accountant, and which invoicing rules apply to the association?
3. Automatic yearly renewal, or a reminder and a button?
4. Are event fees in scope from the start?

## 10. Owner answers

None yet.
