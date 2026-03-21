from django.conf import settings
from django.db import migrations, models


def sync_visibility_mode(apps, schema_editor):
    ModulePractice = apps.get_model("module_practice", "ModulePractice")
    for practice in ModulePractice.objects.all().only("id", "results_published"):
        practice.result_visibility_mode = "all" if practice.results_published else "hidden"
        practice.save(update_fields=["result_visibility_mode"])


class Migration(migrations.Migration):

    dependencies = [
        ("module_practice", "0009_modulepractice_allowed_courses"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="modulepractice",
            name="result_visibility_mode",
            field=models.CharField(
                choices=[
                    ("hidden", "Hidden"),
                    ("all", "Visible to all students"),
                    ("selected", "Visible to selected students only"),
                ],
                default="hidden",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="modulepractice",
            name="result_visible_students",
            field=models.ManyToManyField(
                blank=True,
                related_name="module_practices_result_visible",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(sync_visibility_mode, migrations.RunPython.noop),
    ]
