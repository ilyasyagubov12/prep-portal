from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
import os
import cloudinary.uploader
import cloudinary.api
from cloudinary.utils import cloudinary_url, private_download_url
from django.conf import settings
from courses.models import Course, CourseNode, CourseTeacher, Enrollment
from .models import Assignment, AssignmentFile, Submission, Grade, OfflineUnit, OfflineGrade
from .serializers import (
    AssignmentSerializer,
    AssignmentFileSerializer,
    SubmissionSerializer,
    GradeSerializer,
    OfflineUnitSerializer,
    OfflineGradeSerializer,
)
from courses.views import _require_admin

User = get_user_model()


def _require_staff(user: User, course: Course) -> bool:
    return _require_admin(user) or CourseTeacher.objects.filter(course=course, teacher=user).exists()


class AssignmentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        assignment_id = request.query_params.get("assignment_id")
        if not assignment_id:
            return Response({"error": "assignment_id required"}, status=400)
        try:
            assignment = Assignment.objects.select_related("course").get(id=assignment_id)
        except Assignment.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        course = assignment.course
        user = request.user
        is_teacher = CourseTeacher.objects.filter(course=course, teacher=user).exists()
        is_student = Enrollment.objects.filter(course=course, user=user).exists()
        if not (_require_staff(user, course) or is_student):
            return Response({"error": "Forbidden"}, status=403)

        # Auto-publish if a scheduled publish time has passed
        if assignment.status != "published":
            node = CourseNode.objects.filter(assignment_id=assignment.id).first()
            if node and node.publish_at and node.publish_at <= timezone.now():
                assignment.status = "published"
                assignment.published_at = timezone.now()
                assignment.save(update_fields=["status", "published_at"])

        return Response({"ok": True, "assignment": AssignmentSerializer(assignment).data})


class AssignmentCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        course_id = request.data.get("course_id")
        parent_id = request.data.get("parent_id")
        title = (request.data.get("title") or "").strip()
        due_at = request.data.get("due_at")
        max_score = request.data.get("max_score")
        max_submissions = request.data.get("max_submissions")
        if not course_id or not title:
            return Response({"error": "course_id and title required"}, status=400)
        try:
            course = Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)

        if not _require_staff(request.user, course):
            return Response({"error": "Forbidden"}, status=403)

        assignment = Assignment.objects.create(
            course=course,
            title=title,
            status="draft",
            due_at=due_at or None,
            max_score=max_score if max_score not in (None, "",) else None,
            max_submissions=max_submissions if max_submissions not in (None, "",) else None,
            created_by=request.user,
        )

        parent = None
        if parent_id:
            try:
                parent = CourseNode.objects.get(id=parent_id, course=course)
            except CourseNode.DoesNotExist:
                return Response({"error": "Parent not found"}, status=404)

        node = CourseNode.objects.create(
            course=course,
            parent=parent,
            kind="assignment",
            name=title,
            description=None,
            assignment_id=assignment.id,
            created_by=request.user,
            published=True,
        )

        return Response(
            {"ok": True, "assignment": AssignmentSerializer(assignment).data, "node": {
                "id": str(node.id),
                "assignment_id": str(assignment.id),
                "name": node.name,
                "kind": node.kind,
                "parent_id": str(node.parent_id) if node.parent_id else None,
                "course_id": str(node.course_id),
                "description": node.description,
                "published": node.published,
                "publish_at": node.publish_at,
            }},
            status=201,
        )


class AssignmentUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        assignment_id = request.data.get("assignment_id")
        if not assignment_id:
            return Response({"error": "assignment_id required"}, status=400)
        try:
            assignment = Assignment.objects.select_related("course").get(id=assignment_id)
        except Assignment.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if not _require_staff(request.user, assignment.course):
            return Response({"error": "Forbidden"}, status=403)

        title = request.data.get("title")
        body = request.data.get("body")
        status_val = request.data.get("status")
        due_at = request.data.get("due_at")
        max_score = request.data.get("max_score")
        max_submissions = request.data.get("max_submissions")
        if title:
            assignment.title = title.strip()
        if body is not None:
            assignment.body = body
        if status_val in ("draft", "published"):
            assignment.status = status_val
            assignment.published_at = timezone.now() if status_val == "published" else None
        assignment.due_at = due_at or None
        assignment.max_score = max_score if max_score not in (None, "",) else None
        assignment.max_submissions = max_submissions if max_submissions not in (None, "",) else None
        assignment.save()

        # keep node name in sync
        CourseNode.objects.filter(assignment_id=assignment.id).update(name=assignment.title)

        return Response({"ok": True, "assignment": AssignmentSerializer(assignment).data})


class AssignmentDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        assignment_id = request.data.get("assignment_id")
        if not assignment_id:
            return Response({"error": "assignment_id required"}, status=400)
        try:
            assignment = Assignment.objects.select_related("course").get(id=assignment_id)
        except Assignment.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if not _require_staff(request.user, assignment.course):
            return Response({"error": "Forbidden"}, status=403)

        CourseNode.objects.filter(assignment_id=assignment.id).delete()
        assignment.delete()
        return Response({"ok": True})


class AssignmentSubmissionsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        assignment_id = request.query_params.get("assignment_id")
        if not assignment_id:
            return Response({"error": "assignment_id required"}, status=400)
        try:
            assignment = Assignment.objects.select_related("course").get(id=assignment_id)
        except Assignment.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        course = assignment.course
        user = request.user
        is_teacher = CourseTeacher.objects.filter(course=course, teacher=user).exists()
        is_student = Enrollment.objects.filter(course=course, user=user).exists()
        if not (_require_staff(user, course) or is_student):
            return Response({"error": "Forbidden"}, status=403)

        # Submissions model not implemented yet; return empty list
        subs = (
            Submission.objects.filter(assignment=assignment)
            .select_related("student")
            .order_by("-created_at")
        )
        # attach grades
        grades = {g.submission_id: g for g in Grade.objects.filter(submission__in=subs)}
        data = []
        for s in subs:
            row = SubmissionSerializer(s).data
            g = grades.get(s.id)
            row["grade"] = GradeSerializer(g).data if g else None
            row["file_url"] = _cloud_url(s.file_path, s.mime_type)
            row["student_obj"] = {
                "user_id": str(s.student.id),
                "username": getattr(s.student, "username", None),
                "nickname": getattr(getattr(s.student, "profile", None), "nickname", None),
            }
            data.append(row)
        return Response({"ok": True, "submissions": data})


class AssignmentAttachmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        assignment_id = request.query_params.get("assignment_id")
        if not assignment_id:
            return Response({"error": "assignment_id required"}, status=400)
        try:
            assignment = Assignment.objects.select_related("course").get(id=assignment_id)
        except Assignment.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        course = assignment.course
        user = request.user
        is_teacher = CourseTeacher.objects.filter(course=course, teacher=user).exists()
        is_student = Enrollment.objects.filter(course=course, user=user).exists()
        if not (_require_staff(user, course) or is_student):
            return Response({"error": "Forbidden"}, status=403)

        files = AssignmentFile.objects.filter(assignment=assignment).order_by("-created_at")
        rows = []
        for f in files:
            row = AssignmentFileSerializer(f).data
            row["url"] = _cloud_url(f.storage_path, f.mime_type)
            rows.append(row)
        return Response({"ok": True, "files": rows})


class AssignmentAttachmentUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @transaction.atomic
    def post(self, request):
        assignment_id = request.data.get("assignment_id")
        file_obj = request.data.get("file")
        if not assignment_id or not file_obj:
            return Response({"error": "assignment_id and file required"}, status=400)
        try:
            assignment = Assignment.objects.select_related("course").get(id=assignment_id)
        except Assignment.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if not _require_staff(request.user, assignment.course):
            return Response({"error": "Forbidden"}, status=403)

        rel_path = f"assignment_attachments/{assignment.id}/{file_obj.name}"
        mime = getattr(file_obj, "content_type", "") or ""
        is_pdf = mime.lower() == "application/pdf" or rel_path.lower().endswith(".pdf")
        if os.getenv("CLOUDINARY_URL") and is_pdf:
            public_id = f"media/{rel_path.rsplit('.', 1)[0]}"
            cloudinary.uploader.upload(
                file_obj,
                public_id=public_id,
                resource_type="raw",
                type="upload",
                access_mode="public",
                overwrite=True,
            )
            saved = public_id
        else:
            saved = default_storage.save(rel_path, file_obj)
        af = AssignmentFile.objects.create(
            assignment=assignment,
            name=file_obj.name,
            storage_path=saved,
            mime_type=getattr(file_obj, "content_type", None),
            size_bytes=getattr(file_obj, "size", None),
            created_by=request.user,
        )
        file_url = _cloud_url(saved, getattr(file_obj, "content_type", None))
        data = AssignmentFileSerializer(af).data
        data["url"] = file_url
        return Response({"ok": True, "file": data})


class AssignmentAttachmentDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        assignment_id = request.data.get("assignment_id")
        storage_path = request.data.get("storage_path")
        if not assignment_id or not storage_path:
            return Response({"error": "assignment_id and storage_path required"}, status=400)
        try:
            assignment = Assignment.objects.select_related("course").get(id=assignment_id)
        except Assignment.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if not _require_staff(request.user, assignment.course):
            return Response({"error": "Forbidden"}, status=403)

        AssignmentFile.objects.filter(assignment=assignment, storage_path=storage_path).delete()
        try:
            default_storage.delete(storage_path)
        except Exception:
            pass
        return Response({"ok": True})


class SubmissionCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @transaction.atomic
    def post(self, request):
        assignment_id = request.data.get("assignment_id")
        file_obj = request.data.get("file")
        if not assignment_id or not file_obj:
            return Response({"error": "assignment_id and file required"}, status=400)
        try:
            assignment = Assignment.objects.select_related("course").get(id=assignment_id)
        except Assignment.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        # students enrolled or staff can submit
        user = request.user
        is_teacher = CourseTeacher.objects.filter(course=assignment.course, teacher=user).exists()
        is_student = Enrollment.objects.filter(course=assignment.course, user=user).exists()
        if not (is_teacher or is_student or _require_staff(user, assignment.course)):
            return Response({"error": "Forbidden"}, status=403)

        # Enforce deadline for students (teachers/admin can bypass)
        if assignment.due_at and not _require_staff(user, assignment.course) and timezone.now() > assignment.due_at:
            return Response({"error": "Deadline has passed"}, status=400)

        # Enforce submission limit for students only
        if not _require_staff(user, assignment.course) and assignment.max_submissions:
            existing = Submission.objects.filter(assignment=assignment, student=user).count()
            if existing >= assignment.max_submissions:
                return Response({"error": "Submission limit reached"}, status=400)

        rel_path = f"assignment_submissions/{assignment.id}/{user.id}/{file_obj.name}"
        mime = getattr(file_obj, "content_type", "") or ""
        is_pdf = mime.lower() == "application/pdf" or rel_path.lower().endswith(".pdf")
        if os.getenv("CLOUDINARY_URL") and is_pdf:
            public_id = f"media/{rel_path.rsplit('.', 1)[0]}"
            cloudinary.uploader.upload(
                file_obj,
                public_id=public_id,
                resource_type="raw",
                type="upload",
                access_mode="public",
                overwrite=True,
            )
            saved = public_id
        else:
            saved = default_storage.save(rel_path, file_obj)
        sub = Submission.objects.create(
            assignment=assignment,
            student=user,
            file_path=saved,
            file_name=file_obj.name,
            file_size=getattr(file_obj, "size", None),
            mime_type=getattr(file_obj, "content_type", None),
        )
        file_url = _cloud_url(saved, getattr(file_obj, "content_type", None))
        data = SubmissionSerializer(sub).data
        data["file_url"] = file_url
        return Response({"ok": True, "submission": data}, status=201)


