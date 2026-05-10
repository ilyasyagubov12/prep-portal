from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from courses.models import Course, Enrollment
from streaks.models import QuestionAttempt
from .models import Question, SubtopicProgress


User = get_user_model()


class LegacyQuestionBankNormalizationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="student@example.com",
            username="student",
            password="password123",
        )
        self.client.force_authenticate(self.user)

    def test_progress_endpoint_normalizes_legacy_subtopic_labels(self):
        SubtopicProgress.objects.create(
            user=self.user,
            subject="math",
            topic="Algebra",
            subtopic="Linear equations in one variable",
            best_score=1,
            passed=True,
        )

        response = self.client.get("/api/questions/progress/", {"subject": "math"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["subtopics"],
            [
                {
                    "subject": "math",
                    "topic": "Algebra",
                    "subtopic": "Linear Equations",
                    "passed": True,
                    "best_score": 1,
                }
            ],
        )

    def test_quiz_endpoints_accept_legacy_topic_aliases_and_store_canonical_progress(self):
        profile = self.user.profile
        profile.math_level = "20"
        profile.save(update_fields=["math_level"])

        question = Question.objects.create(
            subject="math",
            topic="Advanced math",
            subtopic="Quadratics",
            stem="What is 2 + 2?",
            choices=[
                {"label": "A", "content": "3", "is_correct": False},
                {"label": "B", "content": "4", "is_correct": True},
                {"label": "C", "content": "5", "is_correct": False},
                {"label": "D", "content": "6", "is_correct": False},
            ],
            published=True,
            created_by=self.user,
        )

        load_response = self.client.get(
            "/api/questions/quiz/",
            {"subject": "math", "topic": "Advanced Math", "subtopic": "Quadratics"},
        )

        self.assertEqual(load_response.status_code, 200)
        self.assertEqual(load_response.json()["questions"][0]["id"], str(question.id))

        submit_response = self.client.post(
            "/api/questions/quiz/submit/",
            {
                "subject": "math",
                "topic": "Advanced Math",
                "subtopic": "Quadratics",
                "answers": [{"question_id": str(question.id), "answer": "B"}],
            },
            format="json",
        )

        self.assertEqual(submit_response.status_code, 200)
        self.assertTrue(submit_response.json()["passed"])
        self.assertTrue(
            SubtopicProgress.objects.filter(
                user=self.user,
                subject="math",
                topic="Advanced Math",
                subtopic="Quadratics",
                passed=True,
            ).exists()
        )

    def test_admin_seeded_level_advances_after_next_subtopic_pass(self):
        profile = self.user.profile
        profile.math_level = "14"
        profile.save(update_fields=["math_level"])

        current_question = Question.objects.create(
            subject="math",
            topic="Problem Solving",
            subtopic="Scatterplots",
            stem="What is 2 + 2?",
            choices=[
                {"label": "A", "content": "3", "is_correct": False},
                {"label": "B", "content": "4", "is_correct": True},
                {"label": "C", "content": "5", "is_correct": False},
                {"label": "D", "content": "6", "is_correct": False},
            ],
            published=True,
            created_by=self.user,
        )
        next_question = Question.objects.create(
            subject="math",
            topic="Problem Solving",
            subtopic="Research Organizing (Margin of Error; Outliers)",
            stem="What is 3 + 3?",
            choices=[
                {"label": "A", "content": "6", "is_correct": True},
                {"label": "B", "content": "5", "is_correct": False},
                {"label": "C", "content": "4", "is_correct": False},
                {"label": "D", "content": "7", "is_correct": False},
            ],
            published=True,
            created_by=self.user,
        )

        load_current = self.client.get(
            "/api/questions/quiz/",
            {"subject": "math", "topic": "Problem Solving", "subtopic": "Scatterplots"},
        )
        self.assertEqual(load_current.status_code, 200)
        self.assertEqual(load_current.json()["questions"][0]["id"], str(current_question.id))

        submit_current = self.client.post(
            "/api/questions/quiz/submit/",
            {
                "subject": "math",
                "topic": "Problem Solving",
                "subtopic": "Scatterplots",
                "answers": [{"question_id": str(current_question.id), "answer": "B"}],
            },
            format="json",
        )
        self.assertEqual(submit_current.status_code, 200)
        self.assertTrue(submit_current.json()["passed"])

        profile.refresh_from_db()
        self.assertEqual(profile.math_level, "15")

        load_next = self.client.get(
            "/api/questions/quiz/",
            {
                "subject": "math",
                "topic": "Problem Solving",
                "subtopic": "Research Organizing (Margin of Error; Outliers)",
            },
        )
        self.assertEqual(load_next.status_code, 200)
        self.assertEqual(load_next.json()["questions"][0]["id"], str(next_question.id))


class QuestionSetProgressTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="student@example.com",
            username="student",
            password="password123",
        )
        self.classmate_a = User.objects.create_user(
            email="classmate-a@example.com",
            username="classmatea",
            password="password123",
        )
        self.classmate_a.profile.nickname = "Aylin"
        self.classmate_a.profile.save(update_fields=["nickname"])
        self.classmate_b = User.objects.create_user(
            email="classmate-b@example.com",
            username="classmateb",
            password="password123",
        )
        self.classmate_b.profile.nickname = "Murad"
        self.classmate_b.profile.save(update_fields=["nickname"])
        self.other_student = User.objects.create_user(
            email="outsider@example.com",
            username="outsider",
            password="password123",
        )
        self.course = Course.objects.create(slug="sat-math-a", title="SAT Math A")
        Enrollment.objects.create(course=self.course, user=self.user)
        Enrollment.objects.create(course=self.course, user=self.classmate_a)
        Enrollment.objects.create(course=self.course, user=self.classmate_b)

        self.questions = [
            Question.objects.create(
                subject="math",
                topic="Algebra",
                subtopic="Linear Equations",
                stem=f"Question {idx}",
                choices=[
                    {"label": "A", "content": "1", "is_correct": False},
                    {"label": "B", "content": "2", "is_correct": True},
                ],
                published=True,
                created_by=self.user,
            )
            for idx in range(1, 5)
        ]

        QuestionAttempt.objects.create(
            user=self.user,
            question=self.questions[0],
            subject="math",
            attempted_date="2026-05-10",
            is_correct=True,
        )
        QuestionAttempt.objects.create(
            user=self.user,
            question=self.questions[1],
            subject="math",
            attempted_date="2026-05-10",
            is_correct=False,
        )
        QuestionAttempt.objects.create(
            user=self.classmate_a,
            question=self.questions[0],
            subject="math",
            attempted_date="2026-05-10",
            is_correct=True,
        )
        QuestionAttempt.objects.create(
            user=self.classmate_a,
            question=self.questions[1],
            subject="math",
            attempted_date="2026-05-10",
            is_correct=True,
        )
        QuestionAttempt.objects.create(
            user=self.classmate_a,
            question=self.questions[2],
            subject="math",
            attempted_date="2026-05-10",
            is_correct=True,
        )
        QuestionAttempt.objects.create(
            user=self.other_student,
            question=self.questions[3],
            subject="math",
            attempted_date="2026-05-10",
            is_correct=True,
        )
        self.client.force_authenticate(self.user)

    def test_set_progress_returns_my_completion_and_classmate_breakdown(self):
        response = self.client.post(
            "/api/questions/set-progress/",
            {
                "question_ids": [str(question.id) for question in self.questions],
                "course_id": str(self.course.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_questions"], 4)
        self.assertEqual(data["my_completed_questions"], 2)
        self.assertEqual(data["my_completion_percent"], 50.0)
        self.assertEqual(data["course"]["classmates_total_count"], 2)
        self.assertEqual(data["course"]["classmates_started_count"], 1)
        self.assertEqual(data["course"]["classmates_average_completed_questions"], 1.5)
        self.assertEqual(data["course"]["classmates_average_percent"], 37.5)
        self.assertEqual(
            data["course"]["classmates"],
            [
                {
                    "user_id": str(self.classmate_a.id),
                    "display_name": "Aylin",
                    "completed_questions": 3,
                    "completion_percent": 75.0,
                    "has_started": True,
                },
                {
                    "user_id": str(self.classmate_b.id),
                    "display_name": "Murad",
                    "completed_questions": 0,
                    "completion_percent": 0.0,
                    "has_started": False,
                },
            ],
        )

    def test_set_progress_rejects_courses_user_is_not_enrolled_in(self):
        other_course = Course.objects.create(slug="sat-verbal-a", title="SAT Verbal A")
        Enrollment.objects.create(course=other_course, user=self.other_student)

        response = self.client.post(
            "/api/questions/set-progress/",
            {
                "question_ids": [str(question.id) for question in self.questions],
                "course_id": str(other_course.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
