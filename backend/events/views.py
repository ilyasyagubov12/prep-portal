from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import transaction
from django.contrib.auth import get_user_model
from courses.models import Course, CourseTeacher, Enrollment
from .models import CourseEvent
from .serializers import CourseEventSerializer

User = get_user_model()


def _require_staff(user: User, course: Course) -> bool:
    # admin or course teacher
    from courses.views import _require_admin  # reuse helper

    if _require_admin(user):
        return True
    return CourseTeacher.objects.filter(course=course, teacher=user).exists()


class CourseEventsListView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        course_id = request.data.get("course_id")
        if not course_id:
            return Response({"error": "course_id required"}, status=400)
        try:
            course = Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)

        user = request.user
        is_teacher = CourseTeacher.objects.filter(course=course, teacher=user).exists()
        is_student = Enrollment.objects.filter(course=course, user=user).exists()
        if not (_require_staff(user, course) or is_student):
            return Response({"error": "Forbidden"}, status=403)

        events = CourseEvent.objects.filter(course=course).order_by("starts_at")
        data = CourseEventSerializer(events, many=True).data
        return Response({"ok": True, "events": data})


class CourseEventsCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        course_id = request.data.get("course_id")
        if not course_id:
            return Response({"error": "course_id required"}, status=400)
        try:
            course = Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)

        if not _require_staff(request.user, course):
            return Response({"error": "Forbidden"}, status=403)

        data = {
            "course": course.id,
            "title": request.data.get("title"),
            "description": request.data.get("description"),
            "starts_at": request.data.get("starts_at"),
            "ends_at": request.data.get("ends_at"),
            "repeat_weekly": bool(request.data.get("repeat_weekly")),
            "repeat_until": request.data.get("repeat_until") or None,
        }
        serializer = CourseEventSerializer(data=data)
        if not serializer.is_valid():
            return Response({"error": serializer.errors}, status=400)
        ev = serializer.save(created_by=request.user)
        return Response({"ok": True, "event": CourseEventSerializer(ev).data})


class CourseEventsDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        event_id = request.data.get("event_id")
        if not event_id:
            return Response({"error": "event_id required"}, status=400)
        try:
            ev = CourseEvent.objects.select_related("course").get(id=event_id)
        except CourseEvent.DoesNotExist:
            return Response({"error": "Event not found"}, status=404)

        if not _require_staff(request.user, ev.course):
            return Response({"error": "Forbidden"}, status=403)

        ev.delete()
        return Response({"ok": True})
