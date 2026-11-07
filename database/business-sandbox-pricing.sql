-- Keep the legacy C$29 sandbox order type readable for audit; no new checkout uses it.
alter table public.cleaning_sandbox_orders
  drop constraint cleaning_sandbox_orders_sku_check,
  drop constraint cleaning_sandbox_orders_amount_check;
alter table public.cleaning_sandbox_orders add constraint business_sandbox_sku_amount_check check (
  (sku='cleaning-toolkit' and amount=2900) or
  (sku='job-pricing' and amount=1500) or
  (sku='quote-builder' and amount=1900) or
  (sku='profit-tracker' and amount=1900) or
  (sku='business-bundle' and amount=3900)
);
