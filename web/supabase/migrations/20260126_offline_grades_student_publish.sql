-- Per-student publish date for offline grades
do $$
begin
  alter table offline_grades add column student_publish_at timestamptz;
exception when duplicate_column then null;
end$$;
