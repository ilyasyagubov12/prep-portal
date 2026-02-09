from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
import os


class Command(BaseCommand):
    help = "Ensure a superuser exists based on env vars."

    def handle(self, *args, **options):
        username = os.getenv("DJANGO_SUPERUSER_USERNAME", "").strip()
        email = os.getenv("DJANGO_SUPERUSER_EMAIL", "").strip()
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD", "").strip()

        if not username or not password:
            self.stdout.write(self.style.WARNING("Missing DJANGO_SUPERUSER_USERNAME or DJANGO_SUPERUSER_PASSWORD"))
            return

        User = get_user_model()
        user = User.objects.filter(username=username).first()
        if user:
            # Ensure admin has the right password and privileges
            user.set_password(password)
            user.is_staff = True
            user.is_superuser = True
            if email:
                user.email = email
            user.save(update_fields=["password", "is_staff", "is_superuser", "email"])
            self.stdout.write(self.style.SUCCESS("Admin user updated."))
            return

        user = User.objects.create_superuser(username=username, email=email, password=password)
        self.stdout.write(self.style.SUCCESS(f"Created admin: {user.username}"))
