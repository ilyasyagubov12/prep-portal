from decimal import Decimal, InvalidOperation
from datetime import date

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.views import _require_admin
from courses.models import Course, CourseTeacher, Enrollment

from .models import StudentAttendanceReport, StudentPaymentStatus

User = get_user_model()


def _is_staff(user) -> bool:
    prof = getattr(user, "profile", None)
    role = (getattr(prof, "role", None) or "").lower()
    return user.is_superuser or getattr(prof, "is_admin", False) or role in ("admin", "teacher")


def _is_admin(user) -> bool:
    return _require_admin(user)


def _staff_courses(user):
    if _require_admin(user):
        return Course.objects.all().order_by("title")
    return Course.objects.filter(teachers__teacher=user).distinct().order_by("title")


def _course_allowed(user, course_id: str) -> Course | None:
    try:
        return _staff_courses(user).get(id=course_id)
    except Course.DoesNotExist:
        return None


class ReportingOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        course_id = (request.query_params.get("course_id") or "").strip()
        raw_date = (request.query_params.get("report_date") or "").strip()
        query = (request.query_params.get("q") or "").strip().lower()

        try:
            report_date = date.fromisoformat(raw_date) if raw_date else date.today()
        except ValueError:
            return Response({"error": "Invalid report_date"}, status=400)

        courses = list(
            _staff_courses(request.user).values("id", "slug", "title", "description")
        )
        selected_course = None
        if course_id:
            selected_course = _course_allowed(request.user, course_id)
            if not selected_course:
                return Response({"error": "Course not found"}, status=404)
        elif courses:
            selected_course = _course_allowed(request.user, str(courses[0]["id"]))

        students = []
        summary = {
            "present": 0,
            "absent": 0,
            "late": 0,
            "excused": 0,
            "good": 0,
            "warning": 0,
            "poor": 0,
            "unpaid_count": 0,
            "partial_count": 0,
            "paid_count": 0,
            "total_due": "0.00",
        }
        available_tags: list[str] = []

        if selected_course:
            enrollments = (
                Enrollment.objects.filter(course=selected_course)
                .select_related("user__profile")
                .order_by("user__first_name", "user__last_name", "user__username")
            )
            attendance_map = {
                str(item.student_id): item
                for item in StudentAttendanceReport.objects.filter(
                    course=selected_course, report_date=report_date
                ).select_related("student")
            }
            payment_map = {
                str(item.student_id): item
                for item in StudentPaymentStatus.objects.filter(course=selected_course).select_related("student")
            }
            tag_set = set()
            due_total = Decimal("0.00")

            for enrollment in enrollments:
                user = enrollment.user
                profile = getattr(user, "profile", None)
                tag = (getattr(profile, "tag", None) or "").strip()
                if tag:
                    tag_set.add(tag)
                haystack = " ".join(
                    [
                        user.username or "",
                        user.first_name or "",
                        user.last_name or "",
                        getattr(profile, "nickname", "") or "",
                        getattr(profile, "student_id", "") or "",
                        getattr(profile, "parent_name", "") or "",
                        getattr(profile, "parent_phone", "") or "",
                        tag,
                    ]
                ).lower()
                if query and query not in haystack:
                    continue
                attendance = attendance_map.get(str(user.id))
                payment = payment_map.get(str(user.id))
                attendance_status = attendance.attendance if attendance else "present"
                behavior_status = attendance.behavior if attendance else "good"
                payment_status = payment.payment_status if payment else "unpaid"
                amount_due = payment.amount_due if payment else Decimal("0.00")

                summary[attendance_status] += 1
                summary[behavior_status] += 1
                if payment_status == "paid":
                    summary["paid_count"] += 1
                elif payment_status == "partial":
                    summary["partial_count"] += 1
                else:
                    summary["unpaid_count"] += 1
                due_total += amount_due

                students.append(
                    {
                        "user_id": str(user.id),
                        "username": user.username,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                        "nickname": getattr(profile, "nickname", None),
                        "student_id": getattr(profile, "student_id", None),
                        "tag": tag or None,
                        "parent_name": getattr(profile, "parent_name", None),
                        "parent_phone": getattr(profile, "parent_phone", None),
                        "attendance": {
                            "status": attendance_status,
                            "behavior": behavior_status,
                            "notes": attendance.notes if attendance else "",
                        },
                        "payment": (
                            {
                                "status": payment_status,
                                "amount_due": f"{amount_due:.2f}",
                                "notes": payment.notes if payment else "",
                            }
                            if _is_admin(request.user)
                            else None
                        ),
                    }
                )

            summary["total_due"] = f"{due_total:.2f}"
            available_tags = sorted(tag_set)

        return Response(
            {
                "ok": True,
                "can_manage_payments": _is_admin(request.user),
                "report_date": report_date.isoformat(),
                "courses": courses,
                "selected_course_id": str(selected_course.id) if selected_course else None,
                "students": students,
                "summary": summary,
                "available_tags": available_tags,
            }
        )


class ReportingAttendanceSaveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_staff(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        course_id = (request.data.get("course_id") or "").strip()
        raw_date = (request.data.get("report_date") or "").strip()
        updates = request.data.get("updates") or []
        if not course_id or not raw_date:
            return Response({"error": "course_id and report_date are required"}, status=400)
        if not isinstance(updates, list):
            return Response({"error": "updates must be a list"}, status=400)

        course = _course_allowed(request.user, course_id)
        if not course:
            return Response({"error": "Course not found"}, status=404)
        try:
            report_date = date.fromisoformat(raw_date)
        except ValueError:
            return Response({"error": "Invalid report_date"}, status=400)

        enrolled_ids = set(
            Enrollment.objects.filter(course=course).values_list("user_id", flat=True)
        )
        for item in updates:
            student_id = str(item.get("user_id") or "").strip()
            if not student_id or student_id not in {str(v) for v in enrolled_ids}:
                continue
            status_value = (item.get("status") or "present").strip().lower()
            behavior_value = (item.get("behavior") or "good").strip().lower()
            notes = (item.get("notes") or "").strip() or None
            record, _ = StudentAttendanceReport.objects.get_or_create(
                course=course,
                student_id=student_id,
                report_date=report_date,
            )
            record.attendance = status_value
            record.behavior = behavior_value
            record.notes = notes
            record.reported_by = request.user
            record.save()

        return Response({"ok": True})


class ReportingPaymentSaveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        course_id = (request.data.get("course_id") or "").strip()
        updates = request.data.get("updates") or []
        if not course_id:
            return Response({"error": "course_id is required"}, status=400)
        if not isinstance(updates, list):
            return Response({"error": "updates must be a list"}, status=400)

        course = _course_allowed(request.user, course_id)
        if not course:
            return Response({"error": "Course not found"}, status=404)

        enrolled_ids = set(
            str(v) for v in Enrollment.objects.filter(course=course).values_list("user_id", flat=True)
        )
        for item in updates:
            student_id = str(item.get("user_id") or "").strip()
            if not student_id or student_id not in enrolled_ids:
                continue
            payment_status = (item.get("status") or "unpaid").strip().lower()
            notes = (item.get("notes") or "").strip() or None
            raw_amount = str(item.get("amount_due") or "0").strip() or "0"
            try:
                amount_due = Decimal(raw_amount)
            except InvalidOperation:
                return Response({"error": f"Invalid amount for {student_id}"}, status=400)
            if amount_due < 0:
                amount_due = Decimal("0.00")
            record, _ = StudentPaymentStatus.objects.get_or_create(course=course, student_id=student_id)
            record.payment_status = payment_status
            record.amount_due = amount_due
            record.notes = notes
            record.updated_by = request.user
            record.save()

        return Response({"ok": True})
