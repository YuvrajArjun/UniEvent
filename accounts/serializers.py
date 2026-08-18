from rest_framework import serializers

from .models import College, InstituteProfile, StudentProfile, User


class CollegeSerializer(serializers.ModelSerializer):
    class Meta:
        model = College
        fields = ["id", "name", "code", "email_domain", "is_active"]


class UserSerializer(serializers.ModelSerializer):
    """Serializes a User with flattened profile and college details."""

    student_id = serializers.SerializerMethodField()
    affiliation = serializers.SerializerMethodField()
    institution_name = serializers.SerializerMethodField()
    institution_id = serializers.SerializerMethodField()
    college_id = serializers.SerializerMethodField()
    college_name = serializers.SerializerMethodField()
    college_code = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "role", "name", "email", "city",
            "student_id", "affiliation", "institution_name", "institution_id",
            "college_id", "college_name", "college_code",
            "is_superuser",
        ]

    def _get_college(self, obj):
        if obj.role == User.ROLE_STUDENT and hasattr(obj, "student_profile"):
            return obj.student_profile.college
        if obj.role == User.ROLE_INSTITUTE and hasattr(obj, "institute_profile"):
            return obj.institute_profile.college
        return None

    def get_student_id(self, obj):
        return getattr(getattr(obj, "student_profile", None), "student_id", None)

    def get_affiliation(self, obj):
        profile = getattr(obj, "student_profile", None)
        if profile:
            return profile.college.name if profile.college else profile.affiliation
        return None

    def get_institution_name(self, obj):
        profile = getattr(obj, "institute_profile", None)
        if profile:
            return profile.college.name if profile.college else profile.institution_name
        return None

    def get_institution_id(self, obj):
        return getattr(getattr(obj, "institute_profile", None), "institution_id", None)

    def get_college_id(self, obj):
        college = self._get_college(obj)
        return college.id if college else None

    def get_college_name(self, obj):
        college = self._get_college(obj)
        return college.name if college else None

    def get_college_code(self, obj):
        college = self._get_college(obj)
        return college.code if college else None


class RegisterSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=User.ROLE_CHOICES)
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=6, write_only=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    college_id = serializers.IntegerField(required=False, allow_null=True)

    # student-only
    student_id = serializers.CharField(max_length=50, required=False, allow_blank=True)
    affiliation = serializers.CharField(max_length=200, required=False, allow_blank=True)

    # institute-only
    institution_name = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account already exists with that email.")
        return value

    def validate(self, attrs):
        role = attrs.get("role")
        college_id = attrs.get("college_id")
        if role == User.ROLE_INSTITUTE and college_id:
            active_exists = InstituteProfile.objects.filter(
                college_id=college_id,
                user__role=User.ROLE_INSTITUTE,
                user__is_active=True,
            ).exists()
            if active_exists:
                raise serializers.ValidationError("This institution already has an active institutional account.")
        return attrs

    def create(self, validated_data):
        from django.db import transaction

        role = validated_data["role"]
        c_id = validated_data.get("college_id")

        with transaction.atomic():
            college_obj = None
            if c_id:
                college_obj = College.objects.select_for_update().filter(pk=c_id, is_active=True).first()

            if role == User.ROLE_INSTITUTE and college_obj:
                active_exists = InstituteProfile.objects.filter(
                    college=college_obj,
                    user__role=User.ROLE_INSTITUTE,
                    user__is_active=True,
                ).exists()
                if active_exists:
                    raise serializers.ValidationError("This institution already has an active institutional account.")

            user = User.objects.create_user(
                email=validated_data["email"],
                name=validated_data["name"],
                role=role,
                password=validated_data["password"],
                city=validated_data.get("city", ""),
            )

            if role == User.ROLE_STUDENT:
                aff = college_obj.name if college_obj else (validated_data.get("affiliation", "") or "")
                StudentProfile.objects.create(
                    user=user,
                    student_id=validated_data.get("student_id", ""),
                    affiliation=aff,
                    college=college_obj,
                )
            else:
                import time
                institution_id = f"INST-{int(time.time() * 1000) % 100000}"
                inst_name = college_obj.name if college_obj else (validated_data.get("institution_name", "") or "")
                InstituteProfile.objects.create(
                    user=user,
                    institution_name=inst_name,
                    institution_id=institution_id,
                    college=college_obj,
                )
            return user


class LoginSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=User.ROLE_CHOICES)
    email = serializers.CharField()
    password = serializers.CharField(write_only=True)

