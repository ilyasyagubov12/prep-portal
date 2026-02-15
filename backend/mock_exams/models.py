from django.db import models
from django.conf import settings
import uuid


class MockExam(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    verbal_question_count = models.IntegerField(default=0)
    math_question_count = models.IntegerField(default=0)
    total_time_minutes = models.IntegerField(default=120)
    shuffle_questions = models.BooleanField(default=True)
    shuffle_choices = models.BooleanField(default=False)
    allow_retakes = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    results_published = models.BooleanField(default=False)
    question_ids = models.JSONField(default=list)
    allowed_students = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="mock_exams_allowed",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mock_exams_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class MockExamAttempt(models.Model):
    STATUS_CHOICES = [
        ("in_progress", "In progress"),
        ("submitted", "Submitted"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mock_exam = models.ForeignKey(MockExam, on_delete=models.CASCADE, related_name="attempts")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mock_exam_attempts")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="in_progress")
    answers = models.JSONField(default=dict)
    question_order = models.JSONField(default=list)
    choice_order = models.JSONField(default=dict)
    score_verbal = models.IntegerField(default=0)
    score_math = models.IntegerField(default=0)
    total_score = models.IntegerField(default=0)
    analytics = models.JSONField(default=dict)
    time_spent = models.IntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["mock_exam", "student", "status"]),
            models.Index(fields=["student", "started_at"]),
        ]
