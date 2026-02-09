from rest_framework import generics, permissions, status
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.utils import timezone
import os
from django.db import transaction, models
from django.contrib.auth import get_user_model
from .serializers import ProfileSerializer, UserSerializer, EmailOrUsernameTokenObtainPairSerializer
from streaks.utils import get_streak_base
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
        first_name = request.data.get("first_name")
        last_name = request.data.get("last_name")
        phone_number = request.data.get("phone_number")
        parent_name = request.data.get("parent_name")
        parent_phone = request.data.get("parent_phone")
        if nickname is not None:
            prof.nickname = nickname.strip() or None
        if avatar is not None:
            prof.avatar = avatar.strip() or None
        if phone_number is not None:
            prof.phone_number = str(phone_number).strip() or None
        if parent_name is not None:
            prof.parent_name = str(parent_name).strip() or None
        if parent_phone is not None:
            prof.parent_phone = str(parent_phone).strip() or None
        if first_name is not None:
            request.user.first_name = str(first_name).strip()
        if last_name is not None:
            request.user.last_name = str(last_name).strip()
        request.user.save(update_fields=["first_name", "last_name"])
        prof.save(update_fields=["nickname", "avatar", "phone_number", "parent_name", "parent_phone"])
        return Response(ProfileSerializer(prof, context={"request": request}).data)


class GoalScoreUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request):
        prof = request.user.profile
        math = request.data.get("goal_math")
        verbal = request.data.get("goal_verbal")

        def _parse(val, default):
            try:
                return int(val)
            except Exception:
                return default

        if math is not None:
            m = _parse(math, prof.goal_math)
            if m < 200 or m > 800:
                return Response({"error": "goal_math must be between 200 and 800"}, status=400)
            prof.goal_math = m
        if verbal is not None:
            v = _parse(verbal, prof.goal_verbal)
            if v < 200 or v > 800:
                return Response({"error": "goal_verbal must be between 200 and 800"}, status=400)
            prof.goal_verbal = v

        prof.save(update_fields=["goal_math", "goal_verbal"])
        return Response({"ok": True, "goal_math": prof.goal_math, "goal_verbal": prof.goal_verbal})


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


