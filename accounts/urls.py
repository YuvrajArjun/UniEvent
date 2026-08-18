from django.urls import path

from . import views

urlpatterns = [
    path("colleges/", views.college_list_view, name="college-list"),
    path("register/", views.register_view, name="auth-register"),
    path("login/", views.login_view, name="auth-login"),
    path("logout/", views.logout_view, name="auth-logout"),
    path("me/", views.me_view, name="auth-me"),
    path("control-panel/login/", views.control_panel_login_view, name="auth-control-panel-login"),
    path("control-panel/users/", views.control_panel_users_view, name="auth-control-panel-users"),
]
