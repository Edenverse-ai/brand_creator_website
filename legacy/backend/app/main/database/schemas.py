# SQL for table creation
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  brand_id       text,
  title          text          not null,
  brief          text,
  requirements   text,
  budget_range   text,
  budget_unit    text          default 'total',
  commission     text,
  platform       text,
  deadline       date,
  max_creators   integer       default 10,
  is_open        boolean       default true,
  created_at     timestamptz   default now(),
  sample_video_url text,
  -- Existing new fields
  industry_category text,
  primary_promotion_objectives text,
  ad_placement text default 'disable',
  campaign_execution_mode text default 'direct',
  creator_profile_preferences_gender text,
  creator_profile_preference_ethnicity text,
  creator_profile_preference_content_niche text,
  preferred_creator_location text,
  language_requirement_for_creators text default 'english',
  creator_tier_requirement text,
  send_to_creator text default 'yes',
  approved_by_brand text default 'yes',
  kpi_reference_target text,
  prohibited_content_warnings text,
  posting_requirements text,
  product_photo text,
  -- New frontend fields
  script_required text default 'no',
  product_name text,
  product_highlight text,
  product_price text,
  product_sold_number text,
  paid_promotion_type text default 'commission_based',
  video_buyout_budget_range text,
  base_fee_budget_range text
);

-- Grant permissions to service role
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;

-- Make sure the RLS policy exists
DROP POLICY IF EXISTS "Service role can do everything" ON public.campaigns;
CREATE POLICY "Service role can do everything" 
  ON public.campaigns 
  USING (auth.role() = 'service_role') 
  WITH CHECK (auth.role() = 'service_role');

-- Enable row level security
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
"""
