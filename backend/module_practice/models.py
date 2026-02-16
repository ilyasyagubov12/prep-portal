from django.db import models
from django.conf import settings
import uuid


class ModulePractice(models.Model):
    EXAM_TYPE_CHOICES = [
        ("sat", "SAT"),
        ("act", "ACT"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam_type = models.CharField(max_length=10, choices=EXAM_TYPE_CHOICES, default="sat")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    results_published = models.BooleanField(default=False)
    shuffle_questions = models.BooleanField(default=True)
    shuffle_choices = models.BooleanField(default=False)
    allow_retakes = models.BooleanField(default=True)
    retake_limit = models.IntegerField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="module_practices_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class ModulePracticeModule(models.Model):
    SUBJECT_CHOICES = [
        ("verbal", "Verbal"),
        ("math", "Math"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    practice = models.ForeignKey(ModulePractice, on_delete=models.CASCADE, related_name="modules")
    subject = models.CharField(max_length=20, choices=SUBJECT_CHOICES)
    module_index = models.IntegerField()  # 1 or 2
    question_ids = models.JSONField(default=list)
    question_count = models.IntegerField(default=0)
    required_count = models.IntegerField(default=0)
    time_limit_minutes = models.IntegerField(default=30)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("practice", "subject", "module_index")
        indexes = [
            models.Index(fields=["practice", "subject", "module_index"]),
        ]

    def __str__(self):
        return f"{self.practice_id} {self.subject} M{self.module_index}"


class ModulePracticeQuestion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    practice = models.ForeignKey(ModulePractice, on_delete=models.CASCADE, related_name="questions")
    module = models.ForeignKey(ModulePracticeModule, on_delete=models.CASCADE, related_name="questions")
    subject = models.CharField(max_length=20, choices=ModulePracticeModule.SUBJECT_CHOICES)
    module_index = models.IntegerField()
    topic_tag = models.CharField(max_length=200)
    question_text = models.TextField()
    passage = models.TextField(blank=True, null=True)
    choices = models.JSONField(default=list)
    is_open_ended = models.BooleanField(default=False)
    correct_answer = models.TextField(blank=True, null=True)
    explanation = models.TextField(blank=True, null=True)
    difficulty = models.CharField(max_length=10, blank=True, null=True)
    image_url = models.URLField(blank=True, null=True, max_length=500)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["practice", "subject", "module_index", "order"]),
            models.Index(fields=["module", "order"]),
        ]

    def __str__(self):
        return f"{self.practice_id} {self.subject} M{self.module_index} Q{self.order}"


class ModulePracticeAccess(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    practice = models.ForeignKey(ModulePractice, on_delete=models.CASCADE, related_name="access_list")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="module_practice_access")
    attempt_limit = models.IntegerField(null=True, blank=True)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="module_practice_grants",
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("practice", "student")
        indexes = [
            models.Index(fields=["practice", "student"]),
        ]


class ModulePracticeAttempt(models.Model):
    STATUS_CHOICES = [
        ("in_progress", "In progress"),
        ("submitted", "Submitted"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    practice = models.ForeignKey(ModulePractice, on_delete=models.CASCADE, related_name="attempts")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="module_practice_attempts")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="in_progress")
    answers = models.JSONField(default=dict)
    question_order = models.JSONField(default=dict)
    choice_order = models.JSONField(default=dict)
    module_scores = models.JSONField(default=dict)
    score = models.FloatField(default=0)
    correct = models.IntegerField(default=0)
    total = models.IntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["practice", "student", "status"]),
            models.Index(fields=["student", "started_at"]),
        ]
