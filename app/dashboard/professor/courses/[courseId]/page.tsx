'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AutonnomicLogo from '../../../student/components/AutonnomicLogo'

interface Course {
  id: string
  code: string
  name: string
  description: string | null
  credits: number
  semester: string | null
  academic_year: string | null
}

interface Schedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  location: string | null
}

interface Student {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

interface EnrolledStudent extends Student {
  registration_id: string
  registered_at: string
}

interface AttendanceRecord {
  student_id: string
  date: string
  status: string
  notes: string | null
}

const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ProfessorCourseDetail() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.courseId as string
  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState<Course | null>(null)
  const [schedule, setSchedule] = useState<Schedule[]>([])
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([])
  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0])
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord>>({})
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'schedule' | 'students'>('overview')
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [newSchedule, setNewSchedule] = useState({
    day_of_week: 1,
    start_time: '10:00',
    end_time: '11:30',
    location: ''
  })
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [courses, setCourses] = useState<Course[]>([])

  useEffect(() => {
    fetchCourseData()
    fetchAllCourses()
  }, [courseId])

  useEffect(() => {
    if (courseId && attendanceDate) {
      fetchAttendanceForDate(attendanceDate)
    }
  }, [attendanceDate, courseId])

  async function fetchAllCourses() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, role')
        .eq('id', user.id)
        .single()

      // Verify user is a professor, redirect if not
      if (!profile || profile.role !== 'professor') {
        router.push('/dashboard')
        return
      }

      if (profile) {
        const firstName = profile.first_name || ''
        const lastName = profile.last_name || ''
        setUserName(`${firstName} ${lastName}`.trim() || 'Professor')
        setUserInitials(
          (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'P'
        )
      }

      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, code, name')
        .eq('professor_id', user.id)
        .order('code', { ascending: true })

      if (coursesData) {
        setCourses(coursesData)
      }
    } catch (error) {
      console.error('Error fetching courses:', error)
    }
  }

  async function fetchCourseData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      // Verify user is a professor
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'professor') {
        router.push('/dashboard')
        return
      }

      // Fetch course details
      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single()

      if (courseData) {
        setCourse(courseData)
      }

      // Fetch schedule
      const { data: scheduleData } = await supabase
        .from('course_schedules')
        .select('*')
        .eq('course_id', courseId)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true })

      if (scheduleData) {
        setSchedule(scheduleData)
      }

      // Fetch enrolled students
      const { data: studentsData } = await supabase
        .from('course_registrations')
        .select(`
          id,
          registered_at,
          student:user_profiles (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('course_id', courseId)
        .eq('status', 'enrolled')

      if (studentsData) {
        const enrolled = studentsData.map((reg: any) => ({
          ...reg.student,
          registration_id: reg.id,
          registered_at: reg.registered_at
        }))
        setEnrolledStudents(enrolled)

        // Fetch all students for enrollment (after we have enrolled list)
        const { data: allStudentsData } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, email')
          .eq('role', 'student')
          .order('last_name', { ascending: true })

        if (allStudentsData) {
          // Filter out already enrolled students
          const enrolledIds = enrolled.map(s => s.id)
          setAllStudents(allStudentsData.filter(s => !enrolledIds.includes(s.id)))
        }
      } else {
        // If no enrolled students, fetch all students
        const { data: allStudentsData } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, email')
          .eq('role', 'student')
          .order('last_name', { ascending: true })

        if (allStudentsData) {
          setAllStudents(allStudentsData)
        }
      }

      // Fetch today's attendance
      await fetchAttendanceForDate(attendanceDate)
    } catch (error) {
      console.error('Error fetching course data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAttendanceForDate(date: string) {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('course_id', courseId)
      .eq('date', date)

    if (data) {
      const records: Record<string, AttendanceRecord> = {}
      data.forEach(record => {
        records[record.student_id] = {
          student_id: record.student_id,
          date: record.date,
          status: record.status,
          notes: record.notes
        }
      })
      setAttendanceRecords(records)
    }
  }

  async function handleTakeAttendance() {
    try {
      const records = Object.values(attendanceRecords)
      const operations = records.map(record => {
        return supabase
          .from('attendance')
          .upsert({
            student_id: record.student_id,
            course_id: courseId,
            date: attendanceDate,
            status: record.status,
            notes: record.notes || null
          }, {
            onConflict: 'student_id,course_id,date'
          })
      })

      await Promise.all(operations)
      alert('Attendance saved successfully!')
    } catch (error) {
      console.error('Error saving attendance:', error)
      alert('Error saving attendance')
    }
  }

  function updateAttendanceStatus(studentId: string, status: string) {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        student_id: studentId,
        date: attendanceDate,
        status,
        notes: prev[studentId]?.notes || null
      }
    }))
  }

  async function handleAddSchedule() {
    try {
      const { error } = await supabase
        .from('course_schedules')
        .insert({
          course_id: courseId,
          day_of_week: newSchedule.day_of_week,
          start_time: newSchedule.start_time + ':00',
          end_time: newSchedule.end_time + ':00',
          location: newSchedule.location || null
        })

      if (error) throw error

      setNewSchedule({
        day_of_week: 1,
        start_time: '10:00',
        end_time: '11:30',
        location: ''
      })
      fetchCourseData()
      alert('Schedule added successfully!')
    } catch (error) {
      console.error('Error adding schedule:', error)
      alert('Error adding schedule')
    }
  }

  async function handleUpdateSchedule(scheduleId: string) {
    try {
      const { error } = await supabase
        .from('course_schedules')
        .update({
          day_of_week: editingSchedule!.day_of_week,
          start_time: editingSchedule!.start_time,
          end_time: editingSchedule!.end_time,
          location: editingSchedule!.location || null
        })
        .eq('id', scheduleId)

      if (error) throw error

      setEditingSchedule(null)
      fetchCourseData()
      alert('Schedule updated successfully!')
    } catch (error) {
      console.error('Error updating schedule:', error)
      alert('Error updating schedule')
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    if (!confirm('Are you sure you want to delete this schedule?')) return

    try {
      const { error } = await supabase
        .from('course_schedules')
        .delete()
        .eq('id', scheduleId)

      if (error) throw error

      fetchCourseData()
      alert('Schedule deleted successfully!')
    } catch (error) {
      console.error('Error deleting schedule:', error)
      alert('Error deleting schedule')
    }
  }

  async function handleEnrollStudent(studentId: string) {
    try {
      const { error } = await supabase
        .from('course_registrations')
        .insert({
          student_id: studentId,
          course_id: courseId,
          status: 'enrolled'
        })

      if (error) {
        if (error.code === '23505') {
          alert('Student is already enrolled in this course')
        } else {
          throw error
        }
        return
      }

      await fetchCourseData()
      alert('Student enrolled successfully!')
    } catch (error) {
      console.error('Error enrolling student:', error)
      alert('Error enrolling student')
    }
  }

  async function handleUnenrollStudent(registrationId: string) {
    if (!confirm('Are you sure you want to unenroll this student?')) return

    try {
      const { error } = await supabase
        .from('course_registrations')
        .update({ status: 'withdrawn' })
        .eq('id', registrationId)

      if (error) throw error

      fetchCourseData()
      alert('Student unenrolled successfully!')
    } catch (error) {
      console.error('Error unenrolling student:', error)
      alert('Error unenrolling student')
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  function formatTime(timeString: string) {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  if (loading) {
    return (
      <div className="canvas-layout">
        <div className="canvas-main-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p>Loading course...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="canvas-layout">
        <div className="canvas-main-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <p>Course not found</p>
            <Link href="/dashboard/professor" style={{ color: 'var(--teal-bright)' }}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

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
          <Link href="/dashboard/professor" className="canvas-nav-item">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="nav-text">Dashboard</span>
          </Link>
        </nav>
        <div className="canvas-courses-section">
          <div className="canvas-courses-section-title">My Courses</div>
          <div className="courses-list expanded">
            {courses.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/professor/courses/${c.id}`}
                className={`canvas-course-link ${c.id === courseId ? 'active' : ''}`}
              >
                <span className="course-code-small">{c.code}</span>
                <span className="course-name">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <h1 className="canvas-topbar-title">{course.code} - {course.name}</h1>
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
          {/* Tabs */}
          <div className="professor-tabs">
            <button
              className={`professor-tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`professor-tab ${activeTab === 'attendance' ? 'active' : ''}`}
              onClick={() => setActiveTab('attendance')}
            >
              Attendance
            </button>
            <button
              className={`professor-tab ${activeTab === 'schedule' ? 'active' : ''}`}
              onClick={() => setActiveTab('schedule')}
            >
              Schedule
            </button>
            <button
              className={`professor-tab ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => setActiveTab('students')}
            >
              Students
            </button>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div>
              <div 
                className="course-detail-header"
                style={{
                  background: `linear-gradient(135deg, #0892A5 0%, #0CA4A5 100%)`
                }}
              >
                <h1>{course.code} - {course.name}</h1>
                {course.description && (
                  <p style={{ marginTop: '0.5rem', opacity: 0.95 }}>
                    {course.description}
                  </p>
                )}
                <div className="course-detail-header-meta">
                  <span>{course.credits} Credits</span>
                  {course.semester && <span>{course.semester} {course.academic_year}</span>}
                  <span>{enrolledStudents.length} Students</span>
                </div>
              </div>

              <div className="course-detail-content">
                <div className="course-detail-main">
                  <div className="course-info-card">
                    <h3>Class Schedule</h3>
                    {schedule.length > 0 ? (
                      <div>
                        {schedule.map((sched) => (
                          <div key={sched.id} className="schedule-item">
                            <div className="schedule-day">{daysOfWeek[sched.day_of_week]}</div>
                            <div className="schedule-time">
                              {formatTime(sched.start_time)} - {formatTime(sched.end_time)}
                            </div>
                            {sched.location && (
                              <div className="schedule-location">📍 {sched.location}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--text-muted)' }}>No schedule set</p>
                    )}
                  </div>
                </div>

                <div className="course-detail-sidebar">
                  <div className="course-info-card">
                    <h3>Enrolled Students ({enrolledStudents.length})</h3>
                    {enrolledStudents.length > 0 ? (
                      <div className="student-list">
                        {enrolledStudents.slice(0, 10).map((student) => (
                          <div key={student.id} className="student-item">
                            <div className="student-avatar">
                              {(student.first_name?.charAt(0) || '') + (student.last_name?.charAt(0) || '')}
                            </div>
                            <div className="student-info">
                              <div className="student-name">
                                {student.first_name} {student.last_name}
                              </div>
                            </div>
                          </div>
                        ))}
                        {enrolledStudents.length > 10 && (
                          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            +{enrolledStudents.length - 10} more
                          </p>
                        )}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--text-muted)' }}>No students enrolled</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Attendance Tab */}
          {activeTab === 'attendance' && (
            <div className="professor-tab-content">
              <div className="course-info-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3>Take Attendance</h3>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <input
                      type="date"
                      value={attendanceDate}
                      onChange={(e) => {
                        setAttendanceDate(e.target.value)
                        fetchAttendanceForDate(e.target.value)
                      }}
                      style={{
                        padding: '0.5rem',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '0.875rem'
                      }}
                    />
                    <button
                      onClick={handleTakeAttendance}
                      className="btn-primary"
                      style={{ padding: '0.5rem 1.5rem', width: 'auto' }}
                    >
                      Save Attendance
                    </button>
                  </div>
                </div>

                {enrolledStudents.length > 0 ? (
                  <div className="attendance-table">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600 }}>Student</th>
                          <th style={{ textAlign: 'center', padding: '0.75rem', fontWeight: 600 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enrolledStudents.map((student) => {
                          const currentStatus = attendanceRecords[student.id]?.status || 'present'
                          return (
                            <tr key={student.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '0.75rem' }}>
                                {student.first_name} {student.last_name}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <select
                                  value={currentStatus}
                                  onChange={(e) => updateAttendanceStatus(student.id, e.target.value)}
                                  style={{
                                    padding: '0.5rem',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    fontSize: '0.875rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <option value="present">Present</option>
                                  <option value="absent">Absent</option>
                                  <option value="late">Late</option>
                                  <option value="excused">Excused</option>
                                </select>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>No students enrolled</p>
                )}
              </div>
            </div>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="professor-tab-content">
              <div className="course-info-card">
                <h3>Class Schedule</h3>
                
                {/* Existing Schedules */}
                {schedule.length > 0 && (
                  <div style={{ marginBottom: '2rem' }}>
                    {schedule.map((sched) => (
                      <div key={sched.id} className="schedule-item" style={{ position: 'relative' }}>
                        {editingSchedule?.id === sched.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <select
                              value={editingSchedule.day_of_week}
                              onChange={(e) => setEditingSchedule({
                                ...editingSchedule,
                                day_of_week: parseInt(e.target.value)
                              })}
                              style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px' }}
                            >
                              {daysOfWeek.map((day, idx) => (
                                <option key={idx} value={idx}>{day}</option>
                              ))}
                            </select>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <input
                                type="time"
                                value={editingSchedule.start_time.substring(0, 5)}
                                onChange={(e) => setEditingSchedule({
                                  ...editingSchedule,
                                  start_time: e.target.value + ':00'
                                })}
                                style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', flex: 1 }}
                              />
                              <input
                                type="time"
                                value={editingSchedule.end_time.substring(0, 5)}
                                onChange={(e) => setEditingSchedule({
                                  ...editingSchedule,
                                  end_time: e.target.value + ':00'
                                })}
                                style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', flex: 1 }}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="Location"
                              value={editingSchedule.location || ''}
                              onChange={(e) => setEditingSchedule({
                                ...editingSchedule,
                                location: e.target.value
                              })}
                              style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px' }}
                            />
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => handleUpdateSchedule(sched.id)}
                                className="btn-primary"
                                style={{ padding: '0.5rem 1rem', width: 'auto', fontSize: '0.875rem' }}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingSchedule(null)}
                                className="btn-secondary"
                                style={{ padding: '0.5rem 1rem', width: 'auto', fontSize: '0.875rem' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="schedule-day">{daysOfWeek[sched.day_of_week]}</div>
                            <div className="schedule-time">
                              {formatTime(sched.start_time)} - {formatTime(sched.end_time)}
                            </div>
                            {sched.location && (
                              <div className="schedule-location">📍 {sched.location}</div>
                            )}
                            <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => setEditingSchedule(sched)}
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  background: 'var(--teal-bright)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem'
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteSchedule(sched.id)}
                                style={{
                                  padding: '0.25rem 0.75rem',
                                  background: 'var(--error)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem'
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Schedule */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                  <h4 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>Add New Schedule</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <select
                      value={newSchedule.day_of_week}
                      onChange={(e) => setNewSchedule({
                        ...newSchedule,
                        day_of_week: parseInt(e.target.value)
                      })}
                      style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px' }}
                    >
                      {daysOfWeek.map((day, idx) => (
                        <option key={idx} value={idx}>{day}</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="time"
                        value={newSchedule.start_time}
                        onChange={(e) => setNewSchedule({
                          ...newSchedule,
                          start_time: e.target.value
                        })}
                        placeholder="Start Time"
                        style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', flex: 1 }}
                      />
                      <input
                        type="time"
                        value={newSchedule.end_time}
                        onChange={(e) => setNewSchedule({
                          ...newSchedule,
                          end_time: e.target.value
                        })}
                        placeholder="End Time"
                        style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', flex: 1 }}
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Location (e.g., Room 101)"
                      value={newSchedule.location}
                      onChange={(e) => setNewSchedule({
                        ...newSchedule,
                        location: e.target.value
                      })}
                      style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px' }}
                    />
                    <button
                      onClick={handleAddSchedule}
                      className="btn-primary"
                      style={{ padding: '0.75rem 1.5rem', width: 'auto' }}
                    >
                      Add Schedule
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Students Tab */}
          {activeTab === 'students' && (
            <div className="professor-tab-content">
              <div className="course-info-card">
                <h3>Enrolled Students ({enrolledStudents.length})</h3>
                {enrolledStudents.length > 0 ? (
                  <div className="student-list">
                    {enrolledStudents.map((student) => (
                      <div key={student.id} className="student-item" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div className="student-avatar">
                            {(student.first_name?.charAt(0) || '') + (student.last_name?.charAt(0) || '')}
                          </div>
                          <div className="student-info">
                            <div className="student-name">
                              {student.first_name} {student.last_name}
                            </div>
                            {student.email && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {student.email}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnenrollStudent(student.registration_id)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--error)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Unenroll
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>No students enrolled</p>
                )}
              </div>

              <div className="course-info-card" style={{ marginTop: '2rem' }}>
                <h3>Add Students to Course</h3>
                {allStudents.length > 0 ? (
                  <div className="student-list">
                    {allStudents.map((student) => (
                      <div key={student.id} className="student-item" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div className="student-avatar">
                            {(student.first_name?.charAt(0) || '') + (student.last_name?.charAt(0) || '')}
                          </div>
                          <div className="student-info">
                            <div className="student-name">
                              {student.first_name} {student.last_name}
                            </div>
                            {student.email && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {student.email}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleEnrollStudent(student.id)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--teal-bright)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Enroll
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>All students are already enrolled</p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}