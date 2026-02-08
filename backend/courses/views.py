from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.conf import settings
from accounts.models import Profile
from .models import Course, CourseTeacher, Enrollment, CourseNode
from .serializers import CourseSerializer, CourseNodeSerializer

User = get_user_model()


def _require_admin(user: User) -> bool:
    prof = getattr(user, "profile", None)
    role = (getattr(prof, "role", None) or "").lower()
    is_admin = getattr(prof, "is_admin", False)
    return user.is_superuser or is_admin or role == "admin"


def _is_teacher(user: User) -> bool:
    prof = getattr(user, "profile", None)
    role = (getattr(prof, "role", None) or "").lower()
    return role == "teacher"


class AdminCoursesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return self._list(request)

    def post(self, request):
        return self._list(request)

    def _list(self, request):
        if not _require_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        qs = Course.objects.order_by("-created_at")
        data = CourseSerializer(qs, many=True).data
        return Response({"ok": True, "courses": data})


class AdminCoursesCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _require_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        serializer = CourseSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"error": serializer.errors}, status=400)
        course = serializer.save()
        return Response({"ok": True, "course": CourseSerializer(course).data})


class AdminCoursesUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _require_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        cid = request.data.get("id")
        try:
            course = Course.objects.get(id=cid)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)

        serializer = CourseSerializer(course, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response({"error": serializer.errors}, status=400)
        serializer.save()
        return Response({"ok": True, "course": serializer.data})


class AdminCoursesDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _require_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        cid = request.data.get("id")
        try:
            course = Course.objects.get(id=cid)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)
        course.delete()
        return Response({"ok": True})


class CoursesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        qs = Course.objects.all()

        if _require_admin(user):
            qs = qs.order_by("-created_at")
        elif _is_teacher(user):
            teacher_course_ids = CourseTeacher.objects.filter(teacher=user).values_list("course_id", flat=True)
            qs = qs.filter(id__in=teacher_course_ids).order_by("-created_at")
        else:
            enroll_ids = Enrollment.objects.filter(user=user).values_list("course_id", flat=True)
            qs = qs.filter(id__in=enroll_ids).order_by("-created_at")

        data = CourseSerializer(qs, many=True).data
        return Response(data)


class CoursePeopleView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        course_id = request.query_params.get("course_id")
        if not course_id:
            return Response({"error": "course_id required"}, status=400)
        try:
            course = Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)

        user = request.user
        # authorization: admin/teacher of course or enrolled student
        if not _require_admin(user):
            is_teacher = CourseTeacher.objects.filter(course=course, teacher=user).exists()
            is_student = Enrollment.objects.filter(course=course, user=user).exists()
            if not (is_teacher or is_student):
                return Response({"error": "Forbidden"}, status=403)

        teacher_rows = (
            CourseTeacher.objects.filter(course=course)
            .select_related("teacher__profile")
            .order_by("created_at")
        )
        student_rows = (
            Enrollment.objects.filter(course=course)
            .select_related("user__profile")
            .order_by("created_at")
        )

        def to_profile(u: User):
            p = getattr(u, "profile", None)
            return {
                "user_id": str(u.id),
                "username": getattr(u, "username", None),
                "nickname": getattr(p, "nickname", None),
                "role": getattr(p, "role", None),
                "is_admin": getattr(p, "is_admin", False),
                "avatar": getattr(p, "avatar", None),
            }

        teachers = [{"user_id": str(t.teacher.id), **to_profile(t.teacher)} for t in teacher_rows]
        students = [{"user_id": str(s.user.id), **to_profile(s.user)} for s in student_rows]

        return Response({"ok": True, "teachers": teachers, "students": students})


class CourseCoverUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @transaction.atomic
    def post(self, request):
        course_id = request.data.get("course_id")
        file_obj = request.data.get("file")
        if not course_id or not file_obj:
            return Response({"error": "course_id and file are required"}, status=400)

        try:
            course = Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)

        user = request.user
        if not (_require_admin(user) or CourseTeacher.objects.filter(course=course, teacher=user).exists()):
            return Response({"error": "Forbidden"}, status=403)

        filename = f"course_covers/{course.id}/{file_obj.name}"
        saved_path = default_storage.save(filename, file_obj)
        course.cover_path = saved_path
        course.save(update_fields=["cover_path"])

        cover_url = default_storage.url(saved_path)
        return Response({"ok": True, "cover_path": saved_path, "cover_url": cover_url})


class CourseNodesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        course_id = request.query_params.get("course_id")
        parent_id = request.query_params.get("parent_id")
        if not course_id:
            return Response({"error": "course_id required"}, status=400)
        try:
            course = Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)

        user = request.user
        # auth: admin/teacher/enrolled
        if not _require_admin(user):
            is_teacher = CourseTeacher.objects.filter(course=course, teacher=user).exists()
            is_student = Enrollment.objects.filter(course=course, user=user).exists()
            if not (is_teacher or is_student):
                return Response({"error": "Forbidden"}, status=403)

        qs = CourseNode.objects.filter(course=course)
        if parent_id is None or parent_id == "":
            qs = qs.filter(parent__isnull=True)
        else:
            qs = qs.filter(parent_id=parent_id)
        qs = qs.order_by("name")

        # Preload assignments for assignment nodes to include status/title for visibility logic
        assignment_ids = list(qs.filter(kind="assignment").values_list("assignment_id", flat=True))
        assignments_map = {}
        if assignment_ids:
            from assignments.models import Assignment

            now = timezone.now()
            assignments = {a.id: a for a in Assignment.objects.filter(id__in=assignment_ids)}
            # Auto-publish assignments whose node publish_at has passed
            for node in qs.filter(kind="assignment"):
                if not node.assignment_id:
                    continue
                a = assignments.get(node.assignment_id)
                if not a:
                    continue
                if a.status != "published" and node.publish_at and node.publish_at <= now:
                    a.status = "published"
                    a.published_at = now
                    a.save(update_fields=["status", "published_at"])

            for a in assignments.values():
                assignments_map[a.id] = {
                    "id": str(a.id),
                    "title": a.title,
                    "status": a.status,
                    "published_at": a.published_at,
                    "due_at": a.due_at,
                    "max_score": getattr(a, "max_score", None),
                }

        data = CourseNodeSerializer(qs, many=True, context={"assignments_map": assignments_map}).data
        return Response({"ok": True, "nodes": data})


class CourseNodesCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        course_id = request.data.get("course_id")
        parent_id = request.data.get("parent_id")
        kind = request.data.get("kind", "folder")
        name = (request.data.get("name") or "").strip()
        description = request.data.get("description") or None

        if not course_id or not name:
            return Response({"error": "course_id and name required"}, status=400)
        if kind not in ("folder", "file"):
            return Response({"error": "Unsupported kind"}, status=400)

        try:
            course = Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)

        user = request.user
        if not (_require_admin(user) or CourseTeacher.objects.filter(course=course, teacher=user).exists()):
            return Response({"error": "Forbidden"}, status=403)

        parent = None
        if parent_id:
            try:
                parent = CourseNode.objects.get(id=parent_id, course=course)
            except CourseNode.DoesNotExist:
                return Response({"error": "Parent not found"}, status=404)

        node = CourseNode.objects.create(
            course=course,
            parent=parent,
            kind=kind,
            name=name,
            description=description,
            created_by=user,
            published=True,
        )
        return Response({"ok": True, "node": CourseNodeSerializer(node).data})


class CourseNodeSetPublishedView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        node_id = request.data.get("node_id")
        published = request.data.get("published")
        if node_id is None or published is None:
            return Response({"error": "node_id and published required"}, status=400)
        try:
            node = CourseNode.objects.select_related("course").get(id=node_id)
        except CourseNode.DoesNotExist:
            return Response({"error": "Node not found"}, status=404)

        user = request.user
        if not (_require_admin(user) or CourseTeacher.objects.filter(course=node.course, teacher=user).exists()):
            return Response({"error": "Forbidden"}, status=403)

        node.published = bool(published)
        node.save(update_fields=["published"])
        return Response({"ok": True})


class CourseNodeSetScheduleView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        node_id = request.data.get("node_id")
        publish_at = request.data.get("publish_at")
        try:
            node = CourseNode.objects.select_related("course").get(id=node_id)
        except CourseNode.DoesNotExist:
            return Response({"error": "Node not found"}, status=404)

        user = request.user
        if not (_require_admin(user) or CourseTeacher.objects.filter(course=node.course, teacher=user).exists()):
            return Response({"error": "Forbidden"}, status=403)

        node.publish_at = publish_at or None
        node.save(update_fields=["publish_at"])
        return Response({"ok": True})


class CourseNodeUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        node_id = request.data.get("node_id")
        name = (request.data.get("name") or "").strip()
        parent_id = request.data.get("parent_id")
        description = request.data.get("description") or None

        if not node_id:
            return Response({"error": "node_id required"}, status=400)

        try:
            node = CourseNode.objects.select_related("course").get(id=node_id)
        except CourseNode.DoesNotExist:
            return Response({"error": "Node not found"}, status=404)

        user = request.user
        if not (_require_admin(user) or CourseTeacher.objects.filter(course=node.course, teacher=user).exists()):
            return Response({"error": "Forbidden"}, status=403)

        if name:
            node.name = name
        node.description = description

        if parent_id is not None:
            if parent_id == "":
                node.parent = None
            else:
                try:
                    parent = CourseNode.objects.get(id=parent_id, course=node.course)
                except CourseNode.DoesNotExist:
                    return Response({"error": "Parent not found"}, status=404)
                node.parent = parent

        node.save()
        return Response({"ok": True})


class CourseNodeDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        node_id = request.data.get("node_id")
        if not node_id:
            return Response({"error": "node_id required"}, status=400)
        try:
            node = CourseNode.objects.select_related("course").get(id=node_id)
        except CourseNode.DoesNotExist:
            return Response({"error": "Node not found"}, status=404)

        user = request.user
        if not (_require_admin(user) or CourseTeacher.objects.filter(course=node.course, teacher=user).exists()):
            return Response({"error": "Forbidden"}, status=403)

        node.delete()
        return Response({"ok": True})


class CourseNodeUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @transaction.atomic
    def post(self, request):
        course_id = request.data.get("course_id")
        parent_id = request.data.get("parent_id")
        name = (request.data.get("name") or "").strip()
        description = request.data.get("description") or None
        file_obj = request.data.get("file")

        if not course_id or not file_obj:
            return Response({"error": "course_id and file required"}, status=400)
        if not name:
            name = file_obj.name

        try:
            course = Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)

        user = request.user
        if not (_require_admin(user) or CourseTeacher.objects.filter(course=course, teacher=user).exists()):
            return Response({"error": "Forbidden"}, status=403)

        parent = None
        if parent_id:
            try:
                parent = CourseNode.objects.get(id=parent_id, course=course)
            except CourseNode.DoesNotExist:
                return Response({"error": "Parent not found"}, status=404)

        rel_path = f"course_files/{course.id}/{file_obj.name}"
        saved_path = default_storage.save(rel_path, file_obj)

        node = CourseNode.objects.create(
            course=course,
            parent=parent,
            kind="file",
            name=name,
            description=description,
            storage_path=saved_path,
            mime_type=getattr(file_obj, "content_type", None),
            size_bytes=getattr(file_obj, "size", None),
            created_by=user,
            published=True,
        )

        file_url = default_storage.url(saved_path)

        return Response(
            {
                "ok": True,
                "node": CourseNodeSerializer(node).data,
                "file_url": file_url,
            }
        )


class AdminMembershipsListView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not _require_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        cid = request.data.get("course_id")
        if not cid:
            return Response({"error": "course_id required"}, status=400)
        try:
            course = Course.objects.get(id=cid)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)

        teachers = (
            CourseTeacher.objects.filter(course=course)
            .select_related("teacher__profile")
            .order_by("-created_at")
        )
        students = (
            Enrollment.objects.filter(course=course)
            .select_related("user__profile")
            .order_by("-created_at")
        )

        def prof_dict(user):
            p = getattr(user, "profile", None)
            return {
                "user_id": str(user.id),
                "username": getattr(user, "username", None),
                "nickname": getattr(p, "nickname", None),
                "role": getattr(p, "role", None),
                "is_admin": getattr(p, "is_admin", False),
                "avatar": getattr(p, "avatar", None),
            }

        return Response(
            {
                "ok": True,
                "teachers": [
                    {
                        "teacher_id": str(t.teacher.id),
                        "created_at": t.created_at,
                        "profile": prof_dict(t.teacher),
                    }
                    for t in teachers
                ],
                "students": [
                    {
                        "user_id": str(s.user.id),
                        "enrolled_at": s.created_at,
                        "profile": prof_dict(s.user),
                    }
                    for s in students
                ],
            }
        )


class AdminMembershipsSetView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _require_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        cid = request.data.get("course_id")
        kind = request.data.get("kind")
        action = request.data.get("action")
        user_id = request.data.get("user_id")
        if not all([cid, kind, action, user_id]):
            return Response({"error": "course_id, kind, action, user_id required"}, status=400)
        try:
            course = Course.objects.get(id=cid)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        if kind == "teacher":
            if action == "add":
                CourseTeacher.objects.get_or_create(course=course, teacher=user)
            elif action == "remove":
                CourseTeacher.objects.filter(course=course, teacher=user).delete()
            else:
                return Response({"error": "invalid action"}, status=400)
        elif kind == "student":
            if action == "add":
                Enrollment.objects.get_or_create(course=course, user=user)
            elif action == "remove":
                Enrollment.objects.filter(course=course, user=user).delete()
            else:
                return Response({"error": "invalid action"}, status=400)
        else:
            return Response({"error": "invalid kind"}, status=400)

        return Response({"ok": True})

# Create your views here.
