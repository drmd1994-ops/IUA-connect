# MASTER CLAUDE CODE PROMPT
# PROJECT: IUA CONNECT
# Israeli Urological Association Digital Platform

You are the lead software architect, senior full-stack engineer,
mobile developer, DevOps engineer, cybersecurity engineer,
database architect, UX/UI engineer, QA engineer, and AI engineer
for this project.

Your task is to design and build a production-grade digital platform
called:

IUA CONNECT

"The Digital Home of Israeli Urology"

The platform is intended to support the Israeli Urological Association
(IUA), its members, residents, fellows, subspecialty groups,
researchers, educators, conference organizers and administrators.

IMPORTANT:
This is a professional healthcare association platform.

Do NOT treat this as a generic social-media application.

The system must prioritize:
- Security
- Privacy
- Reliability
- Scalability
- Accessibility
- Maintainability
- Auditability
- Evidence-based medical information
- Israeli healthcare/privacy requirements
- Professional governance

==================================================
1. PRODUCT OBJECTIVE
==================================================

Build a unified digital ecosystem for Israeli urology.

The platform must support:

1. Professional networking
2. Association membership
3. Education
4. CME
5. Conferences
6. Clinical knowledge
7. Case discussions
8. Research collaboration
9. Resident education
10. Mentorship
11. Jobs and fellowships
12. Professional messaging
13. Association governance
14. Notifications
15. Evidence-grounded AI assistance
16. Administrative management

The product must be designed so additional healthcare
functionality can be added later without rewriting the core system.

==================================================
2. TECHNOLOGY STACK
==================================================

Mobile:
- React Native
- Expo
- TypeScript

Web:
- Next.js
- TypeScript
- Tailwind CSS

Backend:
- Node.js
- NestJS
- TypeScript

Database:
- PostgreSQL
- Prisma ORM

Cache:
- Redis

Storage:
- S3-compatible object storage

Authentication:
- OAuth 2.0 / OpenID Connect
- JWT with secure refresh-token architecture
- MFA
- Biometric authentication on supported devices

API:
- REST initially
- GraphQL may be introduced where justified

Infrastructure:
- Docker
- CI/CD
- Infrastructure as Code
- Separate development/staging/production environments

Testing:
- Jest
- React Native Testing Library
- Playwright
- API integration tests
- Security tests

==================================================
3. ARCHITECTURE
==================================================

Use modular architecture.

Core backend modules:

AuthModule
UsersModule
ProfilesModule
MembershipModule
EventsModule
EducationModule
GuidelinesModule
CmeModule
CommunityModule
CasesModule
ResearchModule
PublicationsModule
MessagingModule
NotificationsModule
JobsModule
MentorshipModule
GovernanceModule
PaymentsModule
AiModule
SearchModule
AnalyticsModule
AuditModule
AdminModule
FileStorageModule

Use clean architecture principles.

Avoid tightly coupled modules.

Every module should have:
- Controller
- Service
- Repository/data access layer
- DTOs
- Validation
- Authorization rules
- Tests

==================================================
4. USER ROLES
==================================================

Implement RBAC.

Roles:

SUPER_ADMIN
IUA_ADMIN
CONTENT_EDITOR
EVENT_ADMIN
RESEARCH_ADMIN
SUBSPECIALTY_ADMIN
CME_ADMIN
FULL_MEMBER
NON_FULL_MEMBER
RESIDENT
STUDENT
HONORARY_MEMBER
GUEST

Permissions must be granular.

Never rely solely on frontend permissions.

All authorization must also be enforced server-side.

==================================================
5. AUTHENTICATION
==================================================

Implement:

- Email/password
- Password reset
- Email verification
- MFA
- OAuth/OIDC-ready architecture
- Biometric login
- Secure refresh tokens
- Session management
- Device registration
- Remote session revocation

Security requirements:

- Password hashing using Argon2id
- No plaintext passwords
- Secure cookies on web
- Token rotation
- Rate limiting
- Brute-force protection
- Suspicious-login detection
- Audit logging

==================================================
6. USER PROFILE
==================================================

Profile fields:

