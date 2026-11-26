# How an order gets from Pay to a receipt

Rendered with Pele 1.13.0: flowchart, 7 boxes, 8 arrows, 1 group. 537 × 882 px.

## Warnings

- Rule broken: No receipt goes out unless the card is accepted. This path reaches "Receipt email" without passing "Card accepted?": "You press Pay" → "Charge the card" → "Retry queue" → "Orders" → "Receipt email".

## Rules

- ✗ **Broken:** No receipt goes out unless the card is accepted. This path reaches "Receipt email" without passing "Card accepted?": "You press Pay" → "Charge the card" → "Retry queue" → "Orders" → "Receipt email".

## Leaves out

- Refunds and cancellations, which start from another page
- What the card network does inside authorize()
- The database and the mailer, which only store and send

## Source checks

14 file sources were checked against the files under `.` (from the graph's folder). Each file is there, and each cited line is in the file.
14 cited lines were compared with the words of their claims.
No source warnings.

## To confirm

These have no source, so they are drawn dashed. Ask the reader to confirm them, or find a source.

- Arrow "Retry queue" → "Charge the card" (charges again later)

## Sources

| Claim | Source |
|---|---|
| Box "You press Pay" | shop/cart.js:4 |
| Box "Charge the card" | shop/pay.js:7 |
| Box "Retry queue" | shop/retry.js:4 |
| Box "Card accepted?" | shop/pay.js:15 |
| Box "Orders" | shop/orders.js:6 |
| Box "Receipt email" | shop/receipt.js:4-5 |
| Box "Card declined page" | shop/pay.js:20 |
| Arrow "You press Pay" → "Charge the card" (sends the order) | shop/cart.js:6 |
| Arrow "Charge the card" → "Card accepted?" (card network answers) | shop/pay.js:10 |
| Arrow "Charge the card" → "Retry queue" (network timeout) | shop/pay.js:11-13 |
| Arrow "Card accepted?" → "Orders" (yes) | shop/pay.js:16-17 |
| Arrow "Card accepted?" → "Card declined page" (no) | shop/pay.js:19-20 |
| Arrow "Retry queue" → "Orders" (saves it as pending) | shop/retry.js:5-7 |
| Arrow "Orders" → "Receipt email" (sends the receipt) | shop/orders.js:7 |

## Files

- `checkout.html`
- `checkout.mmd`
- `checkout.svg`
- `checkout.png`
- `checkout.report.md`
