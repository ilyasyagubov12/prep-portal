from django.db import models
import uuid
from django.conf import settings
from courses.models import Course


class CourseEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    repeat_weekly = models.BooleanField(default=False)
    repeat_until = models.DateField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_events"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["starts_at"]

    def __str__(self):
        return f"{self.title} ({self.course.slug})"
