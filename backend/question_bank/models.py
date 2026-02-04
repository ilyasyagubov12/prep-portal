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
