from django.contrib.auth import authenticate, get_user_model
from rest_framework import exceptions, serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.settings import api_settings
from .models import User, Profile


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "username", "first_name", "last_name"]


class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Allow login with either username or email.
    The user model uses email as USERNAME_FIELD, but we want to accept username too.
    """

    username_field = "username"

    def get_fields(self):
        fields = super().get_fields()
        # Add optional email field for convenience
        fields["email"] = serializers.EmailField(required=False, allow_blank=True)
        return fields

    @classmethod
    def get_token(cls, user):
        return super().get_token(user)

    def _resolve_user(self, raw_identifier):
        identifier = (raw_identifier or "").strip().lower()
        if not identifier:
            return None

        UserModel = get_user_model()
        candidates = []

        if "@" in identifier:
            candidates.append({"email": identifier})
        else:
            candidates.append({"username": identifier})
            candidates.append({"email": f"{identifier}@prep.local"})

        for lookup in candidates:
            user = UserModel.objects.filter(**lookup).first()
            if user:
                return user

        return None

    def validate(self, attrs):
        password = attrs.get("password")
        raw_identifier = attrs.get("username") or attrs.get("email")
        user = self._resolve_user(raw_identifier)

        if user:
            self.user = authenticate(
                request=self.context.get("request"),
                email=user.email,
                password=password,
            )
        else:
            self.user = None

        if not api_settings.USER_AUTHENTICATION_RULE(self.user):
            raise exceptions.AuthenticationFailed(
                self.error_messages["no_active_account"],
                "no_active_account",
            )

        refresh = self.get_token(self.user)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }


class ProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer()
    avatar = serializers.SerializerMethodField()
    university_icon = serializers.SerializerMethodField()
    selected_exam_date = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "user",
            "nickname",
            "tag",
            "student_id",
            "role",
            "is_admin",
            "avatar",
            "university_icon",
            "selected_exam_date",
            "goal_math",
            "goal_verbal",
            "math_level",
            "verbal_level",
            "phone_number",
            "parent_name",
            "parent_phone",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Ensure admin visibility for staff/superuser accounts even if profile flags are stale.
        if getattr(instance.user, "is_superuser", False) or getattr(instance.user, "is_staff", False):
            data["is_admin"] = True
            if data.get("role") in (None, "", "student"):
                data["role"] = "admin"
        return data

    def get_avatar(self, obj):
        url = obj.avatar
        if not url:
            return None
        # If already absolute, return as is
        if isinstance(url, str) and url.startswith("http"):
            return url
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_university_icon(self, obj):
        url = obj.university_icon
        if not url:
            return None
        if isinstance(url, str) and url.startswith("http"):
            return url
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(url)
        return url

    def get_selected_exam_date(self, obj):
        d = getattr(obj, "selected_exam_date", None)
        if not d:
            return None
        return {"id": d.id, "date": d.date.isoformat()}
