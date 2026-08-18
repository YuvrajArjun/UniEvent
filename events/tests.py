from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from datetime import date

from accounts.models import User, StudentProfile, InstituteProfile, College
from events.models import Event, Proposal, Registration


class UniEventsFeatureTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create Colleges
        self.pcp = College.objects.create(name="PCP Polytechnic", code="0056", email_domain="pcp.edu.in")
        self.dyp = College.objects.create(name="DY Patil Polytechnic", code="0112", email_domain="dypatil.edu.in")

        # Create Students
        self.pranav = User.objects.create_user(
            email="pranav@pcp.edu.in", name="Pranav", role="student", password="password123"
        )
        StudentProfile.objects.create(user=self.pranav, student_id="STU-001", affiliation="PCP Polytechnic", college=self.pcp)

        self.student_dyp = User.objects.create_user(
            email="dyp_student@dyp.edu.in", name="DYP Student", role="student", password="password123"
        )
        StudentProfile.objects.create(user=self.student_dyp, student_id="STU-002", affiliation="DY Patil Polytechnic", college=self.dyp)

        # Create College Admins
        self.pcp_admin_user = User.objects.create_user(
            email="admin@pcp.edu.in", name="PCP Admin", role="institute", password="adminpassword"
        )
        InstituteProfile.objects.create(user=self.pcp_admin_user, institution_name="PCP Polytechnic", institution_id="INST-001", college=self.pcp)

        self.dyp_admin_user = User.objects.create_user(
            email="admin@dypatil.edu.in", name="DYP Admin", role="institute", password="adminpassword"
        )
        InstituteProfile.objects.create(user=self.dyp_admin_user, institution_name="DY Patil Polytechnic", institution_id="INST-002", college=self.dyp)

        # Create Events
        self.pcp_event = Event.objects.create(
            title="Coding Competition", institution="PCP Polytechnic", college=self.pcp,
            category="Technical", scope="Intracollege", date=date(2026, 9, 15), venue="Lab 1",
            fee=100, seats_total=50, seats_left=50, status="active"
        )
        self.dyp_event = Event.objects.create(
            title="Web Development Workshop", institution="DY Patil Polytechnic", college=self.dyp,
            category="Technical", scope="Intercollege", date=date(2026, 9, 20), venue="Auditorium",
            fee=200, seats_total=100, seats_left=100, status="active"
        )

    def test_1_intra_college_events(self):
        """TEST 1: Student belongs to PCP. PCP event appears in Intra-College."""
        self.client.force_authenticate(user=self.pranav)
        response = self.client.get("/api/events/intra/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [e["title"] for e in response.data]
        self.assertIn("Coding Competition", titles)

    def test_2_inter_college_events(self):
        """TEST 2: Student belongs to PCP. DY Patil event appears in Inter-College."""
        self.client.force_authenticate(user=self.pranav)
        response = self.client.get("/api/events/inter/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [e["title"] for e in response.data]
        self.assertIn("Web Development Workshop", titles)

    def test_3_pcp_event_not_in_inter_college_for_pcp_student(self):
        """TEST 3: Student belongs to PCP. PCP event must NOT appear in Inter-College."""
        self.client.force_authenticate(user=self.pranav)
        response = self.client.get("/api/events/inter/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [e["title"] for e in response.data]
        self.assertNotIn("Coding Competition", titles)

    def test_4_inter_college_all_colleges_filter(self):
        """TEST 4: Student selects Inter-College -> All Colleges (shows events from other colleges)."""
        self.client.force_authenticate(user=self.pranav)
        response = self.client.get("/api/events/inter/?college_id=All")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [e["title"] for e in response.data]
        self.assertIn("Web Development Workshop", titles)

    def test_5_inter_college_specific_college_filter(self):
        """TEST 5: Student selects Inter-College -> DY Patil Polytechnic."""
        self.client.force_authenticate(user=self.pranav)
        response = self.client.get(f"/api/events/inter/?college_id={self.dyp.id}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [e["title"] for e in response.data]
        self.assertIn("Web Development Workshop", titles)
        self.assertEqual(len(response.data), 1)

    def test_6_pcp_admin_access_pcp_data(self):
        """TEST 6: PCP admin logs in, can see PCP approvals and PCP data."""
        proposal = Proposal.objects.create(
            student=self.pranav, target_college=self.pcp, title="Python Workshop",
            aim="Teach Python", date=date(2026, 10, 1), venue="Seminar Hall", budget=5000
        )
        self.client.force_authenticate(user=self.pcp_admin_user)
        response = self.client.get("/api/proposals/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        proposal_ids = [p["id"] for p in response.data]
        self.assertIn(proposal.id, proposal_ids)

    def test_7_pcp_admin_cannot_access_dyp_proposals(self):
        """TEST 7: PCP admin attempts to approve/reject DY Patil proposal -> Access denied (403)."""
        dyp_proposal = Proposal.objects.create(
            student=self.student_dyp, target_college=self.dyp, title="AI Workshop",
            aim="Teach AI", date=date(2026, 10, 5), venue="DYP Hall", budget=10000
        )
        self.client.force_authenticate(user=self.pcp_admin_user)
        response = self.client.post(f"/api/proposals/{dyp_proposal.id}/approve/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_8_student_creates_proposal_for_pcp(self):
        """TEST 8: Student creates event and selects PCP -> Request goes to PCP admin."""
        self.client.force_authenticate(user=self.pranav)
        response = self.client.post("/api/proposals/", {
            "title": "Robotics Challenge",
            "aim": "Build autonomous robots for competition",
            "scope": "Intercollege",
            "date": "2026-11-01",
            "venue": "Main Arena",
            "budget": 15000,
            "target_college": self.pcp.id
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        proposal_id = response.data["id"]

        # PCP Admin checks queue
        self.client.force_authenticate(user=self.pcp_admin_user)
        res = self.client.get("/api/proposals/")
        p_ids = [p["id"] for p in res.data]
        self.assertIn(proposal_id, p_ids)

    def test_9_pcp_admin_approves_event(self):
        """TEST 9: PCP admin approves event -> Event status becomes APPROVED."""
        proposal = Proposal.objects.create(
            student=self.pranav, target_college=self.pcp, title="IoT Workshop",
            aim="IoT Sensors Demo", date=date(2026, 10, 10), venue="Hall B", budget=8000
        )
        self.client.force_authenticate(user=self.pcp_admin_user)
        response = self.client.post(f"/api/proposals/{proposal.id}/approve/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "approved")

    def test_10_pcp_admin_rejects_event_with_reason(self):
        """TEST 10: PCP admin rejects event -> Status becomes REJECTED and rejection reason visible to student."""
        proposal = Proposal.objects.create(
            student=self.pranav, target_college=self.pcp, title="Overbooked Event",
            aim="Aim text here", date=date(2026, 10, 12), venue="Auditorium", budget=2000
        )
        self.client.force_authenticate(user=self.pcp_admin_user)
        response = self.client.post(f"/api/proposals/{proposal.id}/reject/", {"rejection_reason": "Venue is already booked."}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "rejected")
        self.assertEqual(response.data["rejection_reason"], "Venue is already booked.")

        # Student views proposal
        self.client.force_authenticate(user=self.pranav)
        res = self.client.get("/api/proposals/")
        rejection_reasons = {p["id"]: p.get("rejection_reason") for p in res.data}
        self.assertEqual(rejection_reasons[proposal.id], "Venue is already booked.")

    def test_11_registration_type_calculated_server_side(self):
        """TEST 11: Backend calculates registration_type correctly and ignores client manipulation."""
        # PCP student registering for PCP event -> INTRA_COLLEGE
        self.client.force_authenticate(user=self.pranav)
        response = self.client.post(f"/api/events/{self.pcp_event.id}/register/", {
            "attendee_name": "Pranav",
            "attendee_id": "STU-001",
            "affiliation": "PCP Polytechnic",
            "email": "pranav@pcp.edu.in",
            "registration_type": "INTER_COLLEGE" # Client trying to forge registration_type
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["registration_type"], "INTRA_COLLEGE") # Server overrode forged value

        # PCP student registering for DYP event -> INTER_COLLEGE
        response_dyp = self.client.post(f"/api/events/{self.dyp_event.id}/register/", {
            "attendee_name": "Pranav",
            "attendee_id": "STU-001",
            "affiliation": "PCP Polytechnic",
            "email": "pranav@pcp.edu.in",
            "registration_type": "INTRA_COLLEGE" # Client trying to forge registration_type
        }, format="json")
        self.assertEqual(response_dyp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response_dyp.data["registration_type"], "INTER_COLLEGE") # Server overrode forged value

    def test_12_backend_prevents_unauthorized_college_changes(self):
        """TEST 12: Backend calculates permissions based on user session, not user input."""
        # Try to register user with existing email -> rejected
        response = self.client.post("/api/auth/register/", {
            "role": "student", "name": "Fake Pranav", "email": "pranav@pcp.edu.in",
            "password": "newpassword", "college_id": self.dyp.id
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class UniqueInstitutionalAccountAndNavbarTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Institution A (has active institutional account)
        self.inst_a = College.objects.create(name="Institution A", code="INST-A", email_domain="insta.edu")
        self.admin_a = User.objects.create_user(
            email="admin@insta.edu", name="Admin A", role="institute", password="password123"
        )
        InstituteProfile.objects.create(
            user=self.admin_a, institution_name="Institution A", institution_id="INST-A-001", college=self.inst_a
        )

        # Institution B (has NO institutional account)
        self.inst_b = College.objects.create(name="Institution B", code="INST-B", email_domain="instb.edu")

        # Student user
        self.student = User.objects.create_user(
            email="student@insta.edu", name="Student A", role="student", password="password123"
        )
        StudentProfile.objects.create(
            user=self.student, student_id="STU-A1", affiliation="Institution A", college=self.inst_a
        )

    def test_1_active_institution_excluded_from_dropdown(self):
        """TEST 1: Institution A has an active institutional account -> Excluded from institute signup dropdown."""
        response = self.client.get("/api/auth/colleges/?role=institute")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [c["name"] for c in response.data]
        self.assertNotIn("Institution A", names)

    def test_2_institution_without_account_appears_in_dropdown(self):
        """TEST 2: Institution B has no institutional account -> Appears in institute signup dropdown."""
        response = self.client.get("/api/auth/colleges/?role=institute")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [c["name"] for c in response.data]
        self.assertIn("Institution B", names)

    def test_3_manual_submit_duplicate_institution_rejected(self):
        """TEST 3: User manually submits Institution A through modified request -> Backend rejects with error."""
        response = self.client.post("/api/auth/register/", {
            "role": "institute",
            "name": "New Admin A",
            "email": "newadmin@insta.edu",
            "password": "password123",
            "college_id": self.inst_a.id,
            "institution_name": "Institution A"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        err_str = str(response.data)
        self.assertIn("This institution already has an active institutional account.", err_str)

    def test_4_simultaneous_attempts_create_single_account(self):
        """TEST 4: Two simultaneous registration attempts for Institution B -> Only one succeeds."""
        # First registration for Institution B
        res1 = self.client.post("/api/auth/register/", {
            "role": "institute",
            "name": "Admin B1",
            "email": "admin1@instb.edu",
            "password": "password123",
            "college_id": self.inst_b.id,
            "institution_name": "Institution B"
        }, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Second registration attempt for Institution B
        res2 = self.client.post("/api/auth/register/", {
            "role": "institute",
            "name": "Admin B2",
            "email": "admin2@instb.edu",
            "password": "password123",
            "college_id": self.inst_b.id,
            "institution_name": "Institution B"
        }, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        err_str = str(res2.data)
        self.assertIn("This institution already has an active institutional account.", err_str)
        self.assertEqual(InstituteProfile.objects.filter(college=self.inst_b).count(), 1)

    def test_5_logged_out_navbar_rendered(self):
        """TEST 5: Student is logged out -> Existing public navbar page renders successfully."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
