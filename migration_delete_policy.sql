-- Allow creators to delete their own currencies
CREATE POLICY "Users can delete own currencies" 
ON public.currencies 
FOR DELETE 
USING (auth.uid() = creator_id);
