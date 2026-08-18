from django.contrib.auth import authenticate, login, logout
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import College, User
from .serializers import CollegeSerializer, LoginSerializer, RegisterSerializer, UserSerializer


def _with_profile(user):
    return User.objects.select_related(
        "student_profile", "student_profile__college",
        "institute_profile", "institute_profile__college"
    ).get(pk=user.pk)


@api_view(["GET"])
@permission_classes([AllowAny])
def college_list_view(request):
    role = request.query_params.get("role")
    for_institute = request.query_params.get("for_institute") or request.query_params.get("available_for_institute")
    
    colleges = College.objects.filter(is_active=True)
    if role == User.ROLE_INSTITUTE or for_institute in ["true", "True", "1"]:
        # Exclude colleges that already have an active institutional account
        colleges = colleges.exclude(
            admin_profiles__user__role=User.ROLE_INSTITUTE,
            admin_profiles__user__is_active=True
        )
    colleges = colleges.order_by("name")
    return Response(CollegeSerializer(colleges, many=True).data)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def register_view(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    login(request, user)
    token, _ = Token.objects.get_or_create(user=user)
    return Response(
        {"token": token.key, "user": UserSerializer(_with_profile(user)).data},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"].lower().strip()
    password = serializer.validated_data["password"]
    role = serializer.validated_data["role"]

    try:
        candidate = User.objects.get(email__iexact=email)
        if candidate.is_superuser:
            return Response(
                {"detail": "Developer accounts must log in via the Control Panel portal."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if candidate.role != role:
            return Response(
                {"detail": "No matching account for that role. Try the demo credentials, or create an account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    except User.DoesNotExist:
        return Response(
            {"detail": "No matching account for that role. Try the demo credentials, or create an account."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(request, username=candidate.email, password=password)
    if user is None:
        return Response(
            {"detail": "No matching account for that role. Try the demo credentials, or create an account."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    login(request, user)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": UserSerializer(_with_profile(user)).data})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def control_panel_login_view(request):
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "")

    if not username or not password:
        return Response({"detail": "Username and password are required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        candidate = User.objects.get(email__iexact=username)
        if not candidate.is_superuser:
            return Response({"detail": "Access restricted to developer/superuser accounts only."}, status=status.HTTP_403_FORBIDDEN)
    except User.DoesNotExist:
        return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)

    user = authenticate(request, username=candidate.email, password=password)
    if user is None:
        return Response({"detail": "Invalid credentials."}, status=status.HTTP_400_BAD_REQUEST)

    login(request, user)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": UserSerializer(_with_profile(user)).data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def control_panel_users_view(request):
    if not request.user.is_superuser:
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
    
    users = User.objects.select_related("student_profile", "institute_profile").all().order_by("-date_joined")
    data = []
    for u in users:
        profile_details = {}
        if u.role == User.ROLE_STUDENT and hasattr(u, "student_profile"):
            profile_details = {
                "student_id": u.student_profile.student_id,
                "affiliation": u.student_profile.affiliation,
            }
        elif u.role == User.ROLE_INSTITUTE and hasattr(u, "institute_profile"):
            profile_details = {
                "institution_name": u.institute_profile.institution_name,
                "institution_id": u.institute_profile.institution_id,
            }
        
        data.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "city": u.city,
            "is_active": u.is_active,
            "is_staff": u.is_staff,
            "is_superuser": u.is_superuser,
            "date_joined": u.date_joined.isoformat() if u.date_joined else None,
            **profile_details
        })
        
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    try:
        logout(request)
    except Exception:
        pass
    Token.objects.filter(user=request.user).delete()
    return Response({"detail": "Logged out."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_view(request):
    return Response(UserSerializer(_with_profile(request.user)).data)
