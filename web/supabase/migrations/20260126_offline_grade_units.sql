-- Offline grade units (manual grade items)
create table if not exists offline_grade_units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  max_score numeric,
  publish_at timestamptz,
  created_at timestamptz not null default now()
);

-- Link offline_grades to units (nullable for backward compatibility)
do $$
begin
  alter table offline_grades add column unit_id uuid references offline_grade_units(id) on delete cascade;
exception when duplicate_column then null;
end$$;

create index if not exists offline_grade_units_course_idx on offline_grade_units(course_id);

-- If a grade has no unit, keep allowed by RLS unchanged (no additional policy needed)
