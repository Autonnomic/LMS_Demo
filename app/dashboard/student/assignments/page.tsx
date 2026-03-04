'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Sidebar from '../components/Sidebar'
import Notifications from '../components/Notifications'
import { ChatProvider } from '../components/ChatContext'
import UserMenu from '../../components/UserMenu'

interface Assignment {
  id: string
  title: string
  description: string | null
  due_date: string
  max_points: number
  assignment_type: string | null
  instructions: string | null
  course: {
    id: string
    code: string
    name: string
  }
  submission?: {
    id: string
    submitted_at: string
    status: string
    grade: number | null
  }
}

export default function AssignmentsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [courses, setCourses] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'submitted' | 'graded'>('all')
  const [selectedCourse, setSelectedCourse] = useState<string>('all')

  useEffect(() => {
    fetchAssignmentsData()
  }, [])

  async function fetchAssignmentsData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      // Verify user is a student
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, role')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'student') {
        router.push('/dashboard')
        return
      }

      if (profile) {
        const firstName = profile.first_name || ''
        const lastName = profile.last_name || ''
        setUserName(`${firstName} ${lastName}`.trim() || 'Student')
        setUserInitials(
          (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'S'
        )
        setUserId(user.id)
      }

      // Fetch enrolled courses
      const { data: coursesData } = await supabase
        .from('course_registrations')
        .select(`
          course:courses (
            id,
            code,
            name
          )
        `)
        .eq('student_id', user.id)
        .eq('status', 'enrolled')

      if (coursesData) {
        const courseList = coursesData.map((reg: any) => reg.course).filter(Boolean)
        setCourses(courseList)
      }

      // Fetch assignments
      const { data: assignmentsData } = await supabase
        .from('assignments')
        .select(`
          id,
          title,
          description,
          due_date,
          max_points,
          assignment_type,
          instructions,
          course:courses (
            id,
            code,
            name
          )
        `)
        .order('due_date', { ascending: true })

      // Fetch submissions separately
      const { data: submissionsData } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('student_id', user.id)

      if (assignmentsData) {
        // Map submissions to assignments
        const submissionsMap = new Map()
        if (submissionsData) {
          submissionsData.forEach((sub: any) => {
            submissionsMap.set(sub.assignment_id, sub)
          })
        }

        const assignmentsList = assignmentsData.map((a: any) => ({
          ...a,
          submission: submissionsMap.get(a.id) || null
        })) as Assignment[]
        setAssignments(assignmentsList)
      }
    } catch (error) {
      console.error('Error fetching assignments data:', error)
    } finally {
      setLoading(false)
    }
  }

  function getStatus(assignment: Assignment): 'pending' | 'submitted' | 'graded' | 'overdue' {
    const now = new Date()
    const dueDate = new Date(assignment.due_date)
    
    // Check if submission exists and has been graded
    if (assignment.submission && assignment.submission.grade !== null && assignment.submission.grade !== undefined) {
      return 'graded'
    }
    // Check if submission exists (but not graded yet)
    if (assignment.submission) {
      return 'submitted'
    }
    // Check if overdue (no submission and past due date)
    if (dueDate < now) {
      return 'overdue'
    }
    // Default: pending
    return 'pending'
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'graded': return '#10b981' // green
      case 'submitted': return '#3b82f6' // blue
      case 'overdue': return '#ef4444' // red
      default: return '#f59e0b' // amber
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'graded': return 'Graded'
      case 'submitted': return 'Submitted'
      case 'overdue': return 'Overdue'
      default: return 'Pending'
    }
  }

  const filteredAssignments = assignments.filter(assignment => {
    // Course filter
    if (selectedCourse !== 'all' && assignment.course.id !== selectedCourse) {
      return false
    }
    
    // Status filter
    const status = getStatus(assignment)
    if (filter === 'all') return true
    if (filter === 'pending' && status === 'pending') return true
    if (filter === 'submitted' && (status === 'submitted' || status === 'graded')) return true
    if (filter === 'graded' && status === 'graded') return true
    
    return false
  })

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={courses} />
          <main className="canvas-main-content">
            <div className="canvas-topbar">
              <h1 className="canvas-topbar-title">
                <span className="skeleton skeleton-text lg" style={{ width: '40%' }} />
              </h1>
              <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="skeleton skeleton-avatar" />
                <div className="canvas-user-menu">
                  <div className="canvas-user-avatar skeleton" />
                  <div>
                    <div className="skeleton skeleton-text lg" style={{ width: '120px', marginBottom: '0.25rem' }} />
                    <div className="skeleton skeleton-text sm" style={{ width: '60px' }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="canvas-content-area">
              <div className="skeleton skeleton-text lg" style={{ width: '160px', marginBottom: '1.25rem' }} />
              <div className="skeleton-card skeleton" style={{ marginBottom: '1rem' }}>
                <div className="skeleton skeleton-text sm" style={{ width: '60%', marginBottom: '0.5rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '40%', marginBottom: '0.5rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '80%' }} />
              </div>
              <div className="skeleton-card skeleton">
                <div className="skeleton skeleton-text sm" style={{ width: '50%', marginBottom: '0.5rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '35%', marginBottom: '0.5rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '75%' }} />
              </div>
            </div>
          </main>
        </div>
      </ChatProvider>
    )
  }

  return (
    <ChatProvider>
    <div className="canvas-layout">
      <Sidebar courses={courses} />
      
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <h1 className="canvas-topbar-title">Assignments</h1>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {userId && <Notifications userId={userId} />}
            <UserMenu
              userName={userName}
              userInitials={userInitials}
              onLogout={() => {
                supabase.auth.signOut()
                router.push('/')
                router.refresh()
              }}
            />
          </div>
        </div>

        <div className="canvas-content-area">
          {/* Filters */}
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            marginBottom: '2rem', 
            flexWrap: 'wrap',
            alignItems: 'center'
          }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                Filter by Status
              </label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="form-control"
              >
                <option value="all">All Assignments</option>
                <option value="pending">Pending</option>
                <option value="submitted">Submitted</option>
                <option value="graded">Graded</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
                Filter by Course
              </label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="form-control"
              >
                <option value="all">All Courses</option>
                {courses.map(course => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignments List */}
          {filteredAssignments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredAssignments.map(assignment => {
                const status = getStatus(assignment)
                const dueDate = new Date(assignment.due_date)
                const isOverdue = dueDate < new Date() && !assignment.submission
                
                return (
                  <Link
                    key={assignment.id}
                    href={`/dashboard/student/assignments/${assignment.id}`}
                    style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '1.5rem',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                      border: '1px solid #e5e7eb',
                      textDecoration: 'none',
                      color: 'inherit',
                      display: 'block',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      borderLeft: `4px solid ${getStatusColor(status)}`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                            {assignment.title}
                          </h3>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            background: getStatusColor(status) + '20',
                            color: getStatusColor(status)
                          }}>
                            {getStatusLabel(status)}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                          <strong>{assignment.course.code}</strong> - {assignment.course.name}
                        </div>
                        {assignment.description && (
                          <p style={{ 
                            fontSize: '0.875rem', 
                            color: 'var(--text)', 
                            marginBottom: '0.75rem',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}>
                            {assignment.description}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                          <div>
                            <strong>Due:</strong> {dueDate.toLocaleDateString()} {dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div>
                            <strong>Points:</strong> {assignment.max_points}
                          </div>
                          {assignment.assignment_type && (
                            <div>
                              <strong>Type:</strong> {assignment.assignment_type}
                            </div>
                          )}
                          {assignment.submission?.grade !== null && assignment.submission?.grade !== undefined && (
                            <div style={{ color: getStatusColor('graded'), fontWeight: 600 }}>
                              <strong>Grade:</strong> {assignment.submission?.grade} / {assignment.max_points}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" style={{ color: 'var(--text-muted)' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div style={{
              background: 'white',
              borderRadius: '8px',
              padding: '3rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              border: '1px solid #e5e7eb'
            }}>
              <p>No assignments found{filter !== 'all' || selectedCourse !== 'all' ? ' matching your filters' : ''}.</p>
            </div>
          )}
        </div>
      </main>
    </div>
    </ChatProvider>
  )
}
