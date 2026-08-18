from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    """Custom manager since UniEvents authenticates by email, not username."""

    def create_user(self, email, name, role, password=None, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address")
        email = self.normalize_email(email)
        user = self.model(email=email, name=name, role=role, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, name="Admin", password=None, **extra_fields):
        extra_fields.setdefault("role", User.ROLE_INSTITUTE)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        role = extra_fields.pop("role")
        return self.create_user(email, name, role, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """UniEvents account. Role decides which profile (Student/Institute) is attached."""

    ROLE_STUDENT = "student"
    ROLE_INSTITUTE = "institute"
    ROLE_CHOICES = [(ROLE_STUDENT, "Student"), (ROLE_INSTITUTE, "Institute")]

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    city = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name", "role"]

    def __str__(self):
        return f"{self.name} <{self.email}>"


class College(models.Model):
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, unique=True)
    email_domain = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.code})"


class StudentProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="student_profile")
    student_id = models.CharField(max_length=50)
    affiliation = models.CharField(max_length=200)  # college / institution name (free text fallback)
    college = models.ForeignKey(College, null=True, blank=True, on_delete=models.SET_NULL, related_name="students")

    def __str__(self):
        return f"{self.user.name} ({self.student_id})"


class InstituteProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="institute_profile")
    institution_name = models.CharField(max_length=200)
    institution_id = models.CharField(max_length=50, unique=True)
    college = models.ForeignKey(College, null=True, blank=True, on_delete=models.SET_NULL, related_name="admin_profiles")

    def __str__(self):
        return self.institution_name

