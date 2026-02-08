export type AssignmentStatus = "draft" | "published";

export type Assignment = {
  id: string;
  course_id: string;
  title: string;
  body: Record<string, any> | null;
  status: AssignmentStatus;
  published_at: string | null;
  due_at?: string | null;
  max_score?: number | null;
  max_submissions?: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Submission = {
  id: string;
  assignment_id: string;
  student_id: string;
  file_path: string;
  file_url?: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

export type Grade = {
  id: string;
  submission_id: string;
  grader_id: string;
  score: number | null;
  feedback: string | null;
  graded_at: string;
};

export type AssignmentWithMeta = Assignment & {
  content_node_id?: string | null;
  content_parent_id?: string | null;
  submissions?: (Submission & { grade?: Grade | null })[];
};

export type AssignmentFile = {
  id: string;
  assignment_id: string;
  name: string;
  storage_path: string;
  url?: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_by: string | null;
  created_at: string;
};
