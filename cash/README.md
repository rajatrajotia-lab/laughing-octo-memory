# CASH-REGISTER

Sibling app to HSD-REGISTER: entry and analysis of **cash expenses of each site**.
Same architecture — a single self-contained `index.html` (React + Recharts + SheetJS
inlined), records kept on the device in localStorage, installable as an offline PWA.

Served from GitHub Pages at `/cash/` alongside the fuel register at the site root.

## What the basic framework covers (v0.1.0)

- **Sites** — any number, each with its own cash book; add/rename/delete in Setup.
- **Entry** — expense vouchers (date, auto-numbered voucher, category, description,
  paid to, amount, remarks) and cash receipts (date, source, reference, amount).
- **Cash book** — chronological receipts + payments with running balance, month /
  type / category filters and free-text search; opening-balance row for a month view.
- **Site analysis** — month-by-month received vs spent, category-wise spend, top payees.
- **Company overview** — cash-in-hand across sites, site cash position table,
  spend by site, spend by category, monthly spend stacked site by site.
- **Excel export** — Summary sheet, one cash-book sheet per site, flat "All expenses"
  sheet for pivoting.
- **Backup / restore** — JSON backup file; restore replaces the register after confirmation.

## Data model

```
{ sites:      [{id, name}],
  categories: [string],                 // editable in Setup
  books:      { siteId: { receipts: [{id, ts, date, source, ref, amount, remarks}],
                          expenses: [{id, ts, date, voucher, category, description,
                                      paidTo, amount, remarks}] } } }
```

Stored under localStorage key `cashreg:cash:register:v1`.

## Ideas queued for fine-tuning

Approval flows, budgets/limits per category or site, imprest top-up tracking,
multi-user sync, voucher printing, photo of the bill against a voucher, Android
and desktop wrappers (same pipeline as the fuel register).
