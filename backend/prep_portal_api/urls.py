"""
URL configuration for prep_portal_api project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
import os
from django.conf.urls.static import static
from django.contrib import admin
from django.http import Http404
from django.urls import re_path
from django.urls import path, include
from accounts.views import AdminCreateUserView, AdminSearchUsersView, AdminUpdateUserView, AdminDeleteUserView
from grades_stub import grades_me, grades_offline


def block_protected_media(_request, path):  # pragma: no cover - trivial routing guard
    raise Http404()

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("courses.urls")),
    path("api/", include("events.urls")),
    path("api/", include("assignments.urls")),
    path("api/", include("question_bank.urls")),
    path("api/", include("streaks.urls")),
    path("api/", include("vocab.urls")),
    path("api/", include("exam_dates.urls")),
    path("api/", include("module_practice.urls")),
    path("api/", include("mock_exams.urls")),
    path("api/", include("reporting.urls")),
    # Temporary gradebook stubs
    path("api/grades/me/", grades_me, name="grades_me"),
    path("api/grades/offline/", grades_offline, name="grades_offline"),
    # Backwards-compatible aliases for admin user endpoints expected by the frontend
    path("api/admin/users/create/", AdminCreateUserView.as_view(), name="alias_admin_users_create"),
    path("api/admin/users/search/", AdminSearchUsersView.as_view(), name="alias_admin_users_search"),
    path("api/admin/users/<uuid:user_id>/", AdminUpdateUserView.as_view(), name="alias_admin_users_update"),
    path("api/admin/users/<uuid:user_id>/delete/", AdminDeleteUserView.as_view(), name="alias_admin_users_delete"),
    re_path(
        r"^media/(?P<path>(course_files|assignment_attachments|assignment_submissions)/.*)$",
        block_protected_media,
        name="block_protected_media",
    ),
]

# Always serve local MEDIA files when a media root is configured.
# This keeps localhost images (avatars/question images) working even if DEBUG is false.
if settings.MEDIA_URL and settings.MEDIA_ROOT:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