class UniversityIconUploadView(APIView):
    """
    Handle university icon upload and attach to the current profile.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        file = request.FILES.get("icon")
        if not file:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

        user_id = request.user.id
        ext = os.path.splitext(file.name)[1] or ".png"
        fname = f"university_icons/{user_id}/{timezone.now().strftime('%Y%m%d%H%M%S')}{ext}"

        saved_path = default_storage.save(fname, ContentFile(file.read()))
        prof = request.user.profile
        rel_url = default_storage.url(saved_path) if hasattr(default_storage, "url") else saved_path
        prof.university_icon = rel_url
        prof.save(update_fields=["university_icon"])

        absolute_url = request.build_absolute_uri(rel_url)
        return Response({"icon": absolute_url})


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
            qs = qs.filter(
                models.Q(nickname__icontains=q)
                | models.Q(user__username__icontains=q)
                | models.Q(user__first_name__icontains=q)
                | models.Q(user__last_name__icontains=q)
                | models.Q(student_id__icontains=q)
            )

        qs = qs.order_by("nickname")[: max(1, min(limit, 100))]
        data = []
        for p in qs:
            base = get_streak_base(p.user)
            offset = p.streak_offset or 0
            data.append(
                {
                    "user_id": str(p.user.id),
                    "username": p.user.username,
                    "email": p.user.email,
                    "first_name": p.user.first_name,
                    "last_name": p.user.last_name,
                    "nickname": p.nickname,
                    "student_id": p.student_id,
                    "role": p.role,
                    "is_admin": p.is_admin,
                    "math_level": p.math_level,
                    "verbal_level": p.verbal_level,
                    "phone_number": p.phone_number,
                    "parent_name": p.parent_name,
                    "parent_phone": p.parent_phone,
                    "streak_count": max(0, base + offset),
                    "avatar": p.avatar,
                }
            )
        return Response({"ok": True, "users": data})


class AdminUpdateUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, user_id):
        if not _require_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        profile = user.profile
        is_admin_target = user.is_superuser or profile.role == "admin" or profile.is_admin
        if is_admin_target and request.user.username != "iyagubov00001":
            return Response({"error": "Only iyagubov00001 can edit admin users"}, status=403)

        username = request.data.get("username")
        if username is not None:
            clean = str(username).strip().lower()
            if not clean:
                return Response({"error": "username cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            if User.objects.exclude(id=user.id).filter(username=clean).exists():
                return Response({"error": "username already exists"}, status=status.HTTP_400_BAD_REQUEST)
            user.username = clean
            user.email = f"{clean}@prep.local"

        first_name = request.data.get("first_name")
        if first_name is not None:
            user.first_name = str(first_name).strip()

        last_name = request.data.get("last_name")
        if last_name is not None:
            user.last_name = str(last_name).strip()

        password = request.data.get("password")
        if password:
            user.set_password(password)

        role = request.data.get("role")
        if role is not None:
            clean_role = str(role).strip().lower()
            if clean_role not in ["student", "teacher", "admin"]:
                return Response({"error": "role must be student, teacher, or admin"}, status=400)
            profile.role = clean_role
            profile.is_admin = clean_role == "admin"
            user.is_staff = clean_role == "admin"

        nickname = request.data.get("nickname")
        if nickname is not None:
            profile.nickname = str(nickname).strip() or None

        student_id = request.data.get("student_id")
        if student_id is not None:
            profile.student_id = str(student_id).strip() or None

        math_level = request.data.get("math_level")
        if math_level is not None:
            profile.math_level = str(math_level).strip() or None

        verbal_level = request.data.get("verbal_level")
        if verbal_level is not None:
            profile.verbal_level = str(verbal_level).strip() or None

        phone_number = request.data.get("phone_number")
        if phone_number is not None:
            profile.phone_number = str(phone_number).strip() or None

        parent_name = request.data.get("parent_name")
        if parent_name is not None:
            profile.parent_name = str(parent_name).strip() or None

        parent_phone = request.data.get("parent_phone")
        if parent_phone is not None:
            profile.parent_phone = str(parent_phone).strip() or None

        streak_count = request.data.get("streak_count")
        if streak_count is not None:
            try:
                desired = int(streak_count)
            except Exception:
                return Response({"error": "streak_count must be a number"}, status=400)
            if desired < 0:
                desired = 0
            base = get_streak_base(user)
            profile.streak_offset = desired - base

        user.save()
        profile.save()

        return Response(
            {
                "ok": True,
                "user": UserSerializer(user).data,
                "profile": ProfileSerializer(profile, context={"request": request}).data,
            }
        )


class AdminDeleteUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, user_id):
        if not _require_admin(request.user):
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        profile = getattr(user, "profile", None)
        is_admin_target = user.is_superuser or (profile and profile.role == "admin") or (
            profile and profile.is_admin
        )

        if is_admin_target:
            required = os.getenv("ADMIN_DELETE_PASSWORD") or "O95Ay5g9"
            provided = (request.data.get("admin_delete_password") or "").strip()
            if provided != required:
                return Response({"error": "Admin delete password required"}, status=status.HTTP_403_FORBIDDEN)

        user.delete()
        return Response({"ok": True})


class EmailOrUsernameTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailOrUsernameTokenObtainPairSerializer


class BootstrapAdminView(APIView):
    """
    One-time bootstrap endpoint to create the first admin user in production
    without shell access. Requires BOOTSTRAP_ADMIN_TOKEN env var and refuses
    if an admin already exists.
    """

    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request):
        bootstrap_token = os.getenv("BOOTSTRAP_ADMIN_TOKEN") or ""
        if not bootstrap_token:
            return Response({"error": "Bootstrap disabled"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        token = (request.data.get("token") or "").strip()
        if token != bootstrap_token:
            return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        # Refuse if any admin/superuser already exists
        if User.objects.filter(is_superuser=True).exists() or Profile.objects.filter(is_admin=True).exists():
            return Response({"error": "Admin already exists"}, status=status.HTTP_409_CONFLICT)

        username = (request.data.get("username") or "").strip().lower()
        password = request.data.get("password") or ""
        email = (request.data.get("email") or "").strip().lower()

        if not username or not password:
            return Response({"error": "username and password required"}, status=status.HTTP_400_BAD_REQUEST)

        if not email:
            email = f"{username}@prep.local"

        if User.objects.filter(username=username).exists() or User.objects.filter(email=email).exists():
            return Response({"error": "user already exists"}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(username=username, email=email, password=password)
        user.is_superuser = True
        user.is_staff = True
        user.save(update_fields=["is_superuser", "is_staff"])

        profile = user.profile
        profile.role = "admin"
        profile.is_admin = True
        profile.save(update_fields=["role", "is_admin"])

        return Response(
            {
                "ok": True,
                "user": UserSerializer(user).data,
                "profile": ProfileSerializer(profile, context={"request": request}).data,
            }
        )
