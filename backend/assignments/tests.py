from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from courses.models import Course, CourseTeacher, Enrollment
from .models import Assignment, AssignmentFile


User = get_user_model()


class AssignmentFileLinkTests(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            email="teacher@example.com",
            username="teacher",
            password="password123",
        )
        self.teacher.profile.role = "teacher"
        self.teacher.profile.save(update_fields=["role"])
        self.student = User.objects.create_user(
            email="student@example.com",
            username="student",
            password="password123",
        )
        self.outsider = User.objects.create_user(
            email="outsider@example.com",
            username="outsider",
            password="password123",
        )
        self.course = Course.objects.create(slug="sat-verbal-a", title="SAT Verbal A")
        CourseTeacher.objects.create(course=self.course, teacher=self.teacher)
        Enrollment.objects.create(course=self.course, user=self.student)
        self.assignment = Assignment.objects.create(
            course=self.course,
            title="Essay 1",
            status="published",
            created_by=self.teacher,
        )
        self.attachment = AssignmentFile.objects.create(
            assignment=self.assignment,
            name="prompt.pdf",
            storage_path="assignment_attachments/test/prompt.pdf",
            mime_type="application/pdf",
            created_by=self.teacher,
        )

    def test_student_gets_tokenized_assignment_file_link(self):
        self.client.force_authenticate(self.student)

        response = self.client.get("/api/assignments/file-link/", {"attachment_id": str(self.attachment.id)})

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(
            data["url"].startswith(f"/api/assignments/file/?attachment_id={self.attachment.id}&token=")
        )
        self.assertEqual(data["expires_in"], 900)

    def test_outsider_cannot_get_assignment_file_link(self):
        self.client.force_authenticate(self.outsider)

        response = self.client.get("/api/assignments/file-link/", {"attachment_id": str(self.attachment.id)})

        self.assertEqual(response.status_code, 403)
