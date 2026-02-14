from django.urls import path
from .views import (
    ModulePracticeListView,
    ModulePracticeCreateView,
    ModulePracticeUpdateView,
    ModulePracticeDeleteView,
    ModulePracticeModuleSetView,
    ModulePracticeAccessGrantView,
    ModulePracticeAccessRevokeView,
    ModulePracticeStartView,
    ModulePracticeSubmitView,
)

urlpatterns = [
    path("module-practice/list/", ModulePracticeListView.as_view(), name="module_practice_list"),
    path("module-practice/create/", ModulePracticeCreateView.as_view(), name="module_practice_create"),
    path("module-practice/update/", ModulePracticeUpdateView.as_view(), name="module_practice_update"),
    path("module-practice/delete/", ModulePracticeDeleteView.as_view(), name="module_practice_delete"),
    path("module-practice/modules/set/", ModulePracticeModuleSetView.as_view(), name="module_practice_module_set"),
    path("module-practice/access/grant/", ModulePracticeAccessGrantView.as_view(), name="module_practice_access_grant"),
    path("module-practice/access/revoke/", ModulePracticeAccessRevokeView.as_view(), name="module_practice_access_revoke"),
    path("module-practice/start/", ModulePracticeStartView.as_view(), name="module_practice_start"),
    path("module-practice/submit/", ModulePracticeSubmitView.as_view(), name="module_practice_submit"),
]
