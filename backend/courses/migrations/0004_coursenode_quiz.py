from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("courses", "0003_coursenode"),
    ]

    operations = [
        migrations.AddField(
            model_name="coursenode",
            name="quiz_id",
            field=models.UUIDField(blank=True, null=True),
        ),
    ]
