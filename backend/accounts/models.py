from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
import uuid


class User(AbstractUser):
    """Custom user using email as the login field and UUID primary key."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150, unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]


class Profile(models.Model):
    ROLE_CHOICES = [
        ("student", "Student"),
        ("teacher", "Teacher"),
        ("admin", "Admin"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    nickname = models.CharField(max_length=120, blank=True, null=True)
    student_id = models.CharField(max_length=64, blank=True, null=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="student")
    is_admin = models.BooleanField(default=False)
    avatar = models.URLField(blank=True, null=True)
    university_icon = models.URLField(blank=True, null=True)
    goal_math = models.IntegerField(default=600)
    goal_verbal = models.IntegerField(default=600)
    math_level = models.CharField(max_length=60, blank=True, null=True)
    verbal_level = models.CharField(max_length=60, blank=True, null=True)
    phone_number = models.CharField(max_length=40, blank=True, null=True)
    parent_name = models.CharField(max_length=120, blank=True, null=True)
    parent_phone = models.CharField(max_length=40, blank=True, null=True)
    streak_offset = models.IntegerField(default=0)
    selected_exam_date = models.ForeignKey(
        "exam_dates.ExamDate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="selected_by",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.user.email} ({self.role})"


@receiver(post_save, sender=User)
def create_profile_for_user(sender, instance: User, created: bool, **kwargs):
    """Auto-create a Profile whenever a User is created."""
    if created:
        Profile.objects.create(
            user=instance,
            role="admin" if instance.is_superuser else "student",
            is_admin=instance.is_superuser,
        )
