# DormPlus Full PMS Operations

Run migration `011_full_pms_operations.sql` after migration 010.

New modules:
- Billing periods + automatic invoice generation from active contracts and approved meter readings
- Payment verification + receipt number generation + invoice status recalculation
- Deposit ledger
- Checkout workflow
- Expense management
- Documents registry
- Reports
- Audit log viewer
- Tenant portal foundation
- Period closing to lock monthly operational flow

Recommended operational flow:
1. Approve meter readings
2. Create/open billing period
3. Generate invoices
4. Record payment + allocation
5. Verify payment -> receipt
6. Close period
7. For move-out: checkout -> final settlement -> deposit refund -> complete checkout