- First name
- Last name
- Hebrew name
- English name
- Profile photo
- Professional title
- Hospital
- Department
- Subspecialties
- Position
- Professional biography
- Research interests
- ORCID
- Publications
- Languages
- Professional contact information
- Visibility settings

Privacy controls must allow users to control
which information is publicly visible.

==================================================
7. MEMBERSHIP
==================================================

Implement:

Membership types
Membership status
Start date
Expiration date
Payment status
Membership history
Digital membership card

Digital card must use a secure QR identifier.

Do not encode sensitive information directly into QR codes.

Support future integration with IMA membership systems.

==================================================
8. HOME DASHBOARD
==================================================

Create personalized home dashboard.

Sections:

IUA News
Upcoming Events
Educational Content
Research Opportunities
Community Activity
CME Progress
Notifications
Quick Actions

Quick actions:

Create Case
Post Research
Ask Community
Find Colleague
Browse Guidelines
Open Calculator

==================================================
9. NEWS
==================================================

Create CMS-driven news system.

Fields:

title
summary
body
author
category
tags
publication_date
featured_image
attachments
references
status

Statuses:

draft
review
scheduled
published
archived

Support:
- Hebrew
- English
- Arabic

Use localization architecture from day one.

==================================================
10. EVENTS
==================================================

Event entity:

id
title
description
start_date
end_date
location
address
map_coordinates
organizer
category
image
registration_url
cme_available

Event session:

title
speaker
room
start_time
end_time
description
materials

Features:

- Event registration
- Personal schedule
- Calendar export
- Push reminders
- QR attendance
- CME tracking
- Speaker profiles
- Abstracts
- Event documents

==================================================
11. CONFERENCE MODE
==================================================

During active conferences provide:

NOW
NEXT
MY SCHEDULE

Allow:

- session reminders
- speaker information
- live polls
- audience questions
- session feedback
- CME attendance

==================================================
12. EDUCATION
==================================================

Create IUA Academy.

Content types:

VIDEO
ARTICLE
PDF
PRESENTATION
PODCAST
WEBINAR
SURGICAL_VIDEO
CASE
COURSE

Metadata:

title
description
author
subspecialty
level
duration
CME_points
references
publication_date

Levels:

STUDENT
RESIDENT
FELLOW
SPECIALIST
EXPERT

==================================================
13. CME
==================================================

Track CME activities.

Entities:

CmeActivity
CmeRecord
Certificate

Track:

user
activity
date
credits
verification
certificate

Allow certificate generation.

==================================================
14. GUIDELINES
==================================================

Create guideline library.

Do not reproduce copyrighted guidelines
without appropriate permission.

Support:

- licensed documents
- official links
- IUA-authored summaries
- guideline metadata
- version tracking
- publication date
- evidence level

Every guideline must have:
source
date
version
status

==================================================
15. CLINICAL CALCULATORS
==================================================

Create modular calculator framework.

Initial calculators:

IPSS
SHIM
IIEF
PSA density
PSA velocity
RENAL score
PADUA
STONE score
TNM
Creatinine clearance
eGFR
Stone parameters

Each calculator must contain:

Inputs
Validation
Calculation
Result
Interpretation
Reference
Disclaimer

Calculations must be unit-tested extensively.

==================================================
16. CASE DISCUSSION
==================================================

Create Case of the Week.

Case fields:

title
age_range
sex
history
labs
imaging
pathology
question
subspecialty
author
status

IMPORTANT:

Do not allow identifiable patient information
in standard case discussions.

Implement:
- automated PII warning
- moderation
- reporting
- administrator review

Comments:
threaded
editable
reportable

Voting:
optional
anonymous where appropriate

==================================================
17. COMMUNITY
==================================================

Create professional communities.

Subspecialties:

Uro-Oncology
Endourology
Functional Urology
Pediatric Urology
Andrology
Reconstructive Urology
Transplant
Female Urology
Community Urology
Urolithiasis
Robotic Surgery

Users can:

- post
- comment
- react
- bookmark
- report
- follow topics

Implement moderation.

==================================================
18. RESEARCH
==================================================

Create research collaboration platform.

Research project fields:

title
PI
institution
study_type
description
status
IRB_status
funding
recruitment_status
required_centers
contact

