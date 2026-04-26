from decimal import Decimal

from django.conf import settings
from django.db import models

from courses.models import Course


class StudentAttendanceReport(models.Model):
    ATTENDANCE_CHOICES = [
        ("present", "Present"),
        ("absent", "Absent"),
        ("late", "Late"),
        ("excused", "Excused"),
    ]

    BEHAVIOR_CHOICES = [
        ("good", "Good"),
        ("warning", "Warning"),
        ("poor", "Poor"),
    ]

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="attendance_reports")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attendance_reports"
    )
    report_date = models.DateField()
    attendance = models.CharField(max_length=20, choices=ATTENDANCE_CHOICES, default="present")
    behavior = models.CharField(max_length=20, choices=BEHAVIOR_CHOICES, default="good")
    notes = models.TextField(blank=True, null=True)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reported_attendance_items",
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("course", "student", "report_date")
        ordering = ["-report_date", "student__username"]


class StudentPaymentStatus(models.Model):
    PAYMENT_CHOICES = [
        ("paid", "Paid"),
        ("partial", "Partial"),
        ("unpaid", "Unpaid"),
    ]

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="payment_statuses")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payment_statuses"
    )
    payment_status = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default="unpaid")
    amount_due = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True, null=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_payment_statuses",
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("course", "student")
        ordering = ["student__username"]
