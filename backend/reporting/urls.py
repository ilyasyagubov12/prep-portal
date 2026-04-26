from django.urls import path

from .views import ReportingAttendanceSaveView, ReportingOverviewView, ReportingPaymentSaveView

urlpatterns = [
    path("reports/overview/", ReportingOverviewView.as_view(), name="reports_overview"),
    path("reports/attendance/save/", ReportingAttendanceSaveView.as_view(), name="reports_attendance_save"),
    path("reports/payment/save/", ReportingPaymentSaveView.as_view(), name="reports_payment_save"),
]