Allow users to:

- create projects
- request collaborators
- join projects
- search projects
- list expertise
- connect researchers

==================================================
19. PUBLICATIONS
==================================================

Publication fields:

title
authors
journal
year
doi
pmid
abstract
url
institution
topics

Integrate with PubMed where permitted.

Support ORCID.

==================================================
20. JOURNAL CLUB
==================================================

Create journal club.

Features:

- article
- summary
- discussion
- expert commentary
- voting
- references

AI summaries must be clearly marked as AI-generated
and should cite the source article.

==================================================
21. RESIDENT HUB
==================================================

Resident dashboard:

- training progress
- surgical logbook
- exam preparation
- reading list
- educational content
- cases
- research
- mentorship

==================================================
22. SURGICAL LOGBOOK
==================================================

Allow residents to record:

procedure
date
institution
role
supervisor
indication
outcome
complications
notes

Do not store identifiable patient information
unless a future approved medical-record subsystem
is specifically developed.

==================================================
23. QUESTION BANK
==================================================

Create exam question engine.

Question:

stem
options
correct_answer
explanation
references
topic
difficulty
level

Features:

- randomized questions
- mock exam
- progress tracking
- weak-topic analysis
- bookmarks

==================================================
24. MENTORSHIP
==================================================

Users can opt into mentorship.

Mentor fields:

specialty
subspecialty
institution
academic interests
career interests
availability

Mentees can submit requests.

==================================================
25. JOBS AND FELLOWSHIPS
==================================================

Create:

Jobs
Fellowships
Research positions

Search by:

location
subspecialty
institution
position type

==================================================
26. PROFESSIONAL MESSAGING
==================================================

Implement secure physician-to-physician messaging.

Features:

- one-to-one
- group conversations
- research groups
- event groups
- attachments
- read status
- mute
- report
- block

Do NOT initially support patient clinical messaging.

Design the system so it can be expanded later.

==================================================
27. NOTIFICATIONS
==================================================

Push notifications.

Categories:

IUA
EVENT
EDUCATION
CME
RESEARCH
COMMUNITY
MESSAGE
GOVERNANCE

Allow user preference controls.

==================================================
28. GOVERNANCE
==================================================

Create Association Governance module.

Entities:

Board
Committee
Subspecialty
Assembly
Election
Proposal
Meeting
Minutes
Survey

Support:

- announcements
- agendas
- documents
- surveys
- member communications

==================================================
29. VOTING
==================================================

Design voting as a separate security-sensitive service.

Requirements:

- eligibility validation
- strong authentication
- ballot integrity
- anonymity where required
- auditability
- duplicate-vote prevention

Do not implement insecure voting logic.

==================================================
30. AI ASSISTANT
==================================================

Create IUA AI.

Architecture:

User
↓
Intent detection
↓
Permission check
↓
Retrieval
↓
Approved sources
↓
LLM
↓
Answer
↓
Citations

AI use cases:

- guideline summaries
- educational explanations
- paper summaries
- exam questions
- research discovery
- literature search
- conference information
- IUA navigation

AI must not fabricate references.

If sources are unavailable, say so.

==================================================
31. AI MEDICAL SAFETY
==================================================

AI is educational/supportive.

It must not:

- invent clinical guidelines
- fabricate studies
- provide unsupported treatment recommendations
- expose private information
- claim certainty when evidence is uncertain

For clinical questions:

Display:

Information source
Date
Evidence level where available
Limitations

==================================================
32. SEARCH
==================================================

Implement global search.

Search:

members
articles
events
videos
guidelines
research
jobs
fellowships
cases

Use PostgreSQL full-text search initially.

Design for future Elasticsearch/OpenSearch migration.

==================================================
33. FILE STORAGE
==================================================

Support:

PDF
PPT/PPTX
DOC/DOCX
JPEG
PNG
MP4
MP3

Implement:

- virus scanning
- file size limits
- access control
- signed URLs
- encryption
- metadata
- audit logs

==================================================
34. ADMIN PORTAL
==================================================

Create full admin dashboard.

Modules:

