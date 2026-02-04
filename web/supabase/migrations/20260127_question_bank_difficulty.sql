do $$
begin
  alter table questions add column difficulty text check (difficulty in ('easy','medium','hard'));
exception when duplicate_column then null;
end$$;
