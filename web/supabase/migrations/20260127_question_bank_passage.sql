do $$
begin
  alter table questions add column passage text;
exception when duplicate_column then null;
end$$;