class GradeUpsertView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        submission_id = request.data.get("submission_id")
        score = request.data.get("score")
        feedback = request.data.get("feedback")
        if not submission_id:
            return Response({"error": "submission_id required"}, status=400)
        try:
            submission = Submission.objects.select_related("assignment__course").get(id=submission_id)
        except Submission.DoesNotExist:
            return Response({"error": "Submission not found"}, status=404)

        course = submission.assignment.course
        user = request.user
        if not (_require_staff(user, course)):
            return Response({"error": "Forbidden"}, status=403)

        grade, _ = Grade.objects.get_or_create(submission=submission, defaults={"grader": user})
        grade.grader = user
        grade.score = score if score != "" else None
        grade.feedback = feedback
        grade.save()

        return Response({"ok": True, "grade": GradeSerializer(grade).data})


class OfflineUnitCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        course_id = request.data.get("course_id")
        title = (request.data.get("title") or "").strip()
        max_score = request.data.get("max_score")
        publish_at = request.data.get("publish_at")
        if not course_id or not title:
            return Response({"error": "course_id and title required"}, status=400)
        try:
            course = Course.objects.get(id=course_id)
        except Course.DoesNotExist:
            return Response({"error": "Course not found"}, status=404)
        if not _require_staff(request.user, course):
            return Response({"error": "Forbidden"}, status=403)
        unit = OfflineUnit.objects.create(
            course=course,
            title=title,
            max_score=max_score or None,
            publish_at=publish_at or None,
            created_by=request.user,
        )
        return Response({"ok": True, "unit": OfflineUnitSerializer(unit).data}, status=201)


class OfflineUnitUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        unit_id = request.data.get("unit_id")
        if not unit_id:
            return Response({"error": "unit_id required"}, status=400)
        try:
            unit = OfflineUnit.objects.select_related("course").get(id=unit_id)
        except OfflineUnit.DoesNotExist:
            return Response({"error": "Unit not found"}, status=404)
        if not _require_staff(request.user, unit.course):
            return Response({"error": "Forbidden"}, status=403)

        title = request.data.get("title")
        max_score = request.data.get("max_score")
        publish_at = request.data.get("publish_at")

        if title is not None:
            unit.title = title.strip()
        if max_score is not None:
            unit.max_score = max_score if max_score != "" else None
        unit.publish_at = publish_at or None
        unit.save()
        return Response({"ok": True, "unit": OfflineUnitSerializer(unit).data})


class OfflineUnitDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        unit_id = request.data.get("unit_id")
        course_id = request.data.get("course_id")
        if not unit_id:
            return Response({"error": "unit_id required"}, status=400)
        try:
            unit = OfflineUnit.objects.select_related("course").get(id=unit_id)
        except OfflineUnit.DoesNotExist:
            return Response({"error": "Unit not found"}, status=404)
        if course_id and str(unit.course_id) != str(course_id):
            return Response({"error": "Course mismatch"}, status=400)
        if not _require_staff(request.user, unit.course):
            return Response({"error": "Forbidden"}, status=403)
        unit.delete()
        return Response({"ok": True})


class OfflineUnitsListView(APIView):
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
        if not (_require_staff(user, course) or Enrollment.objects.filter(course=course, user=user).exists()):
            return Response({"error": "Forbidden"}, status=403)

        units = OfflineUnit.objects.filter(course=course).order_by("-created_at")
        return Response({"ok": True, "units": OfflineUnitSerializer(units, many=True).data})


