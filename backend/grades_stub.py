from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from courses.models import Course, CourseTeacher, Enrollment
from assignments.models import Assignment, Submission, Grade, OfflineUnit, OfflineGrade
from mock_exams.models import MockExam, MockExamAttempt


def _is_teacher_or_admin(user, course):
    return CourseTeacher.objects.filter(course=course, teacher=user).exists() or user.is_superuser or getattr(
        getattr(user, "profile", None), "is_admin", False
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def grades_me(request):
    course_id = request.query_params.get("course_id")
    if not course_id:
        return Response({"error": "course_id required"}, status=400)
    try:
        course = Course.objects.get(id=course_id)
    except Course.DoesNotExist:
        return Response({"error": "Course not found"}, status=404)

    user = request.user
    is_teacher = CourseTeacher.objects.filter(course=course, teacher=user).exists()
    is_student = Enrollment.objects.filter(course=course, user=user).exists()
    is_admin = _is_teacher_or_admin(user, course)
    if not (is_teacher or is_student or is_admin):
        return Response({"error": "Forbidden"}, status=403)

    assignments = Assignment.objects.filter(course=course).order_by("-created_at")
    result = []

    for a in assignments:
        row = {
            "id": str(a.id),
            "title": a.title,
            "status": a.status,
            "due_at": a.due_at.isoformat() if a.due_at else None,
            "max_score": a.max_score,
        }

        latest_sub = None
        grade = None
        if is_student and not is_teacher and not is_admin:
            latest_sub = (
                Submission.objects.filter(assignment=a, student=user)
                .order_by("-created_at")
                .first()
            )
        if latest_sub:
            row["submission"] = {
                "id": str(latest_sub.id),
                "created_at": latest_sub.created_at.isoformat(),
                "file_name": latest_sub.file_name,
            }
            g = Grade.objects.filter(submission=latest_sub).first()
            if g:
                grade = {
                    "id": str(g.id),
                    "score": g.score,
                    "feedback": g.feedback,
                    "graded_at": g.graded_at.isoformat(),
                }
                row["submission"]["grade"] = grade
        result.append(row)

    # Course quizzes (mock exams)
    quizzes = MockExam.objects.filter(course=course).order_by("-created_at")
    for exam in quizzes:
        total_questions = (exam.verbal_question_count or 0) + (exam.math_question_count or 0)
        if total_questions <= 0:
            total_questions = len(exam.question_ids or [])

        row = {
            "id": str(exam.id),
            "title": exam.title,
            "status": "quiz" if exam.is_active else "disabled",
            "due_at": None,
            "max_score": total_questions,
            "kind": "quiz",
            "results_published": exam.results_published,
            "is_active": exam.is_active,
        }

        latest_attempt = MockExamAttempt.objects.filter(
            mock_exam=exam, student=user, status="submitted"
        ).order_by("-submitted_at").first()

        if latest_attempt:
            row["submission"] = {
                "id": str(latest_attempt.id),
                "created_at": latest_attempt.submitted_at.isoformat() if latest_attempt.submitted_at else None,
            }
            if exam.results_published or is_teacher or is_admin:
                row["submission"]["grade"] = {
                    "score": latest_attempt.total_score,
                    "feedback": None,
                    "graded_at": latest_attempt.submitted_at.isoformat() if latest_attempt.submitted_at else None,
                }
        result.append(row)

    # offline units + this user's grade (if any), respect publish_at for students
    offline_rows = []
    units = OfflineUnit.objects.filter(course=course).order_by("-created_at")
    for u in units:
        row = {
            "id": str(u.id),
            "title": u.title,
            "max_score": u.max_score,
            "created_at": u.created_at,
            "publish_at": u.publish_at,
        }
        if is_student:
            # hide grade until publish time
            if u.publish_at and u.publish_at > timezone.now():
                row["grade"] = None
            else:
                g = OfflineGrade.objects.filter(unit=u, student=user).first()
                if g:
                    row["grade"] = {
                        "score": g.score,
                        "feedback": g.feedback,
                        "graded_at": g.graded_at,
                    }
        offline_rows.append(row)

    return Response({"assignments": result, "offline_units": offline_rows})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def grades_offline(request):
    return Response({"units": []})
