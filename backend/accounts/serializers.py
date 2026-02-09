from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
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

    def validate(self, attrs):
        data = dict(attrs)
        if not data.get("username") and data.get("email"):
            User = get_user_model()
            user = User.objects.filter(email=data["email"]).first()
            if user:
                data["username"] = user.username
        return super().validate(data)


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
