from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class ExamDate(models.Model):
    date = models.DateField(unique=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="exam_dates")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:  # pragma: no cover
        return self.date.isoformat()

# Create your models here.
