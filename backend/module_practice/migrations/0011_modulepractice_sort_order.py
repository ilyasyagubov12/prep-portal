from django.db import migrations, models


def seed_sort_order(apps, schema_editor):
    ModulePractice = apps.get_model("module_practice", "ModulePractice")
    practices = list(ModulePractice.objects.order_by("created_at", "id"))
    for index, practice in enumerate(practices):
        practice.sort_order = index
    if practices:
        ModulePractice.objects.bulk_update(practices, ["sort_order"])


class Migration(migrations.Migration):

    dependencies = [
        ("module_practice", "0010_modulepractice_result_visibility_mode_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="modulepractice",
            name="sort_order",
            field=models.IntegerField(default=0),
        ),
        migrations.RunPython(seed_sort_order, migrations.RunPython.noop),
    ]
