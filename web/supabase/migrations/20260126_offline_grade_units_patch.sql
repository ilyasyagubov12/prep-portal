-- Add publish_at column if missing (idempotent)
do $$
begin
  alter table offline_grade_units add column publish_at timestamptz;
exception when duplicate_column then null;
end$$;
