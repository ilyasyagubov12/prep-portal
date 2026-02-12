from django.db import models
from django.conf import settings
import uuid


class Question(models.Model):
    SUBJECT_CHOICES = [
        ("verbal", "Verbal"),
        ("math", "Math"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subject = models.CharField(max_length=20, choices=SUBJECT_CHOICES)
    topic = models.CharField(max_length=200)
    subtopic = models.CharField(max_length=200, blank=True, null=True)
    stem = models.TextField()
    passage = models.TextField(blank=True, null=True)
    explanation = models.TextField(blank=True, null=True)
    image_url = models.URLField(blank=True, null=True)
    choices = models.JSONField(default=list)  # list of {label, content, is_correct}
    is_open_ended = models.BooleanField(default=False)
    correct_answer = models.TextField(blank=True, null=True)
    difficulty = models.CharField(max_length=10, blank=True, null=True)
    published = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="questions")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["subject", "topic"]),
        ]

    def __str__(self):
        return f"{self.subject} | {self.topic}: {self.stem[:50]}"


class SubtopicProgress(models.Model):
    SUBJECT_CHOICES = Question.SUBJECT_CHOICES

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subtopic_progress")
    subject = models.CharField(max_length=20, choices=SUBJECT_CHOICES)
    topic = models.CharField(max_length=200)
    subtopic = models.CharField(max_length=200)
    best_score = models.FloatField(default=0)
    passed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "subject", "topic", "subtopic")
        indexes = [
            models.Index(fields=["user", "subject"]),
            models.Index(fields=["subject", "topic"]),
        ]

    def __str__(self):
        return f"{self.user_id} {self.subject} {self.topic} - {self.subtopic}"


class TopicProgress(models.Model):
    SUBJECT_CHOICES = Question.SUBJECT_CHOICES

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="topic_progress")
    subject = models.CharField(max_length=20, choices=SUBJECT_CHOICES)
    topic = models.CharField(max_length=200)
    best_score = models.FloatField(default=0)
    passed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "subject", "topic")
        indexes = [
            models.Index(fields=["user", "subject"]),
            models.Index(fields=["subject", "topic"]),
        ]

    def __str__(self):
        return f"{self.user_id} {self.subject} {self.topic}"