Users
Membership
News
Events
Education
CME
Guidelines
Cases
Research
Publications
Community
Messaging
Jobs
Mentorship
AI
Notifications
Governance
Payments
Analytics
Audit Logs
Settings

==================================================
35. ANALYTICS
==================================================

Track privacy-conscious metrics.

Examples:

DAU
MAU
retention
event registrations
course completion
video views
CME activity
research activity

Avoid collecting unnecessary personal data.

==================================================
36. DATABASE DESIGN
==================================================

Create normalized PostgreSQL schema.

Core tables:

users
roles
permissions
user_roles
profiles
hospitals
departments
subspecialties
memberships
membership_types

events
event_sessions
speakers
event_registrations
event_attendance

courses
content
videos
documents
guidelines

cme_activities
cme_records
certificates

cases
case_comments
case_votes

research_projects
research_members
publications
authors

conversations
conversation_members
messages

jobs
fellowships
mentors
mentorship_requests

notifications
notification_preferences

governance_entities
meetings
elections
ballots

ai_conversations
ai_messages
ai_sources

audit_logs
consents

payments
invoices

==================================================
37. DATABASE SECURITY
==================================================

Implement:

- UUID primary keys
- timestamps
- soft deletion where appropriate
- audit metadata
- database constraints
- indexes
- foreign keys
- transactional operations

Never expose internal database IDs unnecessarily.

==================================================
38. API
==================================================

Create REST API.

Version:

/api/v1

Use:

DTO validation
OpenAPI
Swagger
rate limiting
authorization
pagination
filtering
sorting

Never trust client-side input.

==================================================
39. SECURITY
==================================================

Implement:

OWASP Top 10 protections
CSRF protection where applicable
XSS protection
SQL injection protection
secure headers
rate limiting
brute force protection
MFA
audit logging
encryption
secret management

Never place secrets in source code.

==================================================
40. HEALTHCARE PRIVACY
==================================================

Treat all medical information as highly sensitive.

The first version should avoid identifiable patient information.

If future versions support medical records,
create a separate security/compliance architecture.

Include:

- data minimization
- consent management
- access logging
- role-based access
- retention policies
- deletion policies
- breach response mechanisms

==================================================
41. INTERNATIONALIZATION
==================================================

Support:

Hebrew
English
Arabic

Use RTL correctly.

The system must support:

LTR
RTL

Do not hard-code text.

Use translation keys.

==================================================
42. DESIGN SYSTEM
==================================================

Design style:

Professional
Modern
Medical
Minimal
Premium
Trustworthy

Avoid overly clinical hospital aesthetics.

Use:

- clean typography
- cards
- whitespace
- clear hierarchy
- accessible contrast
- intuitive navigation

Create reusable components.

==================================================
43. ACCESSIBILITY
==================================================

Target WCAG 2.2 AA where practical.

Support:

- screen readers
- scalable text
- keyboard navigation
- sufficient contrast
- semantic controls

==================================================
44. TESTING
==================================================

Create tests for:

Authentication
Authorization
Membership
Payments
Events
CME
Research
Messaging
AI
Search
Calculators
Admin

Every clinical calculator must have extensive
unit tests using known expected results.

==================================================
45. CI/CD
==================================================

Create:

development
staging
production

Pipeline:

lint
typecheck
unit tests
integration tests
security scan
build
deployment

Never deploy if critical tests fail.

==================================================
46. LOGGING
==================================================

Implement structured logging.

Do not log:

passwords
tokens
patient identifiers
medical information
payment credentials

Use correlation IDs.

==================================================
47. MONITORING
==================================================

Monitor:

API latency
errors
database health
storage
queue health
authentication failures
security events
mobile crashes

Create alerting architecture.

==================================================
48. DOCUMENTATION
==================================================

Create:

README.md
ARCHITECTURE.md
DATABASE.md
API.md
SECURITY.md
AI.md
DEPLOYMENT.md
TESTING.md
CONTRIBUTING.md

Also create:

docs/
  product/
  architecture/
  api/
  security/
  database/
  ai/
  deployment/

==================================================
49. DEVELOPMENT METHODOLOGY
==================================================

Do not attempt to generate the entire application
in one uncontrolled step.

