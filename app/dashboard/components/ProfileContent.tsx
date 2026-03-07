'use client'

import Link from 'next/link'

export type Role = 'student' | 'professor' | 'admin'

export interface ProfileData {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  role: Role | null
  created_at: string
}

export interface StudyPlanWithProgress {
  id: string
  topic: string
  total_days: number
  hours_per_day: number
  created_at: string
  progress: number
  completedItems: number
  totalItems: number
}

interface ProfileContentProps {
  profile: ProfileData
  dashboardHref: string
  /** When false, hides the "← Dashboard" back link (e.g. on admin profile where sidebar is the nav). Default true. */
  showBackToDashboard?: boolean
  // Student
  gpa?: number
  totalCredits?: number
  gradesCount?: number
  enrolledCoursesCount?: number
  assignmentsSubmitted?: number
  assignmentsTotal?: number
  studyPlans?: StudyPlanWithProgress[]
  attendancePresentCount?: number
  metricsLoading?: boolean
  // Professor
  coursesTaughtCount?: number
  totalStudentsTaught?: number
  // Admin
  totalUsers?: number
  totalCourses?: number
  totalProfessors?: number
  pendingEnrollments?: number
  allowedSignupEmailsCount?: number
  adminMetricsLoading?: boolean
}

function metricCard(
  title: string,
  value: string | number,
  sub?: string,
  href?: string,
  color?: string
) {
  return (
    <div
      key={title}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.25rem 1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      {sub != null && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
      {href && (
        <Link href={href} style={{ fontSize: '0.8rem', color: 'var(--accent)', marginTop: 8, display: 'inline-block', fontWeight: 500 }}>
          View details →
        </Link>
      )}
    </div>
  )
}

export default function ProfileContent({
  profile,
  dashboardHref,
  showBackToDashboard = true,
  gpa = 0,
  totalCredits = 0,
  gradesCount = 0,
  enrolledCoursesCount = 0,
  assignmentsSubmitted = 0,
  assignmentsTotal = 0,
  studyPlans = [],
  attendancePresentCount = 0,
  metricsLoading = false,
  coursesTaughtCount = 0,
  totalStudentsTaught = 0,
  totalUsers = 0,
  totalCourses = 0,
  totalProfessors = 0,
  pendingEnrollments = 0,
  allowedSignupEmailsCount = 0,
  adminMetricsLoading = false,
}: ProfileContentProps) {
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'No name set'
  const initials = (profile.first_name?.[0] || profile.last_name?.[0] || profile.email?.[0] || '?').toUpperCase()
  const roleLabel = profile.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : '—'
  const overallStudyProgress =
    studyPlans.length > 0
      ? Math.round(studyPlans.reduce((sum, p) => sum + p.progress, 0) / studyPlans.length)
      : 0

  return (
    <>
      {showBackToDashboard && (
        <div className="canvas-topbar">
          <div className="canvas-topbar-brand">
            <Link href={dashboardHref} className="canvas-topbar-title" style={{ textDecoration: 'none', color: 'inherit' }}>
              ← Dashboard
            </Link>
            <img src="/logo.png" alt="" className="canvas-topbar-logo-mobile" />
          </div>
        </div>
      )}
      <div className="canvas-content-area">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1.5rem' }}>
          Profile
        </h1>

        <div
          style={{
            maxWidth: 640,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '1.5rem 2rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            marginBottom: '2rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div className="canvas-user-avatar" style={{ width: 56, height: 56, fontSize: '1.25rem' }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)' }}>{fullName}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{roleLabel}</div>
            </div>
          </div>
          <dl style={{ display: 'grid', gap: '1rem', margin: 0 }}>
            <div>
              <dt style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Email</dt>
              <dd style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text)' }}>{profile.email || '—'}</dd>
            </div>
            <div>
              <dt style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Role</dt>
              <dd style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text)' }}>{roleLabel}</dd>
            </div>
          </dl>
        </div>

        {profile.role === 'student' && (
          <>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>Your metrics</h2>
            {metricsLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="skeleton-card skeleton" style={{ padding: '1.25rem 1.5rem', minHeight: 100 }} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {metricCard('GPA', gpa.toFixed(2), `${totalCredits} credits • ${gradesCount} graded assignment${gradesCount !== 1 ? 's' : ''}`, '/dashboard/student/grades', gpa >= 8 ? '#10b981' : gpa >= 6 ? '#f59e0b' : 'var(--text)')}
                {metricCard('Enrolled courses', enrolledCoursesCount, 'Current semester', '/dashboard/student')}
                {metricCard('Assignments', `${assignmentsSubmitted} / ${assignmentsTotal}`, assignmentsTotal > 0 ? `${Math.round((assignmentsSubmitted / assignmentsTotal) * 100)}% submitted` : undefined, '/dashboard/student/assignments')}
                {metricCard('Study plan progress', studyPlans.length > 0 ? `${overallStudyProgress}%` : '—', studyPlans.length > 0 ? `${studyPlans.length} plan${studyPlans.length !== 1 ? 's' : ''}` : 'No study plans', '/dashboard/student/study-plans')}
                {metricCard('Days present', attendancePresentCount, 'Attendance (present)')}
              </div>
            )}
            {!metricsLoading && studyPlans.length > 0 && (
              <>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>Study plan progress</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem', maxWidth: 560 }}>
                  {studyPlans.slice(0, 5).map((plan) => (
                    <div key={plan.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{plan.topic}</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent)' }}>{plan.progress}%</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${plan.progress}%`, background: 'var(--teal-bright)', borderRadius: 4, transition: 'width 0.3s ease' }} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
                        {plan.completedItems} / {plan.totalItems} items • {plan.total_days} days, {plan.hours_per_day}h/day
                      </div>
                    </div>
                  ))}
                  {studyPlans.length > 5 && (
                    <Link href="/dashboard/student/study-plans" style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 500 }}>View all {studyPlans.length} study plans →</Link>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {profile.role === 'professor' && (
          <>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>Your metrics</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', maxWidth: 560 }}>
              {metricCard('Courses taught', coursesTaughtCount, 'Your courses', '/dashboard/professor')}
              {metricCard('Total students', totalStudentsTaught, 'Enrolled across courses')}
            </div>
          </>
        )}

        {profile.role === 'admin' && (
          <>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>Overview</h2>
            {adminMetricsLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="skeleton-card skeleton" style={{ padding: '1.25rem 1.5rem', minHeight: 100 }} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem', maxWidth: 640 }}>
                {metricCard('Total users', totalUsers, 'All accounts', '/dashboard/admin/users')}
                {metricCard('Professors', totalProfessors, 'Instructor accounts', '/dashboard/admin/users')}
                {metricCard('Courses', totalCourses, 'All courses', '/dashboard/admin/courses')}
                {metricCard('Pending enrollments', pendingEnrollments, 'Awaiting approval', '/dashboard/admin/enrollments')}
                {metricCard('Allowed signup emails', allowedSignupEmailsCount, 'Can create account', '/dashboard/admin/signup-emails')}
              </div>
            )}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              Use the sidebar to manage users, courses, enrollments, and allowed signup emails.
            </p>
          </>
        )}
      </div>
    </>
  )
}
