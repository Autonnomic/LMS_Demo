'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AutonnomicLogo from '../student/components/AutonnomicLogo'
import UserMenu from '../components/UserMenu'

type Profile = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  role: 'student' | 'professor' | 'admin' | null
  created_at: string
}

type Course = {
  id: string
  code: string
  name: string
  description: string | null
  credits: number | null
  semester: string | null
  academic_year: string | null
  professor_id: string | null
  professor: {
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
}

type EnrollmentRequest = {
  id: string
  student_id: string
  course_id: string
  registered_at: string
  status: string
  student: {
    first_name: string | null
    last_name: string | null
    email: string | null
  }
  course: {
    code: string
    name: string
  }
}

type AllowedSignupEmail = { id: string; email: string; created_at: string }

type ActiveTab = 'users' | 'courses' | 'enrollments' | 'signup-emails'

export default function AdminDashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<ActiveTab>('users')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [professors, setProfessors] = useState<Profile[]>([])
  const [enrollmentRequests, setEnrollmentRequests] = useState<EnrollmentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [assigningProfessor, setAssigningProfessor] = useState<string | null>(null)
  const [processingEnrollment, setProcessingEnrollment] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [creatingProfessor, setCreatingProfessor] = useState(false)
  const [professorEmail, setProfessorEmail] = useState('')
  const [professorTempPassword, setProfessorTempPassword] = useState('')
  const [professorFirstName, setProfessorFirstName] = useState('')
  const [professorLastName, setProfessorLastName] = useState('')
  const [creatingCourse, setCreatingCourse] = useState(false)
  const [newCourseCode, setNewCourseCode] = useState('')
  const [newCourseName, setNewCourseName] = useState('')
  const [newCourseDescription, setNewCourseDescription] = useState('')
  const [newCourseCredits, setNewCourseCredits] = useState('')
  const [newCourseSemester, setNewCourseSemester] = useState('')
  const [newCourseAcademicYear, setNewCourseAcademicYear] = useState('')
  const [allowedSignupEmails, setAllowedSignupEmails] = useState<AllowedSignupEmail[]>([])
  const [newAllowedEmail, setNewAllowedEmail] = useState('')
  const [addingAllowedEmail, setAddingAllowedEmail] = useState(false)
  const [removingAllowedEmailId, setRemovingAllowedEmailId] = useState<string | null>(null)
  const [courseProfessorsByCourse, setCourseProfessorsByCourse] = useState<Record<string, Profile[]>>({})

  function getCourseColor(courseId: string): string {
    const palette = [
      '#0892A5', // teal
      '#2563EB', // blue
      '#10B981', // green
      '#F97316', // orange
      '#EC4899', // pink
      '#8B5CF6', // purple
      '#F59E0B', // amber
      '#EF4444', // red
    ]
    const hash = courseId.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0)
    }, 0)
    const index = Math.abs(hash) % palette.length
    return palette[index]
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      // Verify user is admin
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, role')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'admin') {
        router.push('/dashboard')
        return
      }

      if (profile) {
        const firstName = profile.first_name || ''
        const lastName = profile.last_name || ''
        setUserName(`${firstName} ${lastName}`.trim() || 'Admin')
        setUserInitials(
          (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'A'
        )
      }

      // Fetch all profiles
      const { data: profilesData } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, last_name, role, created_at')
        .order('created_at', { ascending: false })

      if (profilesData) {
        setProfiles(profilesData as Profile[])
        setProfessors(profilesData.filter(p => p.role === 'professor') as Profile[])
      }

      // Fetch all courses via admin API (service role) so RLS does not hide them
      const { data: { session } } = await supabase.auth.getSession()
      const courseHeaders: Record<string, string> = {}
      if (session?.access_token) courseHeaders.Authorization = `Bearer ${session.access_token}`
      const coursesRes = await fetch('/api/admin/courses', {
        method: 'GET',
        credentials: 'include',
        headers: courseHeaders,
      })
      if (coursesRes.ok) {
        const json = await coursesRes.json().catch(() => ({}))
        if (Array.isArray(json.courses)) {
          setCourses(json.courses as Course[])
        }
        if (Array.isArray(json.courseProfessors)) {
          const map: Record<string, Profile[]> = {}
          for (const row of json.courseProfessors as any[]) {
            if (!row.course_id || !row.professor) continue
            const courseId = row.course_id as string
            const prof = row.professor as { id: string; email: string | null; first_name: string | null; last_name: string | null }
            if (!map[courseId]) map[courseId] = []
            // Avoid duplicates by id
            if (!map[courseId].some((p) => p.id === prof.id)) {
              map[courseId].push({
                id: prof.id,
                email: prof.email ?? null,
                first_name: prof.first_name ?? null,
                last_name: prof.last_name ?? null,
                role: 'professor',
                created_at: '',
              })
            }
          }
          setCourseProfessorsByCourse(map)
        }
      }

      // Fetch enrollment requests (status = 'pending')
      const { data: enrollmentData } = await supabase
        .from('course_registrations')
        .select(`
          id,
          student_id,
          course_id,
          registered_at,
          status,
          student:user_profiles!course_registrations_student_id_fkey (
            first_name,
            last_name,
            email
          ),
          course:courses!course_registrations_course_id_fkey (
            code,
            name
          )
        `)
        .eq('status', 'pending')
        .order('registered_at', { ascending: false })

      if (enrollmentData) {
        setEnrollmentRequests(enrollmentData as unknown as EnrollmentRequest[])
      }

      const { data: allowedEmailsData } = await supabase
        .from('allowed_signup_emails')
        .select('id, email, created_at')
        .order('created_at', { ascending: false })
      if (allowedEmailsData) {
        setAllowedSignupEmails(allowedEmailsData as AllowedSignupEmail[])
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  async function handleAssignRole(userId: string, role: 'student' | 'professor' | 'admin') {
    setAssigning(userId)
    setError(null)
    const res = await fetch('/api/admin/assign-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error || 'Failed to assign role')
      setAssigning(null)
      return
    }
    setProfiles((prev) =>
      prev.map((p) => (p.id === userId ? { ...p, role } : p))
    )
    // Update professors list if needed
    if (role === 'professor') {
      const updatedProfile = profiles.find(p => p.id === userId)
      if (updatedProfile) {
        setProfessors([...professors, { ...updatedProfile, role: 'professor' }])
      }
    }
    setAssigning(null)
  }

  async function handleAssignProfessor(courseId: string, professorId: string) {
    setAssigningProfessor(courseId)
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    const res = await fetch('/api/admin/assign-professor', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ courseId, professorId }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error || 'Failed to assign professor')
      setAssigningProfessor(null)
      return
    }
    // Refresh courses
    await fetchDashboardData()
    setAssigningProfessor(null)
  }

  async function handleEnrollmentRequest(registrationId: string, action: 'accept' | 'reject') {
    setProcessingEnrollment(registrationId)
    setError(null)
    const res = await fetch('/api/admin/enrollment-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId, action }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error || `Failed to ${action} enrollment request`)
      setProcessingEnrollment(null)
      return
    }
    // Remove from list
    setEnrollmentRequests(prev => prev.filter(r => r.id !== registrationId))
    setProcessingEnrollment(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="canvas-layout">
        <div className="canvas-main-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p>Loading dashboard...</p>
          </div>
        </div>
      </div>
    )
  }

  const allUsers = profiles.filter((p) => p.role != null)

  return (
    <div className="canvas-layout">
      {/* Sidebar */}
      <aside className="canvas-sidebar">
        <div className="canvas-sidebar-header">
          <div className="sidebar-logo-container">
            <AutonnomicLogo />
          </div>
        </div>
        <nav className="canvas-sidebar-nav">
          <div
            className={`canvas-nav-item ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
            style={{ cursor: 'pointer' }}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="nav-text">Users</span>
          </div>
          <div
            className={`canvas-nav-item ${activeTab === 'courses' ? 'active' : ''}`}
            onClick={() => setActiveTab('courses')}
            style={{ cursor: 'pointer' }}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="nav-text">Courses</span>
          </div>
          <div
            className={`canvas-nav-item ${activeTab === 'enrollments' ? 'active' : ''}`}
            onClick={() => setActiveTab('enrollments')}
            style={{ cursor: 'pointer' }}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="nav-text">Enrollments</span>
          </div>
          <div
            className={`canvas-nav-item ${activeTab === 'signup-emails' ? 'active' : ''}`}
            onClick={() => setActiveTab('signup-emails')}
            style={{ cursor: 'pointer' }}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="nav-text">Signup emails</span>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <h1 className="canvas-topbar-title">Admin Dashboard</h1>
          <div className="canvas-topbar-actions">
            <UserMenu userName={userName} userInitials={userInitials} onLogout={handleLogout} />
          </div>
        </div>

        <div className="canvas-content-area">
          {error && (
            <div className="auth-error" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
                User Management
                </h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                Only emails in the &quot;Signup emails&quot; list can create an account. Students with an allowed email sign up on their own; admins add professor accounts (they must reset their temporary password on first login).
              </p>
              <section style={{ marginBottom: '2rem', padding: '1.25rem', background: 'var(--surface-hover)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
                  Add professor
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Create a professor account by email. They will receive a temporary password and must set a permanent one on first login.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="professor-email">Email</label>
                    <input
                      id="professor-email"
                      type="email"
                      className="form-control"
                      placeholder="professor@example.com"
                      value={professorEmail}
                      onChange={(e) => setProfessorEmail(e.target.value)}
                      disabled={creatingProfessor}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="professor-temp-password">Temporary password</label>
                    <input
                      id="professor-temp-password"
                      type="text"
                      className="form-control"
                      placeholder="Min 8 characters"
                      value={professorTempPassword}
                      onChange={(e) => setProfessorTempPassword(e.target.value)}
                      disabled={creatingProfessor}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="professor-first-name">First name (optional)</label>
                    <input
                      id="professor-first-name"
                      type="text"
                      className="form-control"
                      placeholder="First name"
                      value={professorFirstName}
                      onChange={(e) => setProfessorFirstName(e.target.value)}
                      disabled={creatingProfessor}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="professor-last-name">Last name (optional)</label>
                    <input
                      id="professor-last-name"
                      type="text"
                      className="form-control"
                      placeholder="Last name"
                      value={professorLastName}
                      onChange={(e) => setProfessorLastName(e.target.value)}
                      disabled={creatingProfessor}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '0.5rem 1.25rem' }}
                    disabled={creatingProfessor || !professorEmail.trim() || professorTempPassword.length < 8}
                    onClick={async () => {
                      setError(null)
                      setCreatingProfessor(true)
                      const { data: { session } } = await supabase.auth.getSession()
                      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
                      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
                      const res = await fetch('/api/admin/create-professor', {
                        method: 'POST',
                        credentials: 'include',
                        headers,
                        body: JSON.stringify({
                          email: professorEmail.trim(),
                          tempPassword: professorTempPassword,
                          firstName: professorFirstName.trim() || undefined,
                          lastName: professorLastName.trim() || undefined,
                        }),
                      })
                      const json = await res.json().catch(() => ({}))
                      setCreatingProfessor(false)
                      if (!res.ok) {
                        setError(json.error || 'Failed to create professor')
                        return
                      }
                      setProfessorEmail('')
                      setProfessorTempPassword('')
                      setProfessorFirstName('')
                      setProfessorLastName('')
                      fetchDashboardData()
                    }}
                  >
                    {creatingProfessor ? 'Creating…' : 'Create professor'}
                  </button>
                </div>
              </section>
              {allUsers.length > 0 && (
              <section>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
                    All Users ({allUsers.length})
                  </h3>
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Name</th>
                          <th>Role</th>
                          <th>Change role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers.map((p) => (
                          <tr key={p.id}>
                            <td>{p.email || p.id}</td>
                            <td>{[p.first_name, p.last_name].filter(Boolean).join(' ') || '-'}</td>
                            <td>
                              <span style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                backgroundColor: p.role === 'admin' ? '#0892A5' : p.role === 'professor' ? '#0CA4A5' : '#06908F',
                                color: 'white'
                              }}>
                                {p.role}
                              </span>
                            </td>
                            <td>
                              <select
                                id={`role-${p.id}`}
                                className="form-control"
                                defaultValue={p.role ?? 'student'}
                                style={{ width: 'auto', display: 'inline-block', marginRight: '0.5rem' }}
                              >
                                <option value="student">Student</option>
                                <option value="professor">Professor</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ padding: '0.35rem 0.75rem' }}
                                disabled={assigning === p.id}
                                onClick={() => {
                                  const sel = document.getElementById(`role-${p.id}`) as HTMLSelectElement
                                  const newRole = (sel?.value as 'student' | 'professor' | 'admin') || 'student'
                                  if (newRole !== p.role) handleAssignRole(p.id, newRole)
                                }}
                              >
                                {assigning === p.id ? 'Updating…' : 'Update'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                      </div>
              </section>
            )}
            </div>
          )}

          {/* Courses Tab */}
          {activeTab === 'courses' && (
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
                Course Management
              </h2>
              <section style={{ marginBottom: '2rem', padding: '1.25rem', background: 'var(--surface-hover)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
                  Create course
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Add a new course. You can assign a professor now or later from the table below.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 2fr)', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="course-code">Course code</label>
                    <input
                      id="course-code"
                      type="text"
                      className="form-control"
                      placeholder="e.g. CS101"
                      value={newCourseCode}
                      onChange={(e) => setNewCourseCode(e.target.value)}
                      disabled={creatingCourse}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="course-name">Course name</label>
                    <input
                      id="course-name"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Introduction to Computer Science"
                      value={newCourseName}
                      onChange={(e) => setNewCourseName(e.target.value)}
                      disabled={creatingCourse}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="course-credits">Credits (optional)</label>
                    <input
                      id="course-credits"
                      type="number"
                      min={0}
                      className="form-control"
                      placeholder="e.g. 4"
                      value={newCourseCredits}
                      onChange={(e) => setNewCourseCredits(e.target.value)}
                      disabled={creatingCourse}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="course-semester">Semester (optional)</label>
                    <input
                      id="course-semester"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Fall"
                      value={newCourseSemester}
                      onChange={(e) => setNewCourseSemester(e.target.value)}
                      disabled={creatingCourse}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="course-year">Academic year (optional)</label>
                    <input
                      id="course-year"
                      type="text"
                      className="form-control"
                      placeholder="e.g. 2024–2025"
                      value={newCourseAcademicYear}
                      onChange={(e) => setNewCourseAcademicYear(e.target.value)}
                      disabled={creatingCourse}
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="course-description">Description (optional)</label>
                  <textarea
                    id="course-description"
                    className="form-control"
                    rows={2}
                    placeholder="Short description of the course"
                    value={newCourseDescription}
                    onChange={(e) => setNewCourseDescription(e.target.value)}
                    disabled={creatingCourse}
                  />
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '0.5rem 1.25rem', width: 'auto' }}
                    disabled={creatingCourse || !newCourseCode.trim() || !newCourseName.trim()}
                    onClick={async () => {
                      setError(null)
                      setCreatingCourse(true)
                      const { data: { session } } = await supabase.auth.getSession()
                      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
                      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
                      const res = await fetch('/api/admin/courses', {
                        method: 'POST',
                        credentials: 'include',
                        headers,
                        body: JSON.stringify({
                          code: newCourseCode.trim(),
                          name: newCourseName.trim(),
                          description: newCourseDescription.trim() || undefined,
                          credits: newCourseCredits.trim() || undefined,
                          semester: newCourseSemester.trim() || undefined,
                          academicYear: newCourseAcademicYear.trim() || undefined,
                        }),
                      })
                      const json = await res.json().catch(() => ({}))
                      setCreatingCourse(false)
                      if (!res.ok) {
                        setError(json.error || 'Failed to create course')
                        return
                      }
                      if (json.course) {
                        setCourses((prev) => [...prev, json.course as Course])
                      } else {
                        await fetchDashboardData()
                      }
                      setNewCourseCode('')
                      setNewCourseName('')
                      setNewCourseDescription('')
                      setNewCourseCredits('')
                      setNewCourseSemester('')
                      setNewCourseAcademicYear('')
                    }}
                  >
                    {creatingCourse ? 'Creating…' : 'Create course'}
                  </button>
                </div>
              </section>
              {courses.length > 0 ? (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Current Professor</th>
                        <th>Assign Professor</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((course) => {
                        const color = getCourseColor(course.id)
                        return (
                        <tr key={course.id}>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 999,
                                  background: color,
                                }}
                              />
                              <span>{course.code}</span>
                            </span>
                          </td>
                          <td>{course.name}</td>
                          <td>
                            {(() => {
                              const cps = courseProfessorsByCourse[course.id] || []
                              if (cps.length === 0) {
                                return (
                                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned</span>
                                )
                              }
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                  {cps.map((prof) => (
                                    <span key={prof.id} style={{ fontSize: '0.9rem' }}>
                                      {[prof.first_name, prof.last_name].filter(Boolean).join(' ') || prof.email || prof.id}
                                    </span>
                                  ))}
                                </div>
                              )
                            })()}
                          </td>
                          <td>
                            <select
                              id={`professor-${course.id}`}
                              className="form-control"
                              defaultValue={course.professor_id || ''}
                              style={{ width: '100%' }}
                            >
                              <option value="">Select Professor</option>
                              {professors.map((prof) => (
                                <option key={prof.id} value={prof.id}>
                                  {[prof.first_name, prof.last_name].filter(Boolean).join(' ') || prof.email || prof.id}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-primary"
                              style={{ padding: '0.5rem 1rem' }}
                              disabled={assigningProfessor === course.id}
                              onClick={() => {
                                const sel = document.getElementById(`professor-${course.id}`) as HTMLSelectElement
                                const professorId = sel?.value
                                if (professorId) {
                                  handleAssignProfessor(course.id, professorId)
                                }
                              }}
                            >
                              {assigningProfessor === course.id ? 'Assigning…' : 'Assign'}
                            </button>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                  <p>No courses found</p>
                </div>
              )}
            </div>
          )}

          {/* Enrollments Tab */}
          {activeTab === 'enrollments' && (
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
                Enrollment Requests
              </h2>
              {enrollmentRequests.length > 0 ? (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Email</th>
                        <th>Course</th>
                        <th>Requested At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollmentRequests.map((request) => {
                        const color = getCourseColor(request.course_id)
                        return (
                        <tr key={request.id}>
                          <td>
                            {[request.student.first_name, request.student.last_name].filter(Boolean).join(' ') || 'Unknown'}
                          </td>
                          <td>{request.student.email || '-'}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 999,
                                  background: color,
                                }}
                              />
                              <span>
                                <strong>{request.course.code}</strong> - {request.course.name}
                              </span>
                            </span>
                          </td>
                          <td>{new Date(request.registered_at).toLocaleDateString()}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                                disabled={processingEnrollment === request.id}
                                onClick={() => handleEnrollmentRequest(request.id, 'accept')}
                              >
                                {processingEnrollment === request.id ? 'Processing…' : 'Accept'}
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                                disabled={processingEnrollment === request.id}
                                onClick={() => handleEnrollmentRequest(request.id, 'reject')}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                  <p>No pending enrollment requests</p>
                </div>
              )}
            </div>
          )}

          {/* Signup emails tab: emails that are allowed to sign up */}
          {activeTab === 'signup-emails' && (
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
                Allowed signup emails
              </h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                Only users with an email in this list can create an account. Add emails to allow new students or staff to sign up.
              </p>
              <section style={{ marginBottom: '2rem', padding: '1.25rem', background: 'var(--surface-hover)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
                  Add allowed emails
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Enter one or more emails (one per line or comma-separated). Duplicates and invalid lines are skipped.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="new-allowed-email">Emails</label>
                    <textarea
                      id="new-allowed-email"
                      className="form-control"
                      placeholder={'student1@example.com\nstudent2@example.com\nstudent3@example.com'}
                      value={newAllowedEmail}
                      onChange={(e) => setNewAllowedEmail(e.target.value)}
                      disabled={addingAllowedEmail}
                      rows={4}
                      style={{ minWidth: '100%', resize: 'vertical' }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '0.5rem 1.25rem', alignSelf: 'flex-start' }}
                    disabled={addingAllowedEmail || !newAllowedEmail.trim()}
                    onClick={async () => {
                      setError(null)
                      setAddingAllowedEmail(true)
                      const raw = newAllowedEmail
                        .split(/[\n,;]+/)
                        .map((s) => s.trim().toLowerCase())
                        .filter((s) => s.length > 0 && s.includes('@'))
                      const emails = Array.from(new Set(raw))
                      let added = 0
                      let skipped = 0
                      for (const email of emails) {
                        const { error: insertError } = await supabase
                          .from('allowed_signup_emails')
                          .insert({ email })
                        if (insertError) {
                          if (insertError.code === '23505') skipped += 1
                          else {
                            setError(insertError.message)
                            break
                          }
                        } else {
                          added += 1
                        }
                      }
                      setAddingAllowedEmail(false)
                      if (added > 0 || skipped > 0) {
                        if (added > 0) fetchDashboardData()
                        setNewAllowedEmail('')
                        if (added > 0 && skipped > 0) {
                          setError(`Added ${added} email(s). ${skipped} already in the list.`)
                        } else if (skipped > 0) {
                          setError(`All ${skipped} email(s) were already in the list.`)
                        }
                      }
                    }}
                  >
                    {addingAllowedEmail ? 'Adding…' : 'Add emails'}
                  </button>
                </div>
              </section>
              {allowedSignupEmails.length > 0 ? (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Added</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allowedSignupEmails.map((row) => (
                        <tr key={row.id}>
                          <td>{row.email}</td>
                          <td>{new Date(row.created_at).toLocaleDateString()}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}
                              disabled={removingAllowedEmailId === row.id}
                              onClick={async () => {
                                setRemovingAllowedEmailId(row.id)
                                setError(null)
                                await supabase.from('allowed_signup_emails').delete().eq('id', row.id)
                                setAllowedSignupEmails((prev) => prev.filter((e) => e.id !== row.id))
                                setRemovingAllowedEmailId(null)
                              }}
                            >
                              {removingAllowedEmailId === row.id ? 'Removing…' : 'Remove'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  No allowed emails yet. Add an email above to let that user sign up.
                </div>
              )}
            </div>
          )}
      </div>
    </main>
    </div>
  )
}
