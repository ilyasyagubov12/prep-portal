from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

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
