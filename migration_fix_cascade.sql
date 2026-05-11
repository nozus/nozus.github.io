-- Fix transactions FK to allow deletion
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS transactions_currency_id_fkey;

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_currency_id_fkey
FOREIGN KEY (currency_id) REFERENCES public.currencies(id) ON DELETE CASCADE;

-- Also fix holdings just in case
ALTER TABLE public.holdings
DROP CONSTRAINT IF EXISTS holdings_currency_id_fkey;

ALTER TABLE public.holdings
ADD CONSTRAINT holdings_currency_id_fkey
FOREIGN KEY (currency_id) REFERENCES public.currencies(id) ON DELETE CASCADE;
