from django.urls import path
from .views import CourseEventsListView, CourseEventsCreateView, CourseEventsDeleteView

urlpatterns = [
    path("course-events/list/", CourseEventsListView.as_view(), name="course_events_list"),
    path("course-events/create/", CourseEventsCreateView.as_view(), name="course_events_create"),
    path("course-events/delete/", CourseEventsDeleteView.as_view(), name="course_events_delete"),
]
