from datetime import date

from django.db.models import Count, Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.views import _require_admin
from courses.models import Course, Enrollment

from .models import StudentAttendanceReport, StudentPaymentPlan, StudentPaymentRecord

COUNTED_ATTENDANCE_STATUSES = ("present", "late", "excused")


def _is_staff(user) -> bool:
    prof = getattr(user, "profile", None)
    role = (getattr(prof, "role", None) or "").lower()
    return user.is_superuser or getattr(prof, "is_admin", False) or role in ("admin", "teacher")


def _is_admin(user) -> bool:
    return _require_admin(user)


def _staff_courses(user):
    if _is_admin(user):
        return Course.objects.all().order_by("title")
    return Course.objects.filter(teachers__teacher=user).distinct().order_by("title")


def _course_allowed(user, course_id: str) -> Course | None:
    try:
        return _staff_courses(user).get(id=course_id)
    except Course.DoesNotExist:
        return None


def _student_haystack(user, profile, tag: str) -> str:
    return " ".join(
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


def _attendance_count_map(course):
    return {
        str(item["student_id"]): item["count"]
        for item in (
            StudentAttendanceReport.objects.filter(course=course, attendance__in=COUNTED_ATTENDANCE_STATUSES)
            .values("student_id")
            .annotate(count=Count("id"))
        )
    }


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

        courses = list(_staff_courses(request.user).values("id", "slug", "title", "description"))
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
            tag_set = set()

            for enrollment in enrollments:
                user = enrollment.user
                profile = getattr(user, "profile", None)
                tag = (getattr(profile, "tag", None) or "").strip()
                if tag:
                    tag_set.add(tag)

                if query and query not in _student_haystack(user, profile, tag):
                    continue

                attendance = attendance_map.get(str(user.id))
                attendance_status = attendance.attendance if attendance else "present"
                summary[attendance_status] += 1

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
                            "notes": attendance.notes if attendance else "",
                        },
                    }
                )

            available_tags = sorted(tag_set)

        return Response(
            {
                "ok": True,
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

        enrolled_ids = set(str(v) for v in Enrollment.objects.filter(course=course).values_list("user_id", flat=True))
        for item in updates:
            student_id = str(item.get("user_id") or "").strip()
            if not student_id or student_id not in enrolled_ids:
                continue
            status_value = (item.get("status") or "present").strip().lower()
            notes = (item.get("notes") or "").strip() or None
            record, _ = StudentAttendanceReport.objects.get_or_create(
                course=course,
                student_id=student_id,
                report_date=report_date,
            )
            record.attendance = status_value
            record.notes = notes
            record.reported_by = request.user
            record.save()

        return Response({"ok": True})


class PaymentsOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        course_id = (request.query_params.get("course_id") or "").strip()
        query = (request.query_params.get("q") or "").strip().lower()

        courses = list(_staff_courses(request.user).values("id", "slug", "title", "description"))
        selected_course = None
        if course_id:
            selected_course = _course_allowed(request.user, course_id)
            if not selected_course:
                return Response({"error": "Course not found"}, status=404)
        elif courses:
            selected_course = _course_allowed(request.user, str(courses[0]["id"]))

        students = []
        payment_slot_count = 3
        if selected_course:
            enrollments = (
                Enrollment.objects.filter(course=selected_course)
                .select_related("user__profile")
                .order_by("user__first_name", "user__last_name", "user__username")
            )
            attendance_counts = _attendance_count_map(selected_course)
            plans = {
                str(item.student_id): item
                for item in StudentPaymentPlan.objects.filter(course=selected_course).prefetch_related("records")
            }
            for plan in plans.values():
                payment_slot_count = max(payment_slot_count, plan.records.count())

            for enrollment in enrollments:
                user = enrollment.user
                profile = getattr(user, "profile", None)
                tag = (getattr(profile, "tag", None) or "").strip()
                if query and query not in _student_haystack(user, profile, tag):
                    continue

                plan = plans.get(str(user.id))
                cycle = plan.classes_per_payment if plan and plan.classes_per_payment else None
                attended_classes = int(attendance_counts.get(str(user.id), 0))
                records_by_number = {}
                paid_count = 0
                if plan:
                    for record in plan.records.all():
                        records_by_number[record.payment_number] = record
                        if record.is_paid:
                            paid_count += 1
                classes_remaining = None
                if cycle:
                    next_due_threshold = cycle * (paid_count + 1)
                    classes_remaining = next_due_threshold - attended_classes

                payments = []
                for payment_number in range(1, payment_slot_count + 1):
                    record = records_by_number.get(payment_number)
                    payments.append(
                        {
                            "payment_number": payment_number,
                            "is_paid": bool(record.is_paid) if record else False,
                            "paid_date": record.paid_date.isoformat() if record and record.paid_date else "",
                        }
                    )

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
                        "classes_per_payment": cycle,
                        "attended_classes": attended_classes,
                        "classes_remaining": classes_remaining,
                        "payments": payments,
                    }
                )

        return Response(
            {
                "ok": True,
                "courses": courses,
                "selected_course_id": str(selected_course.id) if selected_course else None,
                "students": students,
                "payment_slot_count": payment_slot_count,
            }
        )


class PaymentsSaveView(APIView):
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

        enrolled_ids = set(str(v) for v in Enrollment.objects.filter(course=course).values_list("user_id", flat=True))
        for item in updates:
            student_id = str(item.get("user_id") or "").strip()
            if not student_id or student_id not in enrolled_ids:
                continue
            raw_cycle = item.get("classes_per_payment")
            classes_per_payment = None
            if raw_cycle not in (None, ""):
                try:
                    classes_per_payment = int(raw_cycle)
                except (TypeError, ValueError):
                    return Response({"error": f"Invalid payment cycle for {student_id}"}, status=400)
                if classes_per_payment <= 0:
                    return Response({"error": f"Payment cycle must be positive for {student_id}"}, status=400)

            plan, _ = StudentPaymentPlan.objects.get_or_create(course=course, student_id=student_id)
            plan.classes_per_payment = classes_per_payment
            plan.updated_by = request.user
            plan.save()

            payments = item.get("payments") or []
            if not isinstance(payments, list):
                return Response({"error": f"payments must be a list for {student_id}"}, status=400)
            for payment in payments:
                try:
                    payment_number = int(payment.get("payment_number") or 0)
                except (TypeError, ValueError):
                    return Response({"error": f"Invalid payment number for {student_id}"}, status=400)
                if payment_number <= 0:
                    continue
                paid_date_raw = (payment.get("paid_date") or "").strip()
                paid_date = None
                if paid_date_raw:
                    try:
                        paid_date = date.fromisoformat(paid_date_raw)
                    except ValueError:
                        return Response({"error": f"Invalid paid_date for {student_id}"}, status=400)
                record, _ = StudentPaymentRecord.objects.get_or_create(
                    plan=plan,
                    payment_number=payment_number,
                )
                record.is_paid = bool(payment.get("is_paid"))
                record.paid_date = paid_date
                record.updated_by = request.user
                record.save()

        return Response({"ok": True})
