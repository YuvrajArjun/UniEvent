from django.core.management.base import BaseCommand
from accounts.models import College, User, InstituteProfile, StudentProfile
from events.models import Event


COLLEGES_DATA = [
    {"name": "PCP Polytechnic", "code": "0056", "email_domain": "pcp.edu.in"},
    {"name": "DY Patil Polytechnic", "code": "0112", "email_domain": "dypatil.edu.in"},
    {"name": "AISSMS Polytechnic", "code": "0089", "email_domain": "aissms.edu.in"},
    {"name": "JSPM Polytechnic", "code": "0203", "email_domain": "jspm.edu.in"},
    {"name": "Fergusson College", "code": "0021", "email_domain": "fergusson.edu"},
    {"name": "MIT World Peace University", "code": "0145", "email_domain": "mitwpu.edu.in"},
]


class Command(BaseCommand):
    help = "Seed initial colleges and associate existing users and events."

    def handle(self, *args, **kwargs):
        created_count = 0
        colleges_map = {}
        for item in COLLEGES_DATA:
            college, created = College.objects.get_or_create(
                code=item["code"],
                defaults={
                    "name": item["name"],
                    "email_domain": item["email_domain"],
                    "is_active": True,
                },
            )
            colleges_map[college.name.lower()] = college
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"Created College: {college.name} ({college.code})"))
            else:
                self.stdout.write(f"College already exists: {college.name}")

        pcp_college = College.objects.filter(code="0056").first()
        fergusson_college = College.objects.filter(code="0021").first()

        # Update existing student profiles matching names/affiliations
        for student_prof in StudentProfile.objects.all():
            if not student_prof.college:
                aff = (student_prof.affiliation or "").lower()
                matched = None
                for c_name, c_obj in colleges_map.items():
                    if c_name in aff or aff in c_name:
                        matched = c_obj
                        break
                if matched:
                    student_prof.college = matched
                    student_prof.save()
                    self.stdout.write(f"Linked Student {student_prof.user.email} to {matched.name}")
                elif pcp_college:
                    student_prof.college = pcp_college
                    student_prof.save()
                    self.stdout.write(f"Default-linked Student {student_prof.user.email} to {pcp_college.name}")

        # Update existing institute profiles
        for inst_prof in InstituteProfile.objects.all():
            if not inst_prof.college:
                name = (inst_prof.institution_name or "").lower()
                matched = None
                for c_name, c_obj in colleges_map.items():
                    if c_name in name or name in c_name:
                        matched = c_obj
                        break
                if matched:
                    inst_prof.college = matched
                    inst_prof.save()
                    self.stdout.write(f"Linked Institute Admin {inst_prof.user.email} to {matched.name}")
                elif fergusson_college:
                    inst_prof.college = fergusson_college
                    inst_prof.save()
                    self.stdout.write(f"Default-linked Institute Admin {inst_prof.user.email} to {fergusson_college.name}")

        # Update existing events
        for event in Event.objects.all():
            if not event.college:
                inst = (event.institution or "").lower()
                matched = None
                for c_name, c_obj in colleges_map.items():
                    if c_name in inst or inst in c_name:
                        matched = c_obj
                        break
                if matched:
                    event.college = matched
                    event.save()
                    self.stdout.write(f"Linked Event '{event.title}' to {matched.name}")
                elif pcp_college:
                    event.college = pcp_college
                    event.save()
                    self.stdout.write(f"Default-linked Event '{event.title}' to {pcp_college.name}")

        self.stdout.write(self.style.SUCCESS(f"Seeding completed successfully. New colleges created: {created_count}"))
