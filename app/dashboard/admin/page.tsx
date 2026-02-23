'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AutonnomicLogo from '../student/components/AutonnomicLogo'

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

type ActiveTab = 'users' | 'courses' | 'enrollments'

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

      // Fetch all courses
      const { data: coursesData } = await supabase
        .from('courses')
        .select(`
          id,
          code,
          name,
          description,
          credits,
          semester,
          academic_year,
          professor_id,
          professor:user_profiles!courses_professor_id_fkey (
            first_name,
            last_name,
            email
          )
        `)
        .order('code', { ascending: true })

      if (coursesData) {
        setCourses(coursesData as Course[])
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
        setEnrollmentRequests(enrollmentData as EnrollmentRequest[])
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
    const res = await fetch('/api/admin/assign-professor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const pendingUsers = profiles.filter((p) => p.role == null)
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
        </nav>
      </aside>

      {/* Main Content */}
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <h1 className="canvas-topbar-title">Admin Dashboard</h1>
          <div className="canvas-topbar-actions">
            <div className="canvas-user-menu" onClick={handleLogout}>
              <div className="canvas-user-avatar">{userInitials}</div>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>
                  {userName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Logout
                </div>
              </div>
            </div>
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
              {pendingUsers.length > 0 && (
                <section style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
                    Pending Signups ({pendingUsers.length})
                  </h3>
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Name</th>
                          <th>Role</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingUsers.map((p) => (
                          <tr key={p.id}>
                            <td>{p.email || p.id}</td>
                            <td>{[p.first_name, p.last_name].filter(Boolean).join(' ') || '-'}</td>
                            <td>
                        <select
                          id={`role-${p.id}`}
                                className="form-control"
                          defaultValue="student"
                                style={{ width: '100%' }}
                        >
                          <option value="student">Student</option>
                          <option value="professor">Professor</option>
                          <option value="admin">Admin</option>
                        </select>
                            </td>
                            <td>
                        <button
                          type="button"
                          className="btn-primary"
                                style={{ padding: '0.5rem 1rem' }}
                          disabled={assigning === p.id}
                          onClick={() => {
                            const sel = document.getElementById(`role-${p.id}`) as HTMLSelectElement
                                  handleAssignRole(p.id, (sel?.value as 'student' | 'professor' | 'admin') || 'student')
                          }}
                        >
                                {assigning === p.id ? 'Assigning…' : 'Assign'}
                        </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                      </div>
              </section>
            )}
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
                      {courses.map((course) => (
                        <tr key={course.id}>
                          <td>{course.code}</td>
                          <td>{course.name}</td>
                          <td>
                            {course.professor ? (
                              `${course.professor.first_name || ''} ${course.professor.last_name || ''}`.trim() || course.professor.email || 'Unknown'
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned</span>
                            )}
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
                      ))}
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
                      {enrollmentRequests.map((request) => (
                        <tr key={request.id}>
                          <td>
                            {[request.student.first_name, request.student.last_name].filter(Boolean).join(' ') || 'Unknown'}
                          </td>
                          <td>{request.student.email || '-'}</td>
                          <td>
                            <strong>{request.course.code}</strong> - {request.course.name}
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
                      ))}
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
      </div>
    </main>
    </div>
  )
}
