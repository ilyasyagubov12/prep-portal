from django.db import models
from django.conf import settings


class DailyStreakProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="streak_days")
    date = models.DateField()
    math_count = models.PositiveIntegerField(default=0)
    verbal_count = models.PositiveIntegerField(default=0)
    completed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        unique_together = ("user", "date")
        indexes = [
            models.Index(fields=["user", "date"]),
        ]


class QuestionAttempt(models.Model):
    SUBJECT_CHOICES = [
        ("verbal", "Verbal"),
        ("math", "Math"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="question_attempts")
    question = models.ForeignKey("question_bank.Question", on_delete=models.CASCADE, related_name="attempts")
    subject = models.CharField(max_length=20, choices=SUBJECT_CHOICES)
    attempted_date = models.DateField()
    selected_label = models.CharField(max_length=5, blank=True, null=True)
    is_correct = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "question", "attempted_date")
        indexes = [
            models.Index(fields=["user", "attempted_date"]),
            models.Index(fields=["subject", "attempted_date"]),
        ]

# Create your models here.
