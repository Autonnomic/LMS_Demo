'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '../components/Sidebar'
import Notifications from '../components/Notifications'
import { ChatProvider } from '../components/ChatContext'

interface Grade {
  id: string
  assignment_name: string
  grade: number
  max_grade: number
  assignment_type: string | null
  graded_at: string
  course: {
    id: string
    code: string
    name: string
    credits: number
  }
}

interface CourseGradeSummary {
  courseId: string
  courseCode: string
  courseName: string
  credits: number
  grades: Grade[]
  averageGrade: number
  totalPoints: number
  maxPoints: number
  letterGrade: string
}

export default function GradesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [grades, setGrades] = useState<Grade[]>([])
  const [courseSummaries, setCourseSummaries] = useState<CourseGradeSummary[]>([])
  const [overallGPA, setOverallGPA] = useState<number>(0)
  const [totalCredits, setTotalCredits] = useState<number>(0)
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [courses, setCourses] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [selectedCourse, setSelectedCourse] = useState<string>('all')

  useEffect(() => {
    fetchGradesData()
  }, [])

  async function fetchGradesData() {
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

      // Fetch all grades
      const { data: gradesData } = await supabase
        .from('grades')
        .select(`
          id,
          assignment_name,
          grade,
          max_grade,
          assignment_type,
          graded_at,
          course:courses (
            id,
            code,
            name,
            credits
          )
        `)
        .eq('student_id', user.id)
        .order('graded_at', { ascending: false })

      if (gradesData) {
        const gradesList = gradesData.map((g: any) => ({
          ...g,
          course: g.course
        })) as Grade[]
        setGrades(gradesList)
        calculateSummaries(gradesList)
      }
    } catch (error) {
      console.error('Error fetching grades data:', error)
    } finally {
      setLoading(false)
    }
  }

  function calculateSummaries(gradesList: Grade[]) {
    // Group grades by course
    const courseMap = new Map<string, Grade[]>()
    
    gradesList.forEach(grade => {
      if (grade.course) {
        const courseId = grade.course.id
        if (!courseMap.has(courseId)) {
          courseMap.set(courseId, [])
        }
        courseMap.get(courseId)!.push(grade)
      }
    })

    // Calculate summaries for each course
    const summaries: CourseGradeSummary[] = []
    let totalGradePoints = 0
    let totalCreditsEarned = 0

    courseMap.forEach((courseGrades, courseId) => {
      const course = courseGrades[0].course
      const totalPoints = courseGrades.reduce((sum, g) => sum + Number(g.grade), 0)
      const maxPoints = courseGrades.reduce((sum, g) => sum + Number(g.max_grade || 100), 0)
      const averageGrade = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0
      
      // Calculate letter grade
      let letterGrade = 'N/A'
      if (averageGrade >= 90) letterGrade = 'A'
      else if (averageGrade >= 80) letterGrade = 'B'
      else if (averageGrade >= 70) letterGrade = 'C'
      else if (averageGrade >= 60) letterGrade = 'D'
      else if (averageGrade > 0) letterGrade = 'F'

      summaries.push({
        courseId,
        courseCode: course.code,
        courseName: course.name,
        credits: course.credits || 0,
        grades: courseGrades,
        averageGrade,
        totalPoints,
        maxPoints,
        letterGrade
      })

      // Calculate GPA contribution (10.0 scale)
      // Convert percentage to 10.0 scale directly
      const gradePoints = averageGrade / 10

      totalGradePoints += gradePoints * (course.credits || 0)
      totalCreditsEarned += course.credits || 0
    })

    setCourseSummaries(summaries)
    
    // Calculate overall GPA (10.0 scale)
    const gpa = totalCreditsEarned > 0 ? totalGradePoints / totalCreditsEarned : 0
    setOverallGPA(gpa)
    setTotalCredits(totalCreditsEarned)
  }

  function getGradeColor(percentage: number): string {
    if (percentage >= 90) return '#10b981' // green
    if (percentage >= 80) return '#3b82f6' // blue
    if (percentage >= 70) return '#f59e0b' // amber
    if (percentage >= 60) return '#ef4444' // red
    return '#6b7280' // gray
  }

  const filteredGrades = selectedCourse === 'all' 
    ? grades 
    : grades.filter(g => g.course?.id === selectedCourse)

  const filteredSummaries = selectedCourse === 'all'
    ? courseSummaries
    : courseSummaries.filter(s => s.courseId === selectedCourse)

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={courses} />
          <main className="canvas-main-content">
            <div className="canvas-topbar">
              <h1 className="canvas-topbar-title">
                <span className="skeleton skeleton-text lg" style={{ width: '35%' }} />
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
              <div className="skeleton-card skeleton">
                <div className="skeleton skeleton-text sm" style={{ width: '50%', marginBottom: '0.5rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '70%', marginBottom: '0.5rem' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '40%' }} />
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
          <h1 className="canvas-topbar-title">Grades</h1>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {userId && <Notifications userId={userId} />}
            <div className="canvas-user-menu" onClick={() => {
              supabase.auth.signOut()
              router.push('/')
              router.refresh()
            }}>
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
          {/* GPA Summary Card */}
          <div style={{
            background: 'linear-gradient(135deg, #0892A5 0%, #0CA4A5 100%)',
            borderRadius: '12px',
            padding: '2rem',
            marginBottom: '2rem',
            color: 'white',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem' }}>
              <div>
                <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>Overall GPA</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1 }}>
                    {overallGPA.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '1.25rem', opacity: 0.9 }}>
                    / 10.0
                  </div>
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 500, marginTop: '0.5rem', opacity: 0.95 }}>
                  {(overallGPA * 10).toFixed(1)}%
                </div>
                <div style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '0.5rem' }}>
                  {totalCredits} Credits
                </div>
              </div>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>Total Courses</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                    {courseSummaries.length}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>Total Assignments</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                    {grades.length}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Course Filter */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--text)' }}>
              Filter by Course
            </label>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="form-control"
              style={{ maxWidth: '300px' }}
            >
              <option value="all">All Courses</option>
              {courses.map(course => (
                <option key={course.id} value={course.id}>
                  {course.code} - {course.name}
                </option>
              ))}
            </select>
          </div>

          {/* Course Grade Summaries */}
          {filteredSummaries.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
                Course Summary
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {filteredSummaries.map(summary => (
                  <div
                    key={summary.courseId}
                    style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '1.5rem',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                      border: '1px solid #e5e7eb'
                    }}
                  >
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                        {summary.courseCode}
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>
                        {summary.courseName}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          Average Grade
                        </div>
                        <div style={{ 
                          fontSize: '1.5rem', 
                          fontWeight: 700,
                          color: getGradeColor(summary.averageGrade)
                        }}>
                          {summary.averageGrade.toFixed(1)}%
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          Letter Grade
                        </div>
                        <div style={{ 
                          fontSize: '1.5rem', 
                          fontWeight: 700,
                          color: getGradeColor(summary.averageGrade)
                        }}>
                          {summary.letterGrade}
                        </div>
                      </div>
                    </div>
                    <div style={{ 
                      fontSize: '0.875rem', 
                      color: 'var(--text-muted)',
                      paddingTop: '1rem',
                      borderTop: '1px solid #e5e7eb'
                    }}>
                      {summary.grades.length} assignment{summary.grades.length !== 1 ? 's' : ''} • {summary.credits} credit{summary.credits !== 1 ? 's' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grade Trends Chart */}
          {filteredSummaries.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
                Grade Trends
              </h2>
              <div style={{
                background: 'white',
                borderRadius: '8px',
                padding: '1.5rem',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {filteredSummaries.map(summary => (
                    <div key={summary.courseId} style={{ flex: '1', minWidth: '200px' }}>
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>
                        {summary.courseCode}
                      </div>
                      <div style={{
                        height: '8px',
                        background: '#e5e7eb',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginBottom: '0.5rem'
                      }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(summary.averageGrade, 100)}%`,
                            background: getGradeColor(summary.averageGrade),
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {summary.averageGrade.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Detailed Grades Table */}
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
              All Grades
            </h2>
            {filteredGrades.length > 0 ? (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Assignment</th>
                      <th>Type</th>
                      <th>Grade</th>
                      <th>Percentage</th>
                      <th>Graded Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGrades.map(grade => {
                      const percentage = grade.max_grade > 0 
                        ? (Number(grade.grade) / Number(grade.max_grade)) * 100 
                        : 0
                      return (
                        <tr key={grade.id}>
                          <td>
                            <div style={{ fontWeight: 500 }}>{grade.course?.code}</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                              {grade.course?.name}
                            </div>
                          </td>
                          <td>{grade.assignment_name}</td>
                          <td>
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              background: '#f3f4f6',
                              color: 'var(--text)'
                            }}>
                              {grade.assignment_type || 'N/A'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>
                              {Number(grade.grade).toFixed(1)} / {Number(grade.max_grade || 100).toFixed(1)}
                            </span>
                          </td>
                          <td>
                            <span style={{
                              fontWeight: 600,
                              color: getGradeColor(percentage)
                            }}>
                              {percentage.toFixed(1)}%
                            </span>
                          </td>
                          <td>
                            {new Date(grade.graded_at).toLocaleDateString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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
                <p>No grades available{selectedCourse !== 'all' ? ' for this course' : ''}.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
    </ChatProvider>
  )
}
