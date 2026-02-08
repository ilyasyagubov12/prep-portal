from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    MeView,
    ProfileUpdateView,
    GoalScoreUpdateView,
    AvatarUploadView,
    UniversityIconUploadView,
    AdminCreateUserView,
    AdminSearchUsersView,
    AdminUpdateUserView,
    AdminDeleteUserView,
    BootstrapAdminView,
)

urlpatterns = [
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("profile/", ProfileUpdateView.as_view(), name="profile_update"),
    path("goal-score/", GoalScoreUpdateView.as_view(), name="goal_score_update"),
    path("avatar/", AvatarUploadView.as_view(), name="avatar_upload"),
    path("university-icon/", UniversityIconUploadView.as_view(), name="university_icon_upload"),
    path("admin/users/create/", AdminCreateUserView.as_view(), name="admin_users_create"),
    path("admin/users/search/", AdminSearchUsersView.as_view(), name="admin_users_search"),
    path("admin/users/<uuid:user_id>/", AdminUpdateUserView.as_view(), name="admin_users_update"),
    path("admin/users/<uuid:user_id>/delete/", AdminDeleteUserView.as_view(), name="admin_users_delete"),
    path("bootstrap/", BootstrapAdminView.as_view(), name="bootstrap_admin"),
]
