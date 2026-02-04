do $$
begin
  alter table questions add column explanation text;
exception when duplicate_column then null;
end$$;
