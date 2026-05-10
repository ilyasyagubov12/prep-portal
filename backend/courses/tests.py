from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Course, CourseNode, Enrollment


User = get_user_model()


class CourseFileLinkTests(APITestCase):
    def setUp(self):
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
        self.course = Course.objects.create(slug="sat-math-a", title="SAT Math A")
        Enrollment.objects.create(course=self.course, user=self.student)
        self.node = CourseNode.objects.create(
            course=self.course,
            kind="file",
            name="lesson.pdf",
            storage_path="course_files/test/lesson.pdf",
            mime_type="application/pdf",
            published=True,
            created_by=self.student,
        )

    def test_enrolled_student_gets_tokenized_file_link(self):
        self.client.force_authenticate(self.student)

        response = self.client.get("/api/course-nodes/file-link/", {"node_id": str(self.node.id)})

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["url"].startswith(f"/api/course-nodes/file/?node_id={self.node.id}&token="))
        self.assertEqual(data["expires_in"], 900)

    def test_outsider_cannot_get_file_link(self):
        self.client.force_authenticate(self.outsider)

        response = self.client.get("/api/course-nodes/file-link/", {"node_id": str(self.node.id)})

        self.assertEqual(response.status_code, 403)
