'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Course, Profile } from '../types'
import { getCourseColor } from '../types'

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [professors, setProfessors] = useState<Profile[]>([])
  const [courseProfessorsByCourse, setCourseProfessorsByCourse] = useState<Record<string, Profile[]>>({})
  const [loading, setLoading] = useState(true)
  const [assigningProfessor, setAssigningProfessor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creatingCourse, setCreatingCourse] = useState(false)
  const [newCourseCode, setNewCourseCode] = useState('')
  const [newCourseName, setNewCourseName] = useState('')
  const [newCourseDescription, setNewCourseDescription] = useState('')
  const [newCourseCredits, setNewCourseCredits] = useState('')
  const [newCourseSemester, setNewCourseSemester] = useState('')
  const [newCourseAcademicYear, setNewCourseAcademicYear] = useState('')
  const [courseSearchQuery, setCourseSearchQuery] = useState('')

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role !== 'admin') return

    const { data: profilesData } = await supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name, role, created_at')
      .eq('role', 'professor')
    if (profilesData) setProfessors(profilesData as Profile[])

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
      if (Array.isArray(json.courses)) setCourses(json.courses as Course[])
      if (Array.isArray(json.courseProfessors)) {
        const map: Record<string, Profile[]> = {}
        for (const row of json.courseProfessors as { course_id: string; professor: { id: string; email: string | null; first_name: string | null; last_name: string | null } }[]) {
          if (!row.course_id || !row.professor) continue
          const courseId = row.course_id
          const prof = row.professor
          if (!map[courseId]) map[courseId] = []
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
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      await fetchData()
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

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
    await fetchData()
    setAssigningProfessor(null)
  }

  const courseSearchLower = courseSearchQuery.trim().toLowerCase()
  const filteredCourses =
    courseSearchLower === ''
      ? courses
      : courses.filter(
          (c) =>
            (c.name ?? '').toLowerCase().includes(courseSearchLower) ||
            (c.code ?? '').toLowerCase().includes(courseSearchLower)
        )

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--navy-dark)', marginBottom: '1rem' }}>
        Course Management
      </h2>
      {error && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}
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
                await fetchData()
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
        <>
          <div style={{ marginBottom: '1rem', maxWidth: 320 }}>
            <input
              type="search"
              className="form-control"
              placeholder="Search by course name or code..."
              value={courseSearchQuery}
              onChange={(e) => setCourseSearchQuery(e.target.value)}
              aria-label="Search courses"
              style={{ width: '100%' }}
            />
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            Showing {filteredCourses.length}{filteredCourses.length !== courses.length ? ` of ${courses.length}` : ''} courses
          </p>
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
                {filteredCourses.map((course) => {
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
                            if (professorId) handleAssignProfessor(course.id, professorId)
                          }}
                        >
                          {assigningProfessor === course.id ? 'Assigning…' : 'Assign'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
          <p>No courses found</p>
        </div>
      )}
    </div>
  )
}
