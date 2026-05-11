from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class TokenLoginTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="iyagubov00001",
            email="iyagubov00001@prep.local",
            password="Aslan2001",
        )
        self.url = reverse("token_obtain_pair")

    def test_student_can_log_in_with_username_only(self):
        response = self.client.post(
            self.url,
            {"username": "iyagubov00001", "password": "Aslan2001"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_student_can_log_in_with_full_prep_email(self):
        response = self.client.post(
            self.url,
            {"username": "iyagubov00001@prep.local", "password": "Aslan2001"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
