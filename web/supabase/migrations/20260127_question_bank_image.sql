do $$
begin
  alter table questions add column image_url text;
exception when duplicate_column then null;
end$$;
