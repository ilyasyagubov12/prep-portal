from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from module_practice.models import ModulePractice


class ModulePracticeAdminToolsTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="adminpractice",
            email="adminpractice@prep.local",
            password="Aslan2001",
        )
        self.user.profile.role = "admin"
        self.user.profile.is_admin = True
        self.user.profile.save(update_fields=["role", "is_admin"])
        self.client.force_authenticate(self.user)

    def test_admin_can_rename_practice(self):
        practice = ModulePractice.objects.create(
            title="Old Practice Title",
            created_by=self.user,
            sort_order=0,
        )

        response = self.client.post(
            reverse("module_practice_update"),
            {"practice_id": str(practice.id), "title": "Renamed Practice"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        practice.refresh_from_db()
        self.assertEqual(practice.title, "Renamed Practice")

    def test_admin_can_reorder_practices(self):
        ModulePractice.objects.create(title="Practice 1", created_by=self.user, sort_order=0)
        ModulePractice.objects.create(title="Practice 2", created_by=self.user, sort_order=1)
        third = ModulePractice.objects.create(title="Practice 3", created_by=self.user, sort_order=2)

        response = self.client.post(
            reverse("module_practice_reorder"),
            {"practice_id": str(third.id), "direction": "up"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ordered_titles = list(
            ModulePractice.objects.order_by("sort_order", "-created_at").values_list("title", flat=True)
        )
        self.assertEqual(ordered_titles, ["Practice 1", "Practice 3", "Practice 2"])

        list_response = self.client.get(reverse("module_practice_list"))
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        titles = [practice["title"] for practice in list_response.data["practices"]]
        self.assertEqual(titles, ["Practice 1", "Practice 3", "Practice 2"])
