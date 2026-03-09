from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_profile_streak_offset"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="tag",
            field=models.CharField(blank=True, max_length=120, null=True),
        ),
    ]