class OfflineGradeUpsertView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        unit_id = request.data.get("unit_id")
        student_id = request.data.get("student_id")
        score = request.data.get("score")
        feedback = request.data.get("feedback")
        if not unit_id or not student_id:
            return Response({"error": "unit_id and student_id required"}, status=400)
        try:
            unit = OfflineUnit.objects.select_related("course").get(id=unit_id)
        except OfflineUnit.DoesNotExist:
            return Response({"error": "Unit not found"}, status=404)
        try:
            student = User.objects.get(id=student_id)
        except User.DoesNotExist:
            return Response({"error": "Student not found"}, status=404)

        if not _require_staff(request.user, unit.course):
            return Response({"error": "Forbidden"}, status=403)

        grade, _ = OfflineGrade.objects.get_or_create(unit=unit, student=student)
        grade.score = score if score not in ("", None) else None
        grade.feedback = feedback
        grade.save()
        return Response({"ok": True, "grade": OfflineGradeSerializer(grade).data})


class OfflineGradesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        course_id = request.query_params.get("course_id")
        unit_id = request.query_params.get("unit_id")
        if not (course_id or unit_id):
            return Response({"error": "course_id or unit_id required"}, status=400)

        if unit_id:
            try:
                unit = OfflineUnit.objects.select_related("course").get(id=unit_id)
            except OfflineUnit.DoesNotExist:
                return Response({"error": "Unit not found"}, status=404)
            course = unit.course
            grades = OfflineGrade.objects.filter(unit=unit).select_related("student")
        else:
            try:
                course = Course.objects.get(id=course_id)
            except Course.DoesNotExist:
                return Response({"error": "Course not found"}, status=404)
            grades = OfflineGrade.objects.filter(unit__course=course).select_related("student", "unit")

        user = request.user
        is_staff = _require_staff(user, course)
        is_student = Enrollment.objects.filter(course=course, user=user).exists()
        if not (is_staff or is_student):
            return Response({"error": "Forbidden"}, status=403)

        # For students: only return their own grade, and only after publish_at
        if not is_staff:
            grades = grades.filter(student=user)
            # hide if not yet published
            if unit_id and unit.publish_at and unit.publish_at > timezone.now():
                return Response({"ok": True, "grades": []})
            if course_id:
                # filter out units not yet published
                grades = grades.filter(unit__publish_at__lte=timezone.now()) | grades.filter(unit__publish_at__isnull=True)

        data = []
        for g in grades:
            row = OfflineGradeSerializer(g).data
            row["unit"] = str(g.unit_id)
            row["student_profile"] = {
                "user_id": str(g.student.id),
                "username": getattr(g.student, "username", None),
                "nickname": getattr(getattr(g.student, "profile", None), "nickname", None),
            }
            data.append(row)
        return Response({"ok": True, "grades": data})


def _cloud_url(path: str | None, mime_type: str | None = None):
    if not path:
        return None
    if os.getenv("CLOUDINARY_URL"):
        lower = path.lower()
        mime = (mime_type or "").lower()
        is_pdf = mime == "application/pdf" or lower.endswith(".pdf")
        if mime.startswith("image/") or lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
            resource_type = "image"
            fmt = None
            delivery_type = "upload"
        elif is_pdf:
            public_id = path.rsplit(".", 1)[0] if lower.endswith(".pdf") else path
            variants = [public_id]
            if " " in public_id:
                variants.append(public_id.replace(" ", "_"))
            for vid in variants:
                for candidate in ("raw", "image"):
                    try:
                        cloudinary.api.resource(vid, resource_type=candidate, type="upload")
                        return private_download_url(
                            vid,
                            "pdf",
                            resource_type=candidate,
                            type="upload",
                            attachment=False,
                        )
                    except Exception:
                        continue
            return private_download_url(
                public_id,
                "pdf",
                resource_type="raw",
                type="upload",
                attachment=False,
            )
        else:
            resource_type = "raw"
            fmt = None
            delivery_type = "authenticated"
        url, _ = cloudinary_url(
            path,
            resource_type=resource_type,
            type=delivery_type,
            secure=True,
            sign_url=(delivery_type != "upload"),
            format=fmt,
        )
        return url
    return default_storage.url(path)
