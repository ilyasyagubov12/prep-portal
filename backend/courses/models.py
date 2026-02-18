from django.db import models
import uuid
from django.conf import settings


class Course(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    cover_path = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:  # pragma: no cover
        return self.title


class CourseTeacher(models.Model):
    id = models.BigAutoField(primary_key=True)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="teachers")
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="teaching_courses")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("course", "teacher")


class Enrollment(models.Model):
    id = models.BigAutoField(primary_key=True)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="enrollments")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="enrollments")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("course", "user")


class CourseNode(models.Model):
    KIND_CHOICES = [
        ("folder", "folder"),
        ("file", "file"),
        ("assignment", "assignment"),
        ("quiz", "quiz"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="nodes")
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, related_name="children", null=True, blank=True
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    storage_path = models.TextField(blank=True, null=True)
    mime_type = models.CharField(max_length=120, blank=True, null=True)
    size_bytes = models.BigIntegerField(blank=True, null=True)
    published = models.BooleanField(default=True)
    publish_at = models.DateTimeField(blank=True, null=True)
    assignment_id = models.UUIDField(blank=True, null=True)
    quiz_id = models.UUIDField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_course_nodes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.kind}:{self.name}"

# Create your models here.
