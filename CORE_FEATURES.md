# Autonnomic LMS — Core Features

**AI-Powered Learning Management System** — Transforming education through intelligent technology for students, professors, and administrators.

---

## Overview

Autonnomic LMS is a full-stack learning management system built with **Next.js**, **React**, and **Supabase**. It provides role-based dashboards (Student, Professor, Admin), course management, assignments, grades, attendance, AI study assistance, in-app messaging, and automated notifications.

---

## Authentication & Access Control

- **Login / Sign out** — Email and password authentication via Supabase Auth.
- **Signup** — New users can register only if their email is in the **allowed signup emails** list (managed by admins).
- **Role-based dashboards** — After login, users are redirected by role:
  - **Student** → `/dashboard/student`
  - **Professor** → `/dashboard/professor`
  - **Admin** → `/dashboard/admin`
- **Self-assign student** — If a logged-in user has no role, they can be auto-assigned the *student* role via API.
- **Password reset** — Professors (and optionally others) can be flagged to reset password on next login if the user is logging in for first time (`must_reset_password`); reset flow via `/reset-password`.
- **Pending page** — Users without access can see a pending/approval message.

---

## Student Features

### Course Management
- **Dashboard** — View all enrolled courses as cards with code, name, credits, semester, and professor.
- **Course detail pages** — Per-course view: schedules, enrolled classmates, professor info, course description, credits.
- **Sidebar navigation** — Quick links to courses and main sections (Dashboard, Assignments, Grades, Calendar, Study Plans, AI Helper, Inbox).
- **Course colors** — Each course has a consistent color in the UI for quick recognition.

### Assignments
- **Assignments list** — See assignments across enrolled courses with due dates and status.
- **Assignment detail** — View title, description, instructions, due date, max points, and type.
- **Submit assignments** — Text submission and/or file upload; view and track submission status.
- **Document viewer** — In-app viewer for assignment attachments: **PDF** only
- **Grades and feedback** — View grade and instructor feedback after grading.

### Grades
- **Grades page** — View grades by course (assignment name, score, max score, type, graded date).

### Calendar
- **Calendar view** — See class schedules and events in a calendar layout.

### Study Plans
- **AI-generated study plans** — Create study plans by course: topic, total days, hours per day; plans are generated via API and stored.
- **Study plan detail** — Day-by-day breakdown with main topic and tasks per day.
- **Progress tracking** — Mark plan items complete; view progress (e.g. X of Y days completed).

### AI Helper
- **Dedicated AI Helper page** — Chat-style interface for course-related questions.
- **Context-aware answers** — Optional RAG (retrieval-augmented generation) using course/content context and embeddings.
- **Chat history** — Conversations are saved to feed AI to get data about how the student is feeling about a topic
- **Usage limits** — Daily question limit (e.g. 100/day) and token tracking.

### Inbox & Messaging
- **Inbox** — List of conversations with professors/other users.
- **Direct messaging** — Send and receive messages; read/delivered status; optional E2E-style encryption.
- **Chat widget** — Global chat trigger from the top bar (e.g. on student dashboard).

### Notifications
- **Notification bell** — In-app notifications (e.g. assignment reminders, course updates).
- **Read/unread** — Mark notifications as read.

---

## Professor Features

- **Dashboard** — Overview of courses taught and enrollment counts.
- **Course detail** — View and manage a single course: students, schedule, topics.
- **Student management** — View enrolled students; add students to the course.
- **Attendance** — Mark attendance per class: Present, Absent, Late, Excused; date-based; bulk actions.
- **Schedule management** — Add/edit/remove class schedules (day of week, start/end time, location).
- **Course topics** — Manage upcoming topics and scheduled dates.
- **Professor AI Helper** — Dedicated AI assistant for professors (separate route/page).
- **Inbox** — Same messaging system to communicate with students.

---

## Admin Features

- **User management** — List all users (profiles); assign roles: **Student**, **Professor**, **Admin**.
- **Create professor** — Invite professors by email; set temporary password; optionally set “must reset password”; creates Supabase Auth user and profile.
- **Course administration** — List all courses; **assign or change professor** per course.
- **Enrollment requests** — List registration requests with status `pending`; **approve** or **reject** (updates `course_registrations.status` to enrolled or removed).
- **Allowed signup emails** — Add/remove emails that are allowed to sign up; signup is restricted to this list.


## Notifications & Automation

- **In-app notifications** — Stored in `notifications` (user_id, title, message, type, related_id, read).
- **Generate notifications** — API (`/api/notifications/generate`) to create reminders (e.g. upcoming assignments, classes).
- **Cron: generate reminders** — Endpoint `/api/cron/generate-reminders` (secured with `CRON_SECRET`) calls the notification generation logic for scheduled reminder runs.
- **Email notifications** — Optional email sending via `/api/notifications/email` (e.g. for reminders or alerts).

---

## Technical Stack (Summary)

| Layer        | Technology                          |
|-------------|--------------------------------------|
| Frontend    | Next.js 14, React 18                 |
| Backend     | Next.js API routes, Supabase (Postgres) |
| Auth & DB   | Supabase Auth, Supabase Database (RLS) |
| AI          | Groq (Llama), OpenAI (embeddings)    |
| Docs        | Mammoth (DOCX → HTML in browser)     |
| Styling     | CSS (e.g. globals.css, Canvas-like UI) |

---

## Data Highlights (Supabase)

- **user_profiles** — id, name, email, role (student | professor | admin), must_reset_password, last_seen_at.
- **courses** — code, name, description, professor_id, credits, semester, academic_year.
- **course_registrations** — student_id, course_id, status (e.g. enrolled | pending).
- **assignments** / **assignment_submissions** — assignments per course; submissions with file_url, submission_text, grade, feedback.
- **grades** — student_id, course_id, assignment_name, grade, max_grade, assignment_type.
- **attendance** — student_id, course_id, date, status (present | absent | late | excused).
- **course_schedules** — course_id, day_of_week, start_time, end_time, location.
- **course_topics** — course_id, title, description, scheduled_date, topic_order.
- **conversations** / **messages** — 1:1 chat with optional encryption_salt; read/delivered timestamps.
- **notifications** — user_id, title, message, type, related_id, read.
- **student_study_plans** / **student_study_plan_items** — AI-generated plans with day-wise tasks and completion.
- **ai_helper_chats** — Per-user AI chat sessions; messages as JSONB.
- **ai_usage** — Per-user daily question count and token usage.
- **ai_cache** — Cached Q&A with optional embedding for RAG/cache reuse.
- **allowed_signup_emails** — Emails permitted to create an account.

---

## Security & UX

- **RLS (Row Level Security)** — Enabled on Supabase tables so users only access allowed data.
- **Server-side auth** — API routes use Supabase server client and verify user/role before performing actions.
- **Responsive layout** — Layout and sidebar work across desktop and smaller screens.
- **Canvas-inspired UI** — Modern, clean interface with topbar, sidebar, and content area.

---

*You can paste this document into any editor or wiki. For the latest product roadmap and “Coming Soon” AI features, see the project README.*
