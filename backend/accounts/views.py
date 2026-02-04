from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.utils import timezone
import os
from django.db import transaction
from django.contrib.auth import get_user_model
from .serializers import ProfileSerializer, UserSerializer
from .models import Profile

User = get_user_model()


class MeView(generics.RetrieveAPIView):
    """Return the current user's profile."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProfileSerializer

    def get_object(self):
        return self.request.user.profile


class ProfileUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request):
        prof = request.user.profile
        nickname = request.data.get("nickname")
        avatar = request.data.get("avatar")
        if nickname is not None:
            prof.nickname = nickname.strip() or None
        if avatar is not None:
            prof.avatar = avatar.strip() or None
        prof.save(update_fields=["nickname", "avatar"])
        return Response(ProfileSerializer(prof, context={"request": request}).data)


class AvatarUploadView(APIView):
    """
    Handle avatar image upload and attach to the current profile.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        file = request.FILES.get("avatar")
        if not file:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

        # Build path: avatars/{user_id}/{timestamp_filename}
        user_id = request.user.id
        ext = os.path.splitext(file.name)[1] or ".jpg"
        fname = f"avatars/{user_id}/{timezone.now().strftime('%Y%m%d%H%M%S')}{ext}"

        saved_path = default_storage.save(fname, ContentFile(file.read()))
        prof = request.user.profile
        rel_url = default_storage.url(saved_path) if hasattr(default_storage, "url") else saved_path
        prof.avatar = rel_url
        prof.save(update_fields=["avatar"])

        absolute_url = request.build_absolute_uri(rel_url)
        return Response({"avatar": absolute_url})


def _require_admin(user: User):
    prof = getattr(user, "profile", None)
    role = (getattr(prof, "role", None) or "").lower()
    is_admin = getattr(prof, "is_admin", False)
    return user.is_superuser or is_admin or role == "admin"


class AdminCreateUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not _require_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        username = (request.data.get("username") or "").strip().lower()
        password = request.data.get("password") or ""
        nickname = (request.data.get("nickname") or "").strip() or None
        role = (request.data.get("role") or "student").lower()
        if not username or not password:
            return Response({"error": "username and password required"}, status=400)
        email = f"{username}@prep.local"
        if User.objects.filter(username=username).exists():
            return Response({"error": "username already exists"}, status=400)
        user = User.objects.create_user(username=username, email=email, password=password)
        profile = user.profile
        profile.role = role
        profile.nickname = nickname
        profile.is_admin = role == "admin"
        profile.save()
        return Response(
            {
                "ok": True,
                "user": UserSerializer(user).data,
                "profile": ProfileSerializer(profile, context={"request": request}).data,
            }
        )


class AdminSearchUsersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _require_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        q = (request.data.get("q") or "").strip().lower()
        role = (request.data.get("role") or "").lower()
        limit = int(request.data.get("limit") or 20)

        qs = Profile.objects.select_related("user")
        if role:
            qs = qs.filter(role=role)
        if q:
            qs = qs.filter(nickname__icontains=q)

        qs = qs.order_by("nickname")[: max(1, min(limit, 100))]
        data = []
        for p in qs:
            data.append(
                {
                "user_id": str(p.user.id),
                "username": p.user.username,
                "nickname": p.nickname,
                "role": p.role,
                "is_admin": p.is_admin,
                "avatar": p.avatar,
                }
            )
        return Response({"ok": True, "users": data})
