from django.db import models
import uuid
from django.conf import settings
from courses.models import Course, CourseNode


class Assignment(models.Model):
    STATUS_CHOICES = [
        ("draft", "draft"),
        ("published", "published"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=255)
    body = models.JSONField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    published_at = models.DateTimeField(blank=True, null=True)
    due_at = models.DateTimeField(blank=True, null=True)
    max_score = models.FloatField(blank=True, null=True)
    max_submissions = models.IntegerField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_assignments"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class AssignmentFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="files")
    name = models.CharField(max_length=255)
    storage_path = models.TextField()
    mime_type = models.CharField(max_length=150, blank=True, null=True)
    size_bytes = models.BigIntegerField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="assignment_files"
    )
    created_at = models.DateTimeField(auto_now_add=True)


class Submission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="submissions")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="submissions")
    file_path = models.TextField()
    file_name = models.CharField(max_length=255, blank=True, null=True)
    file_size = models.BigIntegerField(blank=True, null=True)
    mime_type = models.CharField(max_length=150, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Grade(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    submission = models.OneToOneField(Submission, on_delete=models.CASCADE, related_name="grade")
    grader = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="grades")
    score = models.FloatField(blank=True, null=True)
    feedback = models.TextField(blank=True, null=True)
    graded_at = models.DateTimeField(auto_now_add=True)


class OfflineUnit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="offline_units")
    title = models.CharField(max_length=255)
    max_score = models.FloatField(blank=True, null=True)
    publish_at = models.DateTimeField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="offline_units_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):  # pragma: no cover
        return self.title


class OfflineGrade(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit = models.ForeignKey(OfflineUnit, on_delete=models.CASCADE, related_name="grades")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="offline_grades")
    score = models.FloatField(blank=True, null=True)
    feedback = models.TextField(blank=True, null=True)
    graded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("unit", "student")