Work incrementally.

STEP 1:
Analyze repository.

STEP 2:
Create architecture.

STEP 3:
Create database schema.

STEP 4:
Create authentication.

STEP 5:
Create core backend.

STEP 6:
Create admin portal.

STEP 7:
Create mobile app.

STEP 8:
Implement modules incrementally.

STEP 9:
Test every module.

STEP 10:
Run security review.

STEP 11:
Run end-to-end tests.

STEP 12:
Prepare deployment.

==================================================
50. MVP PRIORITY
==================================================

MVP must contain:

Authentication
User profiles
Membership
News
Events
Education
Notifications
Search
Admin portal

Do NOT attempt to build all advanced functionality
before the MVP is stable.

==================================================
51. PHASE 2
==================================================

Implement:

Community
Cases
CME
Resident Hub
Research
Publications
Jobs
Mentorship
Messaging

==================================================
52. PHASE 3
==================================================

Implement:

AI assistant
Clinical calculators
Journal Club
Advanced conference mode
Research matching

==================================================
53. PHASE 4
==================================================

Potential future:

National registries
Multicenter research
Institutional integrations
Advanced analytics
Clinical data infrastructure

==================================================
54. UI SCREENS
==================================================

Create screens for:

Splash
Onboarding
Login
Register
MFA
Home
News
News Detail
Events
Event Detail
Conference Schedule
Education
Content Detail
Guidelines
Calculator List
Calculator Detail
Community
Community Thread
Case List
Case Detail
Research
Research Project
Publications
Residents
Logbook
Question Bank
Mentorship
Jobs
Messaging
Notifications
Profile
Membership
Digital Card
Settings
Admin Dashboard

==================================================
55. ERROR HANDLING
==================================================

Every API endpoint must have predictable errors.

Frontend must provide:

- loading states
- empty states
- error states
- retry actions
- offline states

Never show raw backend errors to users.

==================================================
56. OFFLINE SUPPORT
==================================================

Mobile app should support limited offline functionality.

Cache:

- saved articles
- saved guidelines
- downloaded educational material
- conference schedule

Synchronize when connection returns.

==================================================
57. PERFORMANCE
==================================================

Target:

Fast initial load
Fast navigation
Optimized images
Lazy loading
Pagination
Caching
CDN for media

Do not load large datasets unnecessarily.

==================================================
58. DATA OWNERSHIP
==================================================

Design system so IUA retains control over:

content
members
research metadata
events
educational assets
configuration

Avoid vendor lock-in.

==================================================
59. LEGAL / GOVERNANCE
==================================================

Before production:

Require professional legal review for:

privacy
medical information
copyright
AI
terms of service
membership
payments
data retention
research
patient information

Do not assume compliance merely because technical
security controls exist.

==================================================
60. FINAL DEVELOPMENT REQUIREMENT
==================================================

When implementing any feature:

1. Explain architecture briefly.
2. Implement backend.
3. Implement database changes.
4. Implement API.
5. Implement frontend.
6. Add tests.
7. Run tests.
8. Fix failures.
9. Update documentation.
10. Verify security implications.

Never leave placeholder functionality disguised as complete functionality.

If a feature cannot safely be implemented,
create the appropriate interface and document
what remains required.

==================================================
61. FIRST TASK
==================================================

Before writing large amounts of code:

1. Inspect the repository.
2. Determine existing files and technologies.
3. Create PROJECT_STATUS.md.
4. Create ARCHITECTURE.md.
5. Create PRODUCT_REQUIREMENTS.md.
6. Create DATABASE_DESIGN.md.
7. Create API_DESIGN.md.
8. Create SECURITY_MODEL.md.
9. Create DEVELOPMENT_ROADMAP.md.

Then create the initial application skeleton.

Do not destroy existing user code.

Do not overwrite files without examining them.

==================================================
62. DEFINITION OF DONE
==================================================

A feature is complete only when:

- implemented
- tested
- secured
- documented
- integrated
- accessible
- responsive
- localized
- error-handled
- production-ready

Do not declare a feature complete merely because
the UI exists.

==================================================
END OF MASTER SPECIFICATION
==================================================