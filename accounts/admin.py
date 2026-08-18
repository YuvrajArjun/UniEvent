from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import College, InstituteProfile, StudentProfile, User


@admin.register(College)
class CollegeAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "email_domain", "is_active"]
    search_fields = ["name", "code"]
    list_filter = ["is_active"]


class StudentProfileInline(admin.StackedInline):
    model = StudentProfile
    can_delete = False


class InstituteProfileInline(admin.StackedInline):
    model = InstituteProfile
    can_delete = False


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    model = User
    ordering = ["email"]
    list_display = ["email", "name", "role", "city", "is_staff"]
    list_filter = ["role", "is_staff", "is_active"]
    search_fields = ["email", "name"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("name", "role", "city")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "name", "role", "password1", "password2"),
        }),
    )
    inlines = []

    def get_inline_instances(self, request, obj=None):
        if not obj:
            return []
        if obj.role == User.ROLE_STUDENT:
            return [StudentProfileInline(self.model, self.admin_site)]
        if obj.role == User.ROLE_INSTITUTE:
            return [InstituteProfileInline(self.model, self.admin_site)]
        return []


admin.site.register(StudentProfile)
admin.site.register(InstituteProfile)

