from rest_framework import serializers
from django.core.files.storage import default_storage
import os
import re
from urllib.parse import urlparse, unquote
import cloudinary.api
from cloudinary.utils import cloudinary_url, private_download_url
from .models import Course, CourseNode


class CourseSerializer(serializers.ModelSerializer):
    cover_url = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ["id", "slug", "title", "description", "cover_path", "cover_url"]

    def get_cover_url(self, obj):
        if not obj.cover_path:
            return None
        try:
            return default_storage.url(obj.cover_path)
        except Exception:
            return obj.cover_path


class CourseNodeSerializer(serializers.ModelSerializer):
    assignment = serializers.SerializerMethodField()
    quiz = serializers.SerializerMethodField()
    storage_url = serializers.SerializerMethodField()

    class Meta:
        model = CourseNode
        fields = [
            "id",
            "course",
            "parent",
            "kind",
            "name",
            "description",
            "storage_path",
            "storage_url",
            "mime_type",
            "size_bytes",
            "published",
            "publish_at",
            "assignment_id",
            "assignment",
            "quiz_id",
            "quiz",
            "created_by",
            "created_at",
        ]

    def get_assignment(self, obj):
        assignments_map = self.context.get("assignments_map")
        if assignments_map:
            return assignments_map.get(obj.assignment_id)
        return None

    def get_quiz(self, obj):
        quizzes_map = self.context.get("quizzes_map")
        if quizzes_map:
            return quizzes_map.get(obj.quiz_id)
        return None

    def get_storage_url(self, obj):
        if not obj.storage_path:
            return None
        def _normalize_name(value: str) -> str:
            return re.sub(r"[^a-z0-9]+", "", value.lower())

        def _resolve_pdf_public_id(base_public_id: str):
            if not os.getenv("CLOUDINARY_URL"):
                return None, None, None
            original_public_id = base_public_id
            variants = {original_public_id}
            if original_public_id.lower().endswith(".pdf"):
                variants.add(original_public_id[:-4])
            if " " in original_public_id:
                variants.add(original_public_id.replace(" ", "_"))
            if original_public_id.startswith("media/"):
                variants.add(original_public_id[len("media/"):])
            else:
                variants.add(f"media/{original_public_id}")
            target_name = original_public_id.split("/")[-1]
            if target_name.lower().endswith(".pdf"):
                target_name = target_name[:-4]
            target_norm = _normalize_name(target_name)

            delivery_types = ("upload", "authenticated", "private")
            for vid in variants:
                for candidate in ("raw", "image"):
                    for delivery in delivery_types:
                        try:
                            cloudinary.api.resource(vid, resource_type=candidate, type=delivery)
                            return vid, candidate, delivery
                        except Exception:
                            continue

            for vid in variants:
                folder = "/".join(vid.split("/")[:-1])
                if not folder:
                    continue
                for candidate in ("raw", "image"):
                    for delivery in delivery_types:
                        try:
                            res = cloudinary.api.resources(
                                resource_type=candidate,
                                type=delivery,
                                prefix=f"{folder}/",
                                max_results=500,
                            )
                            for item in res.get("resources", []):
                                pid = item.get("public_id", "")
                                if _normalize_name(pid.split("/")[-1]) == target_norm:
                                    return pid, candidate, delivery
                        except Exception:
                            continue
            return None, None, None

        if str(obj.storage_path).startswith("http://") or str(obj.storage_path).startswith("https://"):
            mime = (obj.mime_type or "").lower()
            lower = str(obj.storage_path).lower()
            is_pdf = mime == "application/pdf" or lower.endswith(".pdf")
            if os.getenv("CLOUDINARY_URL") and is_pdf and "res.cloudinary.com" in lower:
                try:
                    parts = urlparse(obj.storage_path).path.strip("/").split("/")
                    # Expected: <cloud>/<resource_type>/<type>/.../v<ver>/<public_id>.<ext>
                    if len(parts) >= 5:
                        resource_type = parts[1]
                        delivery_type = parts[2]
                        public_tail = "/".join(parts[4:])
                        public_tail = unquote(public_tail)
                        public_id = public_tail.rsplit(".", 1)[0]
                        resolved_id, resolved_type, resolved_delivery = _resolve_pdf_public_id(public_id)
                        return private_download_url(
                            resolved_id or public_id,
                            "pdf",
                            resource_type=resolved_type or resource_type,
                            type=resolved_delivery or delivery_type,
                            attachment=False,
                        )
                except Exception:
                    pass
            return obj.storage_path

        # If Cloudinary is configured, return a signed URL so protected assets load.
        if os.getenv("CLOUDINARY_URL"):
            path = obj.storage_path
            mime = (obj.mime_type or "").lower()
            lower = path.lower()
            is_pdf = mime == "application/pdf" or lower.endswith(".pdf")
            if mime.startswith("image/") or lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
                resource_type = "image"
                fmt = None
                delivery_type = "upload"
            elif is_pdf:
                # Use Cloudinary private download URL for PDFs to bypass ACL issues
                public_id, candidate, delivery_type = _resolve_pdf_public_id(path)
                if public_id and candidate and delivery_type:
                    return private_download_url(
                        public_id,
                        "pdf",
                        resource_type=candidate,
                        type=delivery_type,
                        attachment=False,
                    )
                return private_download_url(
                    path.rsplit(".", 1)[0] if lower.endswith(".pdf") else path,
                    "pdf",
                    resource_type="raw",
                    type="upload",
                    attachment=False,
                )
            else:
                resource_type = "raw"
                fmt = None
                delivery_type = "upload"
            url, _ = cloudinary_url(
                path,
                resource_type=resource_type,
                type=delivery_type,
                secure=True,
                sign_url=(delivery_type != "upload"),
                format=fmt,
            )
            return url
        try:
            return default_storage.url(obj.storage_path)
        except Exception:
            return obj.storage_path
