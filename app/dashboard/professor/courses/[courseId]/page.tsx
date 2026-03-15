'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Notifications from '../../../student/components/Notifications'
import DocumentViewer from '../../../student/components/DocumentViewer'
import UserMenu from '../../../components/UserMenu'

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
  section_id?: string | null
}

interface Student {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  roll_number?: string | null
}

interface CourseSection {
  id: string
  course_id: string
  name: string
  description: string | null
  sort_order: number
  created_at: string
}

interface EnrolledStudent extends Student {
  registration_id: string
  registered_at: string
  section_id?: string | null
  section?: { id: string; name: string } | null
}

interface AttendanceRecord {
  student_id: string
  date: string
  status: string
  notes: string | null
}

interface QuizQuestion {
  question: string
  choices: string[]
  correct_index: number
}

interface Assignment {
  id: string
  title: string
  description: string | null
  due_date: string
  max_points: number
  assignment_type: string | null
  instructions: string | null
  submission_count?: number
  quiz_questions?: QuizQuestion[] | null
  show_grades_to_students?: boolean
  is_published?: boolean
  section_id?: string | null
  is_group_assignment?: boolean
  group_size?: number | null
}

interface AssignmentGroup {
  id: string
  name: string
  sort_order: number
  students: { id: string; first_name: string | null; last_name: string | null; email?: string | null }[]
}

interface CourseMaterial {
  id: string
  course_id: string
  file_name: string
  file_path: string
  created_at: string
}

interface CourseGrade {
  id: string
  student_id: string
  course_id: string
  assignment_name: string
  grade: number
  max_grade: number | null
  assignment_type: string | null
  graded_at: string | null
}

interface Announcement {
  id: string
  course_id: string
  author_id: string
  title: string
  content: string
  created_at: string
  author?: { first_name: string | null; last_name: string | null } | null
}

interface CustomClass {
  id: string
  course_id: string
  section_id: string | null
  class_date: string
  start_time: string
  end_time: string
  location: string | null
  created_at: string
}

const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ProfessorCourseDetail() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.courseId as string
  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState<Course | null>(null)
  const [schedule, setSchedule] = useState<Schedule[]>([])
  const [customClasses, setCustomClasses] = useState<CustomClass[]>([])
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([])
  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0])
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, AttendanceRecord>>({})
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'schedule' | 'students' | 'assignments' | 'grades' | 'materials' | 'announcements'>('overview')
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [newSchedule, setNewSchedule] = useState({
    day_of_week: 1,
    start_time: '10:00',
    end_time: '11:30',
    location: '',
    section_id: '' as string | null | ''
  })
  const [newCustomClass, setNewCustomClass] = useState<{
    class_date: string
    start_time: string
    end_time: string
    location: string
    section_id: string | null | ''
  }>({
    class_date: '',
    start_time: '10:00',
    end_time: '11:30',
    location: '',
    section_id: ''
  })
  const [assignmentSectionId, setAssignmentSectionId] = useState<string | null | ''>('')
  const [gradesSectionId, setGradesSectionId] = useState<string | null>(null)
  const [gradesScopeChosen, setGradesScopeChosen] = useState(false)
  const [userName, setUserName] = useState<string>('')
  const [userInitials, setUserInitials] = useState<string>('')
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<{ assignment_id: string; student_id: string }[]>([])
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)
  const [showAssignmentForm, setShowAssignmentForm] = useState(false)
  const [viewingDocument, setViewingDocument] = useState<{ url: string; fileName: string } | null>(null)
  const [materials, setMaterials] = useState<CourseMaterial[]>([])
  const [materialsLoading, setMaterialsLoading] = useState(false)
  const [materialUploading, setMaterialUploading] = useState(false)
  const [materialError, setMaterialError] = useState<string | null>(null)
  const [ragProcessMessage, setRagProcessMessage] = useState<string | null>(null)
  const [indexingMaterialId, setIndexingMaterialId] = useState<string | null>(null)
  const [newAssignment, setNewAssignment] = useState({
    title: '',
    description: '',
    due_date: '',
    due_time: '',
    max_points: 100,
    assignment_type: '',
    instructions: ''
  })
  const [courseGrades, setCourseGrades] = useState<CourseGrade[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [announcementsLoading, setAnnouncementsLoading] = useState(false)
  const [postingAnnouncement, setPostingAnnouncement] = useState(false)
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', content: '' })
  const [assignmentTemplates, setAssignmentTemplates] = useState([
    { name: 'Homework', type: 'homework', points: 100, description: 'Weekly homework assignment' },
    { name: 'Quiz', type: 'quiz', points: 50, description: 'Short quiz assessment' },
    { name: 'Project', type: 'project', points: 200, description: 'Major project assignment' },
    { name: 'Exam', type: 'exam', points: 300, description: 'Final exam' },
    { name: 'Lab', type: 'lab', points: 100, description: 'Laboratory assignment' },
    { name: 'Group Assignment', type: 'group_assignment', points: 100, description: 'Group work; students are randomly assigned to groups' },
    { name: 'Group Project', type: 'group_project', points: 200, description: 'Group project; students are randomly assigned to groups' }
  ])
  const [groupSize, setGroupSize] = useState<number>(3)
  const [assignmentGroups, setAssignmentGroups] = useState<Record<string, AssignmentGroup[]>>({})
  const [creatingGroupsFor, setCreatingGroupsFor] = useState<string | null>(null)
  const [loadingGroupsFor, setLoadingGroupsFor] = useState<string | null>(null)
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [showGradesToStudents, setShowGradesToStudents] = useState(false)
  const [attendanceSummary, setAttendanceSummary] = useState<{
    studentId: string
    roll_number?: string | null
    first_name: string | null
    last_name: string | null
    present: number
    total: number
    percentage: number
  }[]>([])
  const [attendanceSummaryLoading, setAttendanceSummaryLoading] = useState(false)
  const [showAttendanceDetails, setShowAttendanceDetails] = useState(false)
  const [exportingGrades, setExportingGrades] = useState(false)
  const [studentSearchQuery, setStudentSearchQuery] = useState('')
  const [sections, setSections] = useState<CourseSection[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [addingSection, setAddingSection] = useState(false)
  const [assigningSection, setAssigningSection] = useState<string | null>(null)
  const [attendanceSectionId, setAttendanceSectionId] = useState<string | null>(null)
  const [announcementSectionId, setAnnouncementSectionId] = useState<string | null | ''>('')

  useEffect(() => {
    let cancelled = false
    async function loadInitial() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) {
          if (!cancelled && !user) router.push('/')
          return
        }
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, role, must_reset_password')
          .eq('id', user.id)
          .single()
        if (!profile || profile.role !== 'professor' || cancelled) {
          if (!cancelled) router.push('/dashboard')
          return
        }
        if (profile.must_reset_password && !cancelled) {
          router.replace('/reset-password')
          return
        }
        const firstName = profile.first_name || ''
        const lastName = profile.last_name || ''
        setUserName(`${firstName} ${lastName}`.trim() || 'Professor')
        setUserInitials((firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'P')
        setCurrentUserId(user.id)
        await Promise.all([
          fetchCourseData(),
          fetchAssignments(),
          fetchCourseGrades(),
          fetchSections()
        ])
      } catch (error) {
        console.error('Error loading course page:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadInitial()
    return () => { cancelled = true }
  }, [courseId])

  useEffect(() => {
    if (courseId && attendanceDate) {
      fetchAttendanceForDate(attendanceDate)
    }
  }, [attendanceDate, courseId])

  // Defer loading all students until user opens Students tab (sections loaded on course load)
  useEffect(() => {
    if (activeTab === 'students') {
      fetchAllStudents()
    }
  }, [activeTab, courseId])

  useEffect(() => {
    if (activeTab === 'announcements' && courseId) {
      fetchAnnouncements()
    }
  }, [activeTab, courseId])

  useEffect(() => {
    if (activeTab === 'materials' && courseId) {
      fetchCourseMaterials()
    }
  }, [activeTab, courseId])

  // Refetch grades when opening Grades tab so it shows latest data after grading in Assignments tab
  useEffect(() => {
    if (activeTab === 'grades' && courseId) {
      fetchCourseGrades()
      fetchAssignments()
    }
  }, [activeTab, courseId])

  async function fetchCourseMaterials() {
    if (!courseId) return
    setMaterialsLoading(true)
    try {
      const { data, error } = await supabase
        .from('course_materials')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setMaterials(data || [])
    } catch (err) {
      console.error('Error fetching course materials:', err)
      setMaterials([])
    } finally {
      setMaterialsLoading(false)
    }
  }

  function isPdfFile(file: File): boolean {
    const name = (file.name || '').toLowerCase()
    if (!name.endsWith('.pdf')) return false
    return file.type === 'application/pdf' || file.type === ''
  }

  async function handleUploadMaterial(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !courseId) return
    if (!isPdfFile(file)) {
      setMaterialError('Only PDF files are allowed.')
      return
    }
    setMaterialError(null)
    setRagProcessMessage(null)
    setMaterialUploading(true)
    try {
      const ext = file.name.toLowerCase().endsWith('.pdf') ? '.pdf' : '.pdf'
      const baseName = file.name.replace(/\.pdf$/i, '') || 'document'
      const sanitized = baseName.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80)
      const filePath = `${courseId}/${crypto.randomUUID()}_${sanitized}${ext}`
      const { error: uploadError } = await supabase.storage
        .from('course-materials')
        .upload(filePath, file, { contentType: 'application/pdf', upsert: false })
      if (uploadError) throw uploadError
      const { data: insertedMaterial, error: insertError } = await supabase
        .from('course_materials')
        .insert({ course_id: courseId, file_name: file.name, file_path: filePath, college_id: 1 })
        .select('id')
        .single()
      if (insertError) throw insertError
      await fetchCourseMaterials()
      if (insertedMaterial?.id) {
        setRagProcessMessage('Processing PDF for search…')
        const { data: { session } } = await supabase.auth.getSession()
        fetch('/api/course-materials/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
          body: JSON.stringify({ materialId: insertedMaterial.id }),
        })
          .then((r) => r.json())
          .then((body) => {
            if (body.error) {
              setRagProcessMessage(`RAG failed: ${body.error}`)
            } else {
              setRagProcessMessage(body.chunks ? `Ready: ${body.chunks} chunks indexed for search.` : null)
            }
          })
          .catch((err) => setRagProcessMessage(`RAG failed: ${err?.message || 'request failed'}`))
      }
    } catch (err: any) {
      setMaterialError(err?.message || 'Failed to upload. Only PDF is allowed.')
    } finally {
      setMaterialUploading(false)
    }
  }

  function getMaterialPublicUrl(filePath: string): string {
    const { data } = supabase.storage.from('course-materials').getPublicUrl(filePath)
    return data.publicUrl
  }

  async function handleIndexForSearch(m: CourseMaterial) {
    setRagProcessMessage(null)
    setIndexingMaterialId(m.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/course-materials/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
        body: JSON.stringify({ materialId: m.id }),
      })
      const body = await res.json()
      if (!res.ok) {
        setRagProcessMessage(`RAG failed: ${body.error || res.statusText}`)
        return
      }
      setRagProcessMessage(body.chunks != null ? `Ready: ${body.chunks} chunks indexed for search.` : 'Indexed.')
    } catch (err: any) {
      setRagProcessMessage(`RAG failed: ${err?.message || 'request failed'}`)
    } finally {
      setIndexingMaterialId(null)
    }
  }

  async function handleDeleteMaterial(m: CourseMaterial) {
    if (!confirm(`Remove "${m.file_name}" from course materials?`)) return
    try {
      await supabase.storage.from('course-materials').remove([m.file_path])
      const { error } = await supabase.from('course_materials').delete().eq('id', m.id)
      if (error) throw error
      await fetchCourseMaterials()
    } catch (err) {
      console.error('Error deleting material:', err)
      alert('Failed to remove material.')
    }
  }

  async function fetchAllStudents() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

      const res = await fetch('/api/professor/students', {
        method: 'GET',
        headers,
        credentials: 'include',
      })

      if (!res.ok) {
        console.error('Error fetching students list for professor:', await res.text())
        setAllStudents([])
        return
      }

      const json = await res.json().catch(() => null)
      const allStudentsData = (json?.students ?? []) as Student[]
      const enrolledIds = new Set(enrolledStudents.map((s) => s.id))
      setAllStudents(allStudentsData.filter((s) => !enrolledIds.has(s.id)))
    } catch (error) {
      console.error('Error fetching all students:', error)
    }
  }

  async function fetchSections() {
    if (!courseId) return
    setSectionsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch(`/api/professor/courses/${courseId}/sections`, { credentials: 'include', headers })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json().catch(() => null)
      setSections((json?.sections ?? []) as CourseSection[])
    } catch (error) {
      console.error('Error fetching sections:', error)
      setSections([])
    } finally {
      setSectionsLoading(false)
    }
  }

  async function handleAddSection() {
    const name = newSectionName.trim()
    if (!name) return
    setAddingSection(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch(`/api/professor/courses/${courseId}/sections`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ name, sort_order: sections.length }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || res.statusText)
      }
      const section = await res.json()
      setSections((prev) => [...prev, section].sort((a, b) => a.sort_order - b.sort_order))
      setNewSectionName('')
    } catch (error) {
      console.error('Error adding section:', error)
      alert(error instanceof Error ? error.message : 'Failed to add section')
    } finally {
      setAddingSection(false)
    }
  }

  async function handleDeleteSection(sectionId: string) {
    if (!confirm('Delete this section? Students in it will be unassigned (not unenrolled).')) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch(`/api/professor/courses/${courseId}/sections/${sectionId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers,
      })
      if (!res.ok) throw new Error(await res.text())
      setSections((prev) => prev.filter((s) => s.id !== sectionId))
      await fetchCourseData()
    } catch (error) {
      console.error('Error deleting section:', error)
      alert('Failed to delete section')
    }
  }

  async function handleAssignSection(registrationId: string, sectionId: string | null) {
    setAssigningSection(registrationId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch(`/api/professor/courses/${courseId}/enrolled/assign-section`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ registrationId, sectionId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || res.statusText)
      }
      await fetchCourseData()
    } catch (error) {
      console.error('Error assigning section:', error)
      alert(error instanceof Error ? error.message : 'Failed to assign section')
    } finally {
      setAssigningSection(null)
    }
  }

  function getStudentsInSection(sectionId: string | null | undefined): EnrolledStudent[] {
    if (sectionId == null || sectionId === '') return enrolledStudents
    return enrolledStudents.filter((s) => s.section_id === sectionId)
  }

  async function fetchCourseData() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

      const [courseRes, scheduleRes, enrolledRes] = await Promise.all([
        fetch(`/api/professor/courses/${courseId}`, { credentials: 'include', headers }).then(async (r) => {
          if (!r.ok) return { data: null }
          const data = await r.json().catch(() => null)
          return { data }
        }),
        supabase
          .from('course_schedules')
          .select('*')
          .eq('course_id', courseId)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true }),
        (async () => {
          const res = await fetch(`/api/professor/courses/${courseId}/enrolled`, { credentials: 'include', headers })
          if (!res.ok) return null
          const json = await res.json().catch(() => null)
          return json?.enrolled ?? null
        })()
      ])
      if (courseRes.data) setCourse(courseRes.data)
      if (scheduleRes.data) setSchedule(scheduleRes.data)
      let enrolledList: EnrolledStudent[] = []
      if (Array.isArray(enrolledRes)) {
        enrolledList = enrolledRes as EnrolledStudent[]
        setEnrolledStudents(enrolledList)
      }
      // Custom classes
      const { data: customRes } = await supabase
        .from('course_custom_classes')
        .select('*')
        .eq('course_id', courseId)
        .order('class_date', { ascending: true })
        .order('start_time', { ascending: true })
      if (customRes) setCustomClasses(customRes as CustomClass[])

      await fetchAttendanceForDate(attendanceDate)
      if (enrolledList.length > 0) {
        await fetchAttendanceSummary(enrolledList)
      }
    } catch (error) {
      console.error('Error fetching course data:', error)
    }
  }

  async function fetchCourseGrades() {
    try {
      const { data, error } = await supabase
        .from('grades')
        .select('*')
        .eq('course_id', courseId)
        .order('assignment_name')
      if (error) throw error
      setCourseGrades((data || []) as CourseGrade[])
    } catch (error) {
      console.error('Error fetching grades:', error)
      setCourseGrades([])
    }
  }

  async function fetchAttendanceSummary(enrolled: EnrolledStudent[]) {
    try {
      setAttendanceSummaryLoading(true)
      const { data, error } = await supabase
        .from('attendance')
        .select('student_id, status')
        .eq('course_id', courseId)

      if (error) throw error

      const counts: Record<string, { present: number; total: number }> = {}
      for (const row of (data || []) as { student_id: string; status: string }[]) {
        const sid = row.student_id
        if (!counts[sid]) counts[sid] = { present: 0, total: 0 }
        counts[sid].total += 1
        if (row.status === 'present') counts[sid].present += 1
      }

      const summary = enrolled.map((stu) => {
        const c = counts[stu.id] || { present: 0, total: 0 }
        const pct = c.total > 0 ? Math.round((c.present / c.total) * 100) : 0
        return {
          studentId: stu.id,
          roll_number: stu.roll_number ?? null,
          first_name: stu.first_name ?? null,
          last_name: stu.last_name ?? null,
          present: c.present,
          total: c.total,
          percentage: pct,
        }
      })

      summary.sort((a, b) => {
        const ra = (a.roll_number || '').toString().toLowerCase()
        const rb = (b.roll_number || '').toString().toLowerCase()
        if (ra && rb && ra !== rb) return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' })
        if (ra && !rb) return -1
        if (!ra && rb) return 1
        const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase()
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase()
        return nameA.localeCompare(nameB)
      })

      setAttendanceSummary(summary)
    } catch (error) {
      console.error('Error fetching attendance summary:', error)
      setAttendanceSummary([])
    } finally {
      setAttendanceSummaryLoading(false)
    }
  }

  async function fetchAnnouncements() {
    if (!courseId) return
    setAnnouncementsLoading(true)
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select(`
          id,
          course_id,
          author_id,
          title,
          content,
          created_at,
          author:user_profiles(first_name, last_name)
        `)
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })
      if (error) throw error
      const raw = (data || []) as { author?: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] }[]
      const list = raw.map((row) => ({
        ...row,
        author: Array.isArray(row.author) ? row.author[0] ?? null : row.author ?? null
      })) as Announcement[]
      setAnnouncements(list)
    } catch (err) {
      console.error('Error fetching announcements:', err)
      setAnnouncements([])
    } finally {
      setAnnouncementsLoading(false)
    }
  }

  async function handlePostAnnouncement(e: React.FormEvent) {
    e.preventDefault()
    if (!newAnnouncement.title.trim()) return
    setPostingAnnouncement(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/professor/courses/${courseId}/announcements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({
          title: newAnnouncement.title.trim(),
          content: newAnnouncement.content.trim(),
          sectionId: typeof announcementSectionId === 'string' && announcementSectionId !== '' ? announcementSectionId : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to post announcement')
      }
      setNewAnnouncement({ title: '', content: '' })
      await fetchAnnouncements()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to post announcement')
    } finally {
      setPostingAnnouncement(false)
    }
  }

  async function fetchAssignments() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch(`/api/professor/courses/${courseId}/assignments`, { credentials: 'include', headers })
      if (!res.ok) {
        console.error('Error fetching assignments:', await res.text())
        return
      }
      const json = await res.json().catch(() => ({}))
      const assignmentsList = (json?.assignments ?? []) as Assignment[]
      const submissionCounts = (json?.submissionCounts ?? {}) as Record<string, number>
      setAssignments(assignmentsList)
      // Build submission list for section counts (we don't get full rows from GET; reuse existing or leave empty)
      if (assignmentsList.length > 0) {
        const ids = assignmentsList.map((a) => a.id)
        const { data: submissionRows } = await supabase
          .from('assignment_submissions')
          .select('assignment_id, student_id')
          .in('assignment_id', ids)
        setAssignmentSubmissions((submissionRows ?? []) as { assignment_id: string; student_id: string }[])
      } else {
        setAssignmentSubmissions([])
      }
    } catch (error) {
      console.error('Error fetching assignments:', error)
    }
  }

  async function handleCreateAssignment(e: React.FormEvent) {
    e.preventDefault()
    try {
      const dueDateTime = newAssignment.due_date && newAssignment.due_time
        ? `${newAssignment.due_date}T${newAssignment.due_time}:00`
        : newAssignment.due_date

      // Save assignment data before resetting
      const assignmentTitle = newAssignment.title
      const assignmentDueDate = dueDateTime

      const isQuiz = newAssignment.assignment_type === 'quiz'
      const isGroupType = newAssignment.assignment_type === 'group_assignment' || newAssignment.assignment_type === 'group_project'
      const payload: Record<string, unknown> = {
        course_id: courseId,
        title: newAssignment.title,
        description: newAssignment.description || null,
        due_date: dueDateTime,
        max_points: newAssignment.max_points,
        assignment_type: newAssignment.assignment_type || null,
        instructions: newAssignment.instructions || null,
        // New assignments start as drafts until professor posts them
        is_published: false
      }
      if (assignmentSectionId && typeof assignmentSectionId === 'string') {
        payload.section_id = assignmentSectionId
      } else {
        payload.section_id = null
      }
      // Only send group fields when creating a group assignment (requires migration 20250311100000)
      if (isGroupType) {
        payload.is_group_assignment = true
        payload.group_size = Math.max(2, groupSize)
      }
      if (isQuiz) {
        const valid = quizQuestions.filter((q) => q.question.trim() && q.choices.filter((c) => c.trim()).length >= 2)
        if (valid.length === 0) {
          alert('Quiz must have at least one question with at least two choices.')
          return
        }
        payload.quiz_questions = valid.map((q) => {
          const trimmed = q.choices.map((c) => c.trim()).filter(Boolean)
          const correctText = (q.choices[q.correct_index] ?? '').trim()
          let newCorrect = trimmed.indexOf(correctText)
          if (newCorrect < 0) newCorrect = 0
          return { question: q.question.trim(), choices: trimmed, correct_index: newCorrect }
        })
        payload.show_grades_to_students = false
      }

      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

      const body: Record<string, unknown> = {
        title: payload.title,
        description: payload.description,
        due_date: payload.due_date,
        max_points: payload.max_points,
        assignment_type: payload.assignment_type,
        instructions: payload.instructions,
        section_id: payload.section_id ?? undefined,
      }
      if (isGroupType) {
        body.is_group_assignment = true
        body.group_size = payload.group_size
      }
      if (isQuiz) {
        body.quiz_questions = payload.quiz_questions
        body.show_grades_to_students = payload.show_grades_to_students
      }

      const res = await fetch(`/api/professor/courses/${courseId}/assignments`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || res.statusText || 'Failed to create assignment')

      setShowAssignmentForm(false)
      setNewAssignment({
        title: '',
        description: '',
        due_date: '',
        due_time: '',
        max_points: 100,
        assignment_type: '',
        instructions: ''
      })
      setAssignmentSectionId('')
      setQuizQuestions([])
      setShowGradesToStudents(false)
      await fetchAssignments()
    } catch (error) {
      console.error('Error creating assignment:', error)
      const message = error instanceof Error ? error.message : 'Failed to create assignment'
      alert(message)
    }
  }

  async function handleUpdateAssignment(e: React.FormEvent) {
    e.preventDefault()
    if (!editingAssignment) return

    try {
      const dueDateTime = newAssignment.due_date && newAssignment.due_time
        ? `${newAssignment.due_date}T${newAssignment.due_time}:00`
        : newAssignment.due_date

      const isGroupType = newAssignment.assignment_type === 'group_assignment' || newAssignment.assignment_type === 'group_project'
      const updatePayload: Record<string, unknown> = {
        title: newAssignment.title,
        description: newAssignment.description || null,
        due_date: dueDateTime,
        max_points: newAssignment.max_points,
        assignment_type: newAssignment.assignment_type || null,
        instructions: newAssignment.instructions || null
      }
      if (assignmentSectionId && typeof assignmentSectionId === 'string') {
        updatePayload.section_id = assignmentSectionId
      } else {
        updatePayload.section_id = null
      }
      // Only send group fields when editing a group assignment (requires migration 20250311100000)
      if (isGroupType) {
        updatePayload.is_group_assignment = true
        updatePayload.group_size = Math.max(2, groupSize)
      }
      if (newAssignment.assignment_type === 'quiz') {
        const valid = quizQuestions.filter((q) => q.question.trim() && q.choices.filter((c) => c.trim()).length >= 2)
        if (valid.length === 0) {
          alert('Quiz must have at least one question with at least two choices.')
          return
        }
        updatePayload.quiz_questions = valid.map((q) => {
          const trimmed = q.choices.map((c) => c.trim()).filter(Boolean)
          const correctText = (q.choices[q.correct_index] ?? '').trim()
          let newCorrect = trimmed.indexOf(correctText)
          if (newCorrect < 0) newCorrect = 0
          return { question: q.question.trim(), choices: trimmed, correct_index: newCorrect }
        })
        updatePayload.show_grades_to_students = showGradesToStudents
      }

      const { error } = await supabase
        .from('assignments')
        .update(updatePayload)
        .eq('id', editingAssignment.id)

      if (error) throw error

      setEditingAssignment(null)
      setShowAssignmentForm(false)
      setNewAssignment({
        title: '',
        description: '',
        due_date: '',
        due_time: '',
        max_points: 100,
        assignment_type: '',
        instructions: ''
      })
      setAssignmentSectionId('')
      setQuizQuestions([])
      setShowGradesToStudents(false)
      await fetchAssignments()
    } catch (error) {
      console.error('Error updating assignment:', error)
      alert('Failed to update assignment')
    }
  }

  async function handleDeleteAssignment(assignmentId: string) {
    if (!confirm('Are you sure you want to delete this assignment? This will also delete all submissions.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('id', assignmentId)

      if (error) throw error

      await fetchAssignments()
    } catch (error) {
      console.error('Error deleting assignment:', error)
      alert('Failed to delete assignment')
    }
  }

  async function fetchAssignmentGroups(assignmentId: string) {
    setLoadingGroupsFor(assignmentId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch(`/api/professor/courses/${courseId}/assignments/${assignmentId}/groups`, { credentials: 'include', headers })
      if (!res.ok) return
      const json = await res.json().catch(() => null)
      const groups = (json?.groups ?? []) as AssignmentGroup[]
      setAssignmentGroups((prev) => ({ ...prev, [assignmentId]: groups }))
    } catch (e) {
      console.error('Error fetching groups:', e)
    } finally {
      setLoadingGroupsFor(null)
    }
  }

  async function handleCreateGroups(assignment: Assignment) {
    if (!assignment.is_group_assignment || assignment.group_size == null) return
    setCreatingGroupsFor(assignment.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const res = await fetch(`/api/professor/courses/${courseId}/assignments/${assignment.id}/create-groups`, {
        method: 'POST',
        credentials: 'include',
        headers,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || res.statusText)
      }
      await fetchAssignmentGroups(assignment.id)
    } catch (e) {
      console.error('Error creating groups:', e)
      alert(e instanceof Error ? e.message : 'Failed to create groups')
    } finally {
      setCreatingGroupsFor(null)
    }
  }

  async function handlePostAssignment(assignment: Assignment) {
    if (assignment.is_published) return
    try {
      const { error } = await supabase
        .from('assignments')
        .update({ is_published: true })
        .eq('id', assignment.id)
      if (error) throw error

      // Notify enrolled students that a new assignment was posted
      const { data: enrolledStudents } = await supabase
        .from('course_registrations')
        .select('student_id')
        .eq('course_id', courseId)
        .eq('status', 'enrolled')

      if (enrolledStudents?.length) {
        const { data: { session } } = await supabase.auth.getSession()
        for (const enrollment of enrolledStudents as { student_id: string }[]) {
          try {
            const response = await fetch('/api/notifications/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
              },
              credentials: 'include',
              body: JSON.stringify({
                userId: enrollment.student_id,
                title: 'New Assignment',
                message: `New assignment "${assignment.title}" has been posted. Due: ${
                  assignment.due_date ? new Date(assignment.due_date).toLocaleString() : 'No due date'
                }`,
                type: 'assignment',
                relatedId: assignment.id,
              }),
            })
            if (!response.ok) {
              console.error('Failed to create notification for assignment', assignment.id)
            }
          } catch (err) {
            console.error('Error creating notification:', err)
          }
        }
      }

      await fetchAssignments()
    } catch (err) {
      console.error('Error posting assignment:', err)
      alert('Failed to post assignment')
    }
  }

  function useTemplate(template: typeof assignmentTemplates[0]) {
    setNewAssignment({
      title: '',
      description: template.description,
      due_date: '',
      due_time: '',
      max_points: template.points,
      assignment_type: template.type,
      instructions: ''
    })
    if (template.type === 'group_assignment' || template.type === 'group_project') {
      setGroupSize(3)
    }
    setShowAssignmentForm(true)
  }

  function startEditAssignment(assignment: Assignment) {
    const dueDate = new Date(assignment.due_date)
    setEditingAssignment(assignment)
    setNewAssignment({
      title: assignment.title,
      description: assignment.description || '',
      due_date: dueDate.toISOString().split('T')[0],
      due_time: dueDate.toTimeString().slice(0, 5),
      max_points: assignment.max_points,
      assignment_type: assignment.assignment_type || '',
      instructions: assignment.instructions || ''
    })
    setAssignmentSectionId(assignment.section_id ?? '')
    setGroupSize(assignment.group_size != null && assignment.group_size >= 2 ? assignment.group_size : 3)
    const qq = assignment.quiz_questions
    if (Array.isArray(qq) && qq.length > 0) {
      setQuizQuestions(qq.map((q: QuizQuestion) => ({
        question: q.question || '',
        choices: Array.isArray(q.choices) ? [...q.choices] : ['', ''],
        correct_index: typeof q.correct_index === 'number' ? q.correct_index : 0
      })))
    } else {
      setQuizQuestions([{ question: '', choices: ['', ''], correct_index: 0 }])
    }
    setShowGradesToStudents(assignment.show_grades_to_students ?? false)
    setShowAssignmentForm(true)
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
          location: newSchedule.location || null,
          section_id: newSchedule.section_id || null
        })

      if (error) throw error

      setNewSchedule({
        day_of_week: 1,
        start_time: '10:00',
        end_time: '11:30',
        location: '',
        section_id: ''
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
          location: editingSchedule!.location || null,
          section_id: editingSchedule!.section_id || null
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

  function handlePrintAttendanceSummary() {
    if (typeof window === 'undefined') return
    window.print()
  }

  function handleExportAttendanceSummary() {
    if (typeof document === 'undefined' || !attendanceSummary.length) return
    const header = ['Roll number', 'Student name', 'Days present', 'Total days', 'Attendance %']
    const rows = attendanceSummary.map((row) => {
      const name = `${row.first_name || ''} ${row.last_name || ''}`.trim()
      return [
        row.roll_number || '',
        name,
        String(row.present),
        String(row.total),
        row.total > 0 ? String(row.percentage) : '',
      ]
    })
    const csv = [header, ...rows]
      .map((cols) => cols.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(','))
      .join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const code = course?.code || 'course'
    a.href = url
    a.download = `${code}-attendance.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handleExportGradesCsv() {
    if (typeof document === 'undefined' || assignments.length === 0 || enrolledStudents.length === 0) return
    setExportingGrades(true)
    try {
      const headers = ['Student', ...assignments.map((a) => a.title), 'Average %']
      const rows = enrolledStudents.map((student) => {
        const stuGrades = courseGrades.filter((g) => g.student_id === student.id)
        let totalPoints = 0
        let earnedPoints = 0
        const cells: string[] = []
        assignments.forEach((a) => {
          const g = stuGrades.find((gr) => gr.assignment_name === a.title)
          if (!g) {
            cells.push('')
          } else {
            const max = g.max_grade ?? a.max_points
            totalPoints += max || 0
            earnedPoints += Number(g.grade)
            cells.push(`${Number(g.grade)} / ${max}`)
          }
        })
        const avgPct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : null
        const name = `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.email || '—'
        return [
          name,
          ...cells,
          avgPct != null ? String(avgPct) : '',
        ]
      })

      const csv = [headers, ...rows]
        .map((cols) =>
          cols
            .map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"')
            .join(',')
        )
        .join('\r\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const code = course?.code || 'course'
      a.href = url
      a.download = `${code}-grades.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setExportingGrades(false)
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
          professor_id: currentUserId,
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
    const { logout } = await import('@/lib/auth'); await logout()
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
      <main className="canvas-main-content">
        <div className="canvas-topbar">
          <div className="canvas-topbar-brand">
            <span className="skeleton skeleton-text lg canvas-topbar-title" style={{ width: '180px' }} />
            <span className="skeleton canvas-topbar-logo-mobile" style={{ width: 48, height: 48, borderRadius: 8 }} />
          </div>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="skeleton skeleton-avatar" />
            <div className="canvas-user-menu-wrapper">
              <div className="canvas-user-menu canvas-user-menu-trigger">
                <div className="canvas-user-avatar skeleton" />
                <div>
                  <div className="skeleton skeleton-text lg" style={{ width: '120px', marginBottom: '0.25rem' }} />
                  <div className="skeleton skeleton-text sm" style={{ width: '60px' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="canvas-content-area">
          <div className="skeleton skeleton-text lg" style={{ width: '50%', marginBottom: '1.5rem' }} />
          <div className="professor-tabs">
            {[1, 2, 3, 4].map((i) => (
              <button key={i} className="professor-tab" type="button">
                <span className="skeleton skeleton-text sm" style={{ width: '64px' }} />
              </button>
            ))}
          </div>
          <div className="skeleton-card skeleton">
            <div className="skeleton skeleton-text lg" style={{ width: '40%', marginBottom: '0.75rem' }} />
            <div className="skeleton skeleton-text sm" style={{ width: '90%', marginBottom: '0.5rem' }} />
            <div className="skeleton skeleton-text sm" style={{ width: '80%', marginBottom: '0.5rem' }} />
            <div className="skeleton skeleton-text sm" style={{ width: '70%' }} />
          </div>
        </div>
      </main>
    )
  }

  if (!course) {
    return (
      <main className="canvas-main-content">
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <p>Course not found</p>
          <Link href="/dashboard/professor" style={{ color: 'var(--teal-bright)' }}>
            Back to Dashboard
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="canvas-main-content">
        <div className="canvas-topbar">
          <div className="canvas-topbar-brand">
            <h1 className="canvas-topbar-title course-topbar-title">{course.code} - {course.name}</h1>
            <img src="/logo.png" alt="" className="canvas-topbar-logo-mobile" />
          </div>
          <div className="canvas-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {currentUserId && <Notifications userId={currentUserId} />}
            <UserMenu userName={userName} userInitials={userInitials} onLogout={handleLogout} />
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
            <button
              className={`professor-tab ${activeTab === 'assignments' ? 'active' : ''}`}
              onClick={() => setActiveTab('assignments')}
            >
              Assignments
            </button>
            <button
              className={`professor-tab ${activeTab === 'grades' ? 'active' : ''}`}
              onClick={() => setActiveTab('grades')}
            >
              Grades
            </button>
            <button
              className={`professor-tab ${activeTab === 'materials' ? 'active' : ''}`}
              onClick={() => setActiveTab('materials')}
            >
              Materials
            </button>
            <button
              className={`professor-tab ${activeTab === 'announcements' ? 'active' : ''}`}
              onClick={() => setActiveTab('announcements')}
            >
              Announcements
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
                </div>
              </div>

              <div className="course-detail-content">
                <div className="course-detail-main">
                  <div className="course-info-card">
                    <h3>Class Schedule</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Applies to all sections</p>
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

                  {/* Section A & Section B blocks */}
                  <div style={{ display: 'grid', gridTemplateColumns: sections.length >= 2 ? 'repeat(2, 1fr)' : '1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
                    {(sections.length >= 2 ? sections : [{ id: '', name: 'All students', sort_order: 0 } as CourseSection]).map((sec) => {
                      const sectionStudents = getStudentsInSection(sec.id)
                      const sectionSummary = sectionStudents.length ? attendanceSummary.filter((r) => sectionStudents.some((s) => s.id === r.studentId)) : []
                      const totalPoints = courseGrades.filter((g) => sectionStudents.some((s) => s.id === g.student_id)).reduce((s, g) => s + (g.max_grade || 0), 0)
                      const earnedPoints = courseGrades.filter((g) => sectionStudents.some((s) => s.id === g.student_id)).reduce((s, g) => s + Number(g.grade), 0)
                      const classAvgPct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : null
                      const assignmentsGradedCount = sectionStudents.length ? assignments.filter((a) => courseGrades.some((g) => g.assignment_name === a.title && sectionStudents.some((s) => s.id === g.student_id))).length : 0
                      const perStudentPct: number[] = []
                      sectionStudents.forEach((stu) => {
                        const stuGrades = courseGrades.filter((g) => g.student_id === stu.id)
                        const stuTotal = stuGrades.reduce((s, g) => s + (g.max_grade || 0), 0)
                        const stuEarned = stuGrades.reduce((s, g) => s + Number(g.grade), 0)
                        if (stuTotal > 0) perStudentPct.push((stuEarned / stuTotal) * 100)
                      })
                      const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 }
                      perStudentPct.forEach((p) => {
                        if (p >= 90) dist.A++
                        else if (p >= 80) dist.B++
                        else if (p >= 70) dist.C++
                        else if (p >= 60) dist.D++
                        else dist.F++
                      })
                      const studentsByGradeCount = sectionStudents.map((stu) => {
                        const stuGrades = courseGrades.filter((g) => g.student_id === stu.id)
                        const total = stuGrades.reduce((s, g) => s + (g.max_grade || 0), 0)
                        const earned = stuGrades.reduce((s, g) => s + Number(g.grade), 0)
                        const pct = total > 0 ? Math.round((earned / total) * 100) : null
                        return { student: stu, count: stuGrades.length, pct }
                      }).sort((a, b) => a.count - b.count)
                      const studentsWithFewerGrades = studentsByGradeCount.slice(0, 10)
                      const totals = sectionSummary.reduce((acc, r) => ({ present: acc.present + r.present, total: acc.total + r.total }), { present: 0, total: 0 })
                      const attPct = totals.total > 0 ? Math.round((totals.present / totals.total) * 100) : null
                      return (
                        <div key={sec.id || 'all'} className="course-info-card" style={{ borderLeft: sec.id ? '4px solid var(--teal-bright)' : undefined }}>
                          <h3 style={{ marginBottom: '0.5rem' }}>{sec.name}</h3>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>{sectionStudents.length} students</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Grades &amp; Analytics</span>
                            {sections.length >= 2 && (
                              <button type="button" onClick={() => setActiveTab('grades')} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', fontWeight: 500, color: 'var(--teal-bright)', background: 'transparent', border: '1px solid var(--teal-bright)', borderRadius: '6px', cursor: 'pointer' }}>View grades →</button>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.5rem' }}>
                            <div style={{ padding: '0.5rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg</div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{classAvgPct != null ? `${classAvgPct}%` : '—'}</div>
                            </div>
                            <div style={{ padding: '0.5rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Graded</div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{assignmentsGradedCount}</div>
                            </div>
                            <div style={{ padding: '0.5rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Attendance</div>
                              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{attPct != null ? `${attPct}%` : '—'}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.7rem', marginTop: '0.5rem' }}>
                            <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.2)', color: '#059669' }}>A ({dist.A})</span>
                            <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.2)', color: '#2563eb' }}>B ({dist.B})</span>
                            <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.2)', color: '#d97706' }}>C ({dist.C})</span>
                            <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(249,115,22,0.2)', color: '#ea580c' }}>D ({dist.D})</span>
                            <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.2)', color: '#dc2626' }}>F ({dist.F})</span>
                          </div>
                          {sectionStudents.length > 0 && studentsWithFewerGrades.length > 0 && (
                            <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Need attention</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.8rem' }}>
                                {studentsWithFewerGrades.map(({ student, pct }) => (
                                  <span key={student.id} style={{ padding: '2px 6px', background: 'var(--surface)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                    {[student.first_name, student.last_name].filter(Boolean).join(' ') || 'Unknown'} ({pct != null ? `${pct}%` : '—'})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="course-detail-sidebar">
                  <div className="course-info-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <h3 style={{ marginBottom: '0.1rem' }}>Attendance report</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {showAttendanceDetails && (
                          <button type="button" onClick={handleExportAttendanceSummary} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--teal-bright)', background: 'var(--teal-bright)', color: 'white', cursor: 'pointer' }}>Export</button>
                        )}
                        <button type="button" onClick={() => setShowAttendanceDetails((v) => !v)} aria-label={showAttendanceDetails ? 'Hide attendance details' : 'Show attendance details'} style={{ padding: '0.2rem 0.4rem', borderRadius: '999px', border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: '0.8rem' }}>{showAttendanceDetails ? '▲' : '▼'}</button>
                      </div>
                    </div>
                    {(() => {
                      const totals = attendanceSummary.reduce((acc, r) => ({ present: acc.present + r.present, total: acc.total + r.total }), { present: 0, total: 0 })
                      const pct = totals.total > 0 ? Math.round((totals.present / totals.total) * 100) : null
                      return (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                          Overall: <span style={{ fontWeight: 600, color: pct != null ? 'var(--text)' : 'var(--text-muted)' }}>{pct != null ? `${pct}%` : '—'}</span>
                        </p>
                      )
                    })()}
                    {showAttendanceDetails && (
                      <>
                        {attendanceSummaryLoading ? (
                          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Loading…</p>
                        ) : attendanceSummary.length > 0 ? (
                          <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320, fontSize: '0.8rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                  <th style={{ textAlign: 'left', padding: '0.4rem' }}>Roll</th>
                                  <th style={{ textAlign: 'left', padding: '0.4rem' }}>Student</th>
                                  <th style={{ textAlign: 'right', padding: '0.4rem' }}>%</th>
                                </tr>
                              </thead>
                              <tbody>
                                {attendanceSummary.map((row) => {
                                  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || '—'
                                  return (
                                    <tr key={row.studentId} style={{ borderBottom: '1px solid var(--border)' }}>
                                      <td style={{ padding: '0.4rem', color: 'var(--text-muted)' }}>{row.roll_number || '—'}</td>
                                      <td style={{ padding: '0.4rem' }}>{name}</td>
                                      <td style={{ padding: '0.4rem', textAlign: 'right', color: row.total > 0 && row.percentage < 75 ? '#ef4444' : 'var(--text)' }}>{row.total > 0 ? `${row.percentage}%` : '—'}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>No attendance records yet.</p>
                        )}
                      </>
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
                <h3>Take Attendance</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Select a section to see and mark attendance for that section.</p>
                {sections.length >= 2 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    {sections.map((sec) => {
                      const count = getStudentsInSection(sec.id).length
                      const isSelected = attendanceSectionId === sec.id
                      return (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => setAttendanceSectionId(sec.id)}
                          style={{
                            padding: '0.75rem 1.5rem',
                            borderRadius: '10px',
                            border: isSelected ? '2px solid var(--teal-bright)' : '1px solid var(--border)',
                            background: isSelected ? 'rgba(8, 146, 165, 0.12)' : 'var(--bg)',
                            color: isSelected ? 'var(--teal-bright)' : 'var(--text)',
                            fontWeight: isSelected ? 600 : 500,
                            cursor: 'pointer',
                            fontSize: '1rem',
                          }}
                        >
                          {sec.name} ({count} students)
                        </button>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => {
                      setAttendanceDate(e.target.value)
                      fetchAttendanceForDate(e.target.value)
                    }}
                    style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.875rem' }}
                  />
                  <button
                    onClick={handleTakeAttendance}
                    className="btn-primary"
                    style={{ padding: '0.5rem 1.5rem', width: 'auto' }}
                  >
                    Save Attendance
                  </button>
                </div>

                {sections.length >= 2 && !attendanceSectionId ? (
                  <p style={{ color: 'var(--text-muted)', padding: '1.5rem', textAlign: 'center' }}>Click a section above to see the list of students and mark attendance.</p>
                ) : (() => {
                  const studentsToShow = sections.length >= 2 && attendanceSectionId ? getStudentsInSection(attendanceSectionId) : enrolledStudents
                  if (studentsToShow.length === 0) {
                    return <p style={{ color: 'var(--text-muted)' }}>{attendanceSectionId ? 'No students in this section.' : 'No students enrolled'}</p>
                  }
                  return (
                    <div className="attendance-table">
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600 }}>Roll no.</th>
                            <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600 }}>Student</th>
                            <th style={{ textAlign: 'center', padding: '0.75rem', fontWeight: 600 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...studentsToShow]
                            .sort((a, b) => {
                              const ra = (a.roll_number || '').toString().toLowerCase()
                              const rb = (b.roll_number || '').toString().toLowerCase()
                              if (ra && rb && ra !== rb) return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' })
                              if (ra && !rb) return -1
                              if (!ra && rb) return 1
                              const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase()
                              const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase()
                              return nameA.localeCompare(nameB)
                            })
                            .map((student) => {
                              const currentStatus = attendanceRecords[student.id]?.status || 'present'
                              return (
                                <tr key={student.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '0.75rem', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                    {student.roll_number || '—'}
                                  </td>
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
                  )
                })()}
              </div>
            </div>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="professor-tab-content">
              <div className="course-info-card">
                <h3>Class Schedule</h3>
                {sections.length >= 2 && (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Applies to all sections. {sections.map((s) => `${s.name}: ${getStudentsInSection(s.id).length} students`).join(' • ')}
                  </p>
                )}
                
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
                            {sections.length >= 2 && (
                              <select
                                value={editingSchedule.section_id ?? ''}
                                onChange={(e) => setEditingSchedule({
                                  ...editingSchedule,
                                  section_id: e.target.value || null
                                })}
                                style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px' }}
                              >
                                <option value="">All sections</option>
                                {sections.map((sec) => (
                                  <option key={sec.id} value={sec.id}>{sec.name}</option>
                                ))}
                              </select>
                            )}
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
                            <div className="schedule-location">
                              {sections.length >= 2 && sched.section_id
                                ? `${sections.find((s) => s.id === sched.section_id)?.name || 'Section'} · `
                                : ''}
                              {sched.location && <>📍 {sched.location}</>}
                            </div>
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

                {/* One-off Custom Classes */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 600 }}>Custom Classes (one-off)</h4>
                  {customClasses.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                      {customClasses.map((cls) => {
                        const date = new Date(cls.class_date + 'T00:00:00')
                        const sectionName = cls.section_id ? sections.find((s) => s.id === cls.section_id)?.name : null
                        return (
                          <div key={cls.id} className="schedule-item" style={{ position: 'relative', paddingRight: '7rem' }}>
                            <div className="schedule-day">
                              {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </div>
                            <div className="schedule-time">
                              {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                            </div>
                            <div className="schedule-location">
                              {sectionName ? `${sectionName} · ` : ''}
                              {cls.location && <>📍 {cls.location}</>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                      No custom classes scheduled yet.
                    </p>
                  )}

                  <div style={{ marginTop: '0.75rem' }}>
                    <h5 style={{ marginBottom: '0.5rem', fontSize: '0.95rem', fontWeight: 600 }}>Schedule a custom class</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 520 }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                          type="date"
                          value={newCustomClass.class_date}
                          onChange={(e) => setNewCustomClass({ ...newCustomClass, class_date: e.target.value })}
                          style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', flex: 1, minWidth: 160 }}
                        />
                        <input
                          type="time"
                          value={newCustomClass.start_time}
                          onChange={(e) => setNewCustomClass({ ...newCustomClass, start_time: e.target.value })}
                          style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', flex: 1, minWidth: 120 }}
                        />
                        <input
                          type="time"
                          value={newCustomClass.end_time}
                          onChange={(e) => setNewCustomClass({ ...newCustomClass, end_time: e.target.value })}
                          style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', flex: 1, minWidth: 120 }}
                        />
                      </div>
                      {sections.length >= 2 && (
                        <select
                          value={newCustomClass.section_id ?? ''}
                          onChange={(e) => setNewCustomClass({ ...newCustomClass, section_id: e.target.value || '' })}
                          style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px', maxWidth: 260 }}
                        >
                          <option value="">All sections</option>
                          {sections.map((sec) => (
                            <option key={sec.id} value={sec.id}>{sec.name}</option>
                          ))}
                        </select>
                      )}
                      <input
                        type="text"
                        placeholder="Classroom / Location (e.g., Room 402)"
                        value={newCustomClass.location}
                        onChange={(e) => setNewCustomClass({ ...newCustomClass, location: e.target.value })}
                        style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px' }}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (!newCustomClass.class_date || !newCustomClass.start_time || !newCustomClass.end_time) {
                            alert('Please select date and time for the custom class.')
                            return
                          }
                          try {
                            const { error } = await supabase
                              .from('course_custom_classes')
                              .insert({
                                course_id: courseId,
                                class_date: newCustomClass.class_date,
                                start_time: newCustomClass.start_time,
                                end_time: newCustomClass.end_time,
                                location: newCustomClass.location || null,
                                section_id: newCustomClass.section_id || null,
                              })
                            if (error) throw error
                            setNewCustomClass({
                              class_date: '',
                              start_time: '10:00',
                              end_time: '11:30',
                              location: '',
                              section_id: '',
                            })
                            const { data: refreshed } = await supabase
                              .from('course_custom_classes')
                              .select('*')
                              .eq('course_id', courseId)
                              .order('class_date', { ascending: true })
                              .order('start_time', { ascending: true })
                            if (refreshed) setCustomClasses(refreshed as CustomClass[])
                            alert('Custom class scheduled.')
                          } catch (e) {
                            console.error('Error scheduling custom class:', e)
                            alert('Error scheduling custom class')
                          }
                        }}
                        className="btn-primary"
                        style={{ padding: '0.75rem 1.5rem', width: 'auto' }}
                      >
                        Schedule Custom Class
                      </button>
                    </div>
                  </div>
                </div>

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
                    {sections.length >= 2 && (
                      <select
                        value={newSchedule.section_id ?? ''}
                        onChange={(e) => setNewSchedule({
                          ...newSchedule,
                          section_id: e.target.value || ''
                        })}
                        style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px' }}
                      >
                        <option value="">All sections</option>
                        {sections.map((sec) => (
                          <option key={sec.id} value={sec.id}>{sec.name}</option>
                        ))}
                      </select>
                    )}
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
              <div className="course-info-card" style={{ marginBottom: '2rem' }}>
                <h3>Sections</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Create sections (e.g. Section A, B) and assign enrolled students to them.
                </p>
                {sectionsLoading ? (
                  <p style={{ color: 'var(--text-muted)' }}>Loading sections…</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Section name (e.g. Section A)"
                        value={newSectionName}
                        onChange={(e) => setNewSectionName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSection())}
                        style={{ width: '220px' }}
                        aria-label="New section name"
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleAddSection}
                        disabled={addingSection || !newSectionName.trim()}
                        style={{ padding: '0.5rem 1rem' }}
                      >
                        {addingSection ? 'Adding…' : '+ Add Section'}
                      </button>
                    </div>
                    {sections.length > 0 ? (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {sections.map((sec) => (
                          <li
                            key={sec.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.5rem 0.75rem',
                              background: 'var(--surface-hover)',
                              borderRadius: '8px',
                              border: '1px solid var(--border)',
                            }}
                          >
                            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{sec.name}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteSection(sec.id)}
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                              }}
                              title="Delete section"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No sections yet. Add one above.</p>
                    )}
                  </>
                )}
              </div>

              <div className="course-info-card">
                <h3>Enrolled Students ({enrolledStudents.length})</h3>
                {enrolledStudents.length > 0 ? (
                  <div
                    className="student-list"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: '1.25rem',
                      alignItems: 'flex-start',
                    }}
                  >
                    {sections.length >= 2 ? (
                      <>
                        {sections.map((sec) => {
                          const inSection = enrolledStudents.filter((s) => s.section_id === sec.id)
                          if (inSection.length === 0) return null
                          return (
                            <div
                              key={sec.id}
                              style={{
                                border: '1px solid var(--border)',
                                borderRadius: 12,
                                padding: '0.75rem 0.75rem 0.25rem',
                                background: 'var(--surface)',
                              }}
                            >
                              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem', paddingBottom: '0.4rem', borderBottom: '2px solid var(--teal-bright)' }}>
                                {sec.name} ({inSection.length})
                              </h4>
                              {inSection.map((student) => (
                                <div
                                  key={student.id}
                                  className="student-item"
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '1rem',
                                    padding: '0.5rem 0',
                                  }}
                                >
                                  {/* Name / email */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                                    <div className="student-avatar">
                                      {(student.first_name?.charAt(0) || '') + (student.last_name?.charAt(0) || '')}
                                    </div>
                                    <div className="student-info" style={{ minWidth: 0 }}>
                                      <div className="student-name" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                        {student.first_name} {student.last_name}
                                      </div>
                                      {student.email && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                          {student.email}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {/* Section + action */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                    <select
                                      aria-label="Section"
                                      value={student.section_id ?? ''}
                                      onChange={(e) => handleAssignSection(student.registration_id, e.target.value || null)}
                                      disabled={assigningSection === student.registration_id}
                                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.8rem', minWidth: 130 }}
                                    >
                                      <option value="">No section</option>
                                      {sections.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => handleUnenrollStudent(student.registration_id)}
                                      style={{ padding: '0.4rem 0.9rem', background: 'var(--error)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                      Unenroll
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })}
                        {enrolledStudents.filter((s) => !s.section_id).length > 0 && (
                          <div
                            style={{
                              marginBottom: '1.5rem',
                              border: '1px solid var(--border)',
                              borderRadius: 12,
                              padding: '0.75rem 0.75rem 0.25rem',
                              background: 'var(--surface)',
                            }}
                          >
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
                              No section ({enrolledStudents.filter((s) => !s.section_id).length})
                            </h4>
                            {enrolledStudents.filter((s) => !s.section_id).map((student) => (
                              <div
                                key={student.id}
                                className="student-item"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '1rem',
                                  padding: '0.5rem 0',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                                  <div className="student-avatar">
                                    {(student.first_name?.charAt(0) || '') + (student.last_name?.charAt(0) || '')}
                                  </div>
                                  <div className="student-info" style={{ minWidth: 0 }}>
                                    <div className="student-name" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                      {student.first_name} {student.last_name}
                                    </div>
                                    {student.email && (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                        {student.email}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                  <select
                                    aria-label="Section"
                                    value={student.section_id ?? ''}
                                    onChange={(e) => handleAssignSection(student.registration_id, e.target.value || null)}
                                    disabled={assigningSection === student.registration_id}
                                    style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.8rem', minWidth: 130 }}
                                  >
                                    <option value="">No section</option>
                                    {sections.map((s) => (
                                      <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => handleUnenrollStudent(student.registration_id)}
                                    style={{ padding: '0.4rem 0.9rem', background: 'var(--error)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                                  >
                                    Unenroll
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                    {enrolledStudents.map((student) => (
                      <div
                        key={student.id}
                        className="student-item"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          padding: '0.5rem 0',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                          <div className="student-avatar">
                            {(student.first_name?.charAt(0) || '') + (student.last_name?.charAt(0) || '')}
                          </div>
                          <div className="student-info" style={{ minWidth: 0 }}>
                            <div className="student-name" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                              {student.first_name} {student.last_name}
                            </div>
                            {student.email && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                {student.email}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          <select
                            id={`section-${student.registration_id}`}
                            aria-label="Section"
                            value={student.section_id ?? ''}
                            onChange={(e) => handleAssignSection(student.registration_id, e.target.value || null)}
                            disabled={assigningSection === student.registration_id}
                            style={{
                              padding: '0.4rem 0.6rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border)',
                              background: 'var(--bg)',
                              color: 'var(--text)',
                              fontSize: '0.8rem',
                              minWidth: 130,
                            }}
                          >
                            <option value="">No section</option>
                            {sections.map((sec) => (
                              <option key={sec.id} value={sec.id}>{sec.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleUnenrollStudent(student.registration_id)}
                            style={{
                              padding: '0.4rem 0.9rem',
                              background: 'var(--error)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                            }}
                          >
                            Unenroll
                          </button>
                        </div>
                      </div>
                    ))}
                      </>
                    )}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>No students enrolled</p>
                )}
              </div>

              <div className="course-info-card" style={{ marginTop: '2rem' }}>
                <h3>Add Students to Course</h3>
                {allStudents.length > 0 ? (
                  <>
                    <div style={{ marginBottom: '1rem', maxWidth: 320 }}>
                      <input
                        type="search"
                        className="form-control"
                        placeholder="Search by name or email..."
                        value={studentSearchQuery}
                        onChange={(e) => setStudentSearchQuery(e.target.value)}
                        aria-label="Search students to enroll"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div className="student-list">
                      {allStudents
                        .filter((student) => {
                          const q = studentSearchQuery.trim().toLowerCase()
                          if (!q) return true
                          const name = [student.first_name, student.last_name].filter(Boolean).join(' ').toLowerCase()
                          const email = (student.email ?? '').toLowerCase()
                          return name.includes(q) || email.includes(q)
                        })
                        .map((student) => (
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
                  </>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>All students are already enrolled</p>
                )}
              </div>
            </div>
          )}

          {/* Assignments Tab */}
          {activeTab === 'assignments' && (
            <div className="professor-tab-content">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3>Assignments ({assignments.length})</h3>
                <button
                  onClick={() => {
                    setEditingAssignment(null)
                    setNewAssignment({
                      title: '',
                      description: '',
                      due_date: '',
                      due_time: '',
                      max_points: 100,
                      assignment_type: '',
                      instructions: ''
                    })
                    setQuizQuestions([])
                    setShowGradesToStudents(false)
                    setAssignmentSectionId('')
                    setGroupSize(3)
                    setShowAssignmentForm(true)
                  }}
                  className="btn-primary"
                  style={{ padding: '0.5rem 1rem' }}
                >
                  + Create Assignment
                </button>
              </div>

              {/* Assignment Templates */}
              {!showAssignmentForm && (
                <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text)' }}>
                    Quick Templates
                  </h4>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {assignmentTemplates.map((template, idx) => (
                      <button
                        key={idx}
                        onClick={() => useTemplate(template)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          color: 'var(--text)',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--teal-bright)'
                          e.currentTarget.style.color = 'var(--teal-bright)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#d1d5db'
                          e.currentTarget.style.color = 'var(--text)'
                        }}
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Assignment Form */}
              {showAssignmentForm && (
                <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--text)', fontSize: '0.95rem' }}>
                    {editingAssignment ? 'Edit Assignment' : 'Create New Assignment'}
                  </h4>
                  <form onSubmit={editingAssignment ? handleUpdateAssignment : handleCreateAssignment}>
                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, color: 'var(--text)', fontSize: '0.85rem' }}>
                        Title *
                      </label>
                      <input
                        type="text"
                        value={newAssignment.title}
                        onChange={(e) => setNewAssignment({ ...newAssignment, title: e.target.value })}
                        className="form-control"
                        required
                        placeholder="Assignment title"
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, color: 'var(--text)', fontSize: '0.85rem' }}>
                        Description
                      </label>
                      <textarea
                        value={newAssignment.description}
                        onChange={(e) => setNewAssignment({ ...newAssignment, description: e.target.value })}
                        className="form-control"
                        rows={3}
                        placeholder="Assignment description"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, color: 'var(--text)', fontSize: '0.85rem' }}>
                          Due Date *
                        </label>
                        <input
                          type="date"
                          value={newAssignment.due_date}
                          onChange={(e) => setNewAssignment({ ...newAssignment, due_date: e.target.value })}
                          className="form-control"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, color: 'var(--text)', fontSize: '0.85rem' }}>
                          Due Time
                        </label>
                        <input
                          type="time"
                          value={newAssignment.due_time}
                          onChange={(e) => setNewAssignment({ ...newAssignment, due_time: e.target.value })}
                          className="form-control"
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, color: 'var(--text)', fontSize: '0.85rem' }}>
                          Max Points *
                        </label>
                        <input
                          type="number"
                          value={newAssignment.max_points}
                          onChange={(e) => setNewAssignment({ ...newAssignment, max_points: parseFloat(e.target.value) || 0 })}
                          className="form-control"
                          required
                          min="0"
                          step="0.1"
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, color: 'var(--text)', fontSize: '0.85rem' }}>
                          Type
                        </label>
                        <select
                          value={newAssignment.assignment_type}
                          onChange={(e) => {
                            const v = e.target.value
                            setNewAssignment({ ...newAssignment, assignment_type: v })
                            if (v === 'quiz' && quizQuestions.length === 0) {
                              setQuizQuestions([{ question: '', choices: ['', ''], correct_index: 0 }])
                            }
                          }}
                          className="form-control"
                        >
                          <option value="">Select type</option>
                          <option value="homework">Homework</option>
                          <option value="quiz">Quiz</option>
                          <option value="project">Project</option>
                          <option value="exam">Exam</option>
                          <option value="lab">Lab</option>
                          <option value="group_assignment">Group Assignment</option>
                          <option value="group_project">Group Project</option>
                          <option value="essay">Essay</option>
                          <option value="presentation">Presentation</option>
                        </select>
                      </div>
                    </div>

                    {(newAssignment.assignment_type === 'group_assignment' || newAssignment.assignment_type === 'group_project') && (
                      <div className="form-group" style={{ marginBottom: '0.75rem', maxWidth: 120 }}>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, color: 'var(--text)', fontSize: '0.85rem' }}>
                          Group size
                        </label>
                        <input
                          type="number"
                          min={2}
                          value={groupSize}
                          onChange={(e) => setGroupSize(Math.max(2, parseInt(e.target.value, 10) || 2))}
                          className="form-control"
                        />
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Students per group (randomly assigned)</p>
                      </div>
                    )}

                    {sections.length > 0 && (
                      <div className="form-group" style={{ marginBottom: '0.75rem', maxWidth: 220 }}>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, color: 'var(--text)', fontSize: '0.85rem' }}>
                          Section
                        </label>
                        <select
                          value={assignmentSectionId ?? ''}
                          onChange={(e) => setAssignmentSectionId(e.target.value || '')}
                          className="form-control"
                        >
                          <option value="">All sections</option>
                          {sections.map((sec) => (
                            <option key={sec.id} value={sec.id}>{sec.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 500, color: 'var(--text)', fontSize: '0.85rem' }}>
                        Instructions
                      </label>
                      <textarea
                        value={newAssignment.instructions}
                        onChange={(e) => setNewAssignment({ ...newAssignment, instructions: e.target.value })}
                        className="form-control"
                        rows={4}
                        placeholder="Detailed instructions for students"
                      />
                    </div>

                    {newAssignment.assignment_type === 'quiz' && (
                      <div className="form-group" style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <label style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>Quiz questions</label>
                          <button
                            type="button"
                            onClick={() => setQuizQuestions([...quizQuestions, { question: '', choices: ['', ''], correct_index: 0 }])}
                            className="btn-secondary"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}
                          >
                            + Add question
                          </button>
                        </div>
                        {quizQuestions.map((q, qIdx) => (
                          <div key={qIdx} style={{ marginBottom: '0.9rem', padding: '0.75rem', background: '#fff', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)' }}>Question {qIdx + 1}</span>
                              <button
                                type="button"
                                onClick={() => setQuizQuestions(quizQuestions.filter((_, i) => i !== qIdx))}
                                style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
                              >
                                Remove
                              </button>
                            </div>
                            <input
                              type="text"
                              value={q.question}
                              onChange={(e) => {
                                const val = e.target.value
                                setQuizQuestions(quizQuestions.map((qu, i) => i === qIdx ? { ...qu, question: val } : qu))
                              }}
                              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                              className="form-control"
                              placeholder="Question text"
                              style={{ marginTop: '0.5rem', marginBottom: '0.75rem' }}
                            />
                            <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Choices (select the correct one)</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              {(Array.isArray(q.choices) ? q.choices : ['', '']).map((choice, cIdx) => {
                                const isCorrect = q.correct_index === cIdx
                                const letter = String.fromCharCode(65 + cIdx)
                                return (
                                  <div
                                    key={cIdx}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.75rem',
                                      padding: '0.5rem 0.75rem',
                                      borderRadius: '6px',
                                      border: `1px solid ${isCorrect ? '#10b981' : '#e5e7eb'}`,
                                      background: isCorrect ? 'rgba(16, 185, 129, 0.06)' : '#fff',
                                    }}
                                  >
                                    <span style={{ flexShrink: 0, fontWeight: 600, width: '1.5rem', color: 'var(--text)' }}>{letter}.</span>
                                    <input
                                      type="radio"
                                      name={`correct-${qIdx}`}
                                      checked={isCorrect}
                                      onChange={() => {
                                        setQuizQuestions(quizQuestions.map((qu, i) => i === qIdx ? { ...qu, correct_index: cIdx } : qu))
                                      }}
                                      style={{
                                        flexShrink: 0,
                                        width: '12px',
                                        height: '12px',
                                        margin: 0,
                                        cursor: 'pointer',
                                      }}
                                    />
                                    <input
                                      type="text"
                                      value={typeof choice === 'string' ? choice : ''}
                                      onChange={(e) => {
                                        const val = e.target.value
                                        setQuizQuestions(quizQuestions.map((qu, i) => {
                                          if (i !== qIdx) return qu
                                          const ch = Array.isArray(qu.choices) ? [...qu.choices] : ['', '']
                                          while (ch.length <= cIdx) ch.push('')
                                          ch[cIdx] = val
                                          return { ...qu, choices: ch }
                                        }))
                                      }}
                                      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                      placeholder={`Type choice ${letter} here...`}
                                      style={{
                                        flex: '1 1 0',
                                        width: '100%',
                                        minWidth: '200px',
                                        maxWidth: '100%',
                                        padding: '0.5rem 0.75rem',
                                        fontSize: '0.875rem',
                                        border: `1px solid ${isCorrect ? '#10b981' : '#d1d5db'}`,
                                        borderRadius: '6px',
                                        color: isCorrect ? '#059669' : 'var(--text)',
                                        background: '#fff',
                                        boxSizing: 'border-box',
                                      }}
                                    />
                                    {(Array.isArray(q.choices) ? q.choices : []).length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const currChoices = Array.isArray(q.choices) ? [...q.choices] : ['', '']
                                          const choices = currChoices.filter((_, i) => i !== cIdx)
                                          const correct_index = q.correct_index === cIdx ? 0 : q.correct_index > cIdx ? q.correct_index - 1 : q.correct_index
                                          setQuizQuestions(quizQuestions.map((qu, i) => i === qIdx ? { ...qu, choices, correct_index } : qu))
                                        }}
                                        style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Remove choice"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="3 6 5 6 21 6" />
                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                          <line x1="10" y1="11" x2="10" y2="17" />
                                          <line x1="14" y1="11" x2="14" y2="17" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            {(Array.isArray(q.choices) ? q.choices : []).length < 6 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const currChoices = Array.isArray(q.choices) ? [...q.choices] : ['']
                                  setQuizQuestions(quizQuestions.map((qu, i) => i === qIdx ? { ...qu, choices: [...currChoices, ''] } : qu))
                                }}
                                className="btn-secondary"
                                style={{ marginTop: '0.35rem', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                              >
                                + Add choice
                              </button>
                            )}
                          </div>
                        ))}
                        {quizQuestions.length === 0 && (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Add at least one question for this quiz.</div>
                        )}
                      </div>
                    )}

                    {editingAssignment?.assignment_type === 'quiz' && (
                      <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={showGradesToStudents}
                            onChange={(e) => setShowGradesToStudents(e.target.checked)}
                          />
                          <span style={{ fontWeight: 500, color: 'var(--text)' }}>Release grades and correct answers to students</span>
                        </label>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="submit" className="btn-primary">
                        {editingAssignment ? 'Update Assignment' : 'Create Assignment'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAssignmentForm(false)
                          setEditingAssignment(null)
                          setNewAssignment({
                            title: '',
                            description: '',
                            due_date: '',
                            due_time: '',
                            max_points: 100,
                            assignment_type: '',
                            instructions: ''
                          })
                          setQuizQuestions([])
                          setShowGradesToStudents(false)
                        }}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Assignments List */}
              {assignments.length > 0 ? (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Due Date</th>
                        <th>Points</th>
                        {sections.length >= 2 ? (
                          <>
                            <th style={{ fontSize: '0.8rem' }}>Section A</th>
                            <th style={{ fontSize: '0.8rem' }}>Section B</th>
                          </>
                        ) : (
                          <th>Submitted</th>
                        )}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((assignment) => {
                        const dueDate = new Date(assignment.due_date)
                        const isOverdue = dueDate < new Date()
                        const sectionACount = sections.length >= 2 ? assignmentSubmissions.filter((s) => s.assignment_id === assignment.id && getStudentsInSection(sections[0]?.id).some((st) => st.id === s.student_id)).length : 0
                        const sectionBCount = sections.length >= 2 ? assignmentSubmissions.filter((s) => s.assignment_id === assignment.id && sections[1] && getStudentsInSection(sections[1].id).some((st) => st.id === s.student_id)).length : 0
                        const sectionATotal = sections.length >= 2 ? getStudentsInSection(sections[0]?.id).length : 0
                        const sectionBTotal = sections.length >= 2 && sections[1] ? getStudentsInSection(sections[1].id).length : 0
                        const colSpan = sections.length >= 2 ? 7 : 6
                        const groupsList = assignment.is_group_assignment ? assignmentGroups[assignment.id] : undefined
                        return (
                          <>
                          <tr key={assignment.id}>
                            <td>
                              <div style={{ fontWeight: 500 }}>{assignment.title}</div>
                              {assignment.description && (
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                  {assignment.description.substring(0, 50)}
                                  {assignment.description.length > 50 ? '...' : ''}
                                </div>
                              )}
                            </td>
                            <td>
                              {assignment.assignment_type ? (
                                <span style={{
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  background: '#f3f4f6',
                                  color: 'var(--text)'
                                }}>
                                  {assignment.assignment_type}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                              )}
                            </td>
                            <td>
                              <div style={{ color: isOverdue ? '#ef4444' : 'var(--text)' }}>
                                {dueDate.toLocaleDateString()}
                              </div>
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                {dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td>{assignment.max_points}</td>
                            {sections.length >= 2 ? (
                              <>
                                <td style={{ fontSize: '0.875rem', color: 'var(--text)' }}>{sectionACount} / {sectionATotal}</td>
                                <td style={{ fontSize: '0.875rem', color: 'var(--text)' }}>{sectionBCount} / {sectionBTotal}</td>
                              </>
                            ) : (
                              <td style={{ fontSize: '0.875rem', color: 'var(--text)' }}>
                                {assignment.submission_count ?? 0} / {enrolledStudents.length}
                              </td>
                            )}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <Link
                                  href={`/dashboard/professor/courses/${courseId}/assignments/${assignment.id}/submissions`}
                                  style={{
                                    padding: '0.25rem 0.75rem',
                                    background: 'var(--teal-bright)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    textDecoration: 'none',
                                    display: 'inline-block'
                                  }}
                                >
                                  View submissions
                                </Link>
                                {assignment.is_group_assignment && assignment.group_size != null && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleCreateGroups(assignment)}
                                      disabled={creatingGroupsFor === assignment.id || enrolledStudents.length < 2}
                                      style={{
                                        padding: '0.25rem 0.75rem',
                                        background: assignmentGroups[assignment.id]?.length ? '#6b7280' : '#8b5cf6',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: creatingGroupsFor === assignment.id ? 'wait' : 'pointer',
                                        fontSize: '0.75rem'
                                      }}
                                    >
                                      {creatingGroupsFor === assignment.id ? 'Creating…' : assignmentGroups[assignment.id]?.length ? 'Recreate groups' : 'Create groups'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => fetchAssignmentGroups(assignment.id)}
                                      disabled={loadingGroupsFor === assignment.id}
                                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', cursor: loadingGroupsFor === assignment.id ? 'wait' : 'pointer', color: 'var(--text)' }}
                                    >
                                      {loadingGroupsFor === assignment.id ? 'Loading…' : assignmentGroups[assignment.id] ? 'Refresh groups' : 'View groups'}
                                    </button>
                                  </>
                                )}
                                {!assignment.is_published && (
                                  <button
                                    type="button"
                                    onClick={() => handlePostAssignment(assignment)}
                                    style={{
                                      padding: '0.25rem 0.75rem',
                                      background: '#10b981',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '0.75rem'
                                    }}
                                  >
                                    Post
                                  </button>
                                )}
                                <button
                                  onClick={() => startEditAssignment(assignment)}
                                  style={{
                                    padding: '0.25rem 0.75rem',
                                    background: '#3b82f6',
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
                                  onClick={() => handleDeleteAssignment(assignment.id)}
                                  style={{
                                    padding: '0.25rem 0.75rem',
                                    background: '#ef4444',
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
                                <div style={{ fontSize: '0.75rem', color: assignment.is_published ? '#10b981' : '#6b7280' }}>
                                  {assignment.is_published ? 'Posted' : 'Draft'}
                                </div>
                              </div>
                            </td>
                          </tr>
                          {assignment.is_group_assignment && groupsList && (
                            <tr>
                              <td colSpan={colSpan} style={{ paddingTop: 0, verticalAlign: 'top', borderTop: 'none', background: 'var(--surface)', fontSize: '0.8rem' }}>
                                <div style={{ padding: '0.5rem 0.75rem' }}>
                                  {groupsList.length > 0 ? (
                                    <>
                                      <strong>Groups:</strong>
                                      {groupsList.map((g) => (
                                        <div key={g.id} style={{ marginTop: '0.35rem' }}>
                                          {g.name}: {g.students.map((s) => [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || s.id).join(', ')}
                                        </div>
                                      ))}
                                    </>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>
                                      No groups created yet. Click <strong>Create groups</strong> above to randomly assign students.
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{
                  padding: '3rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  background: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}>
                  {showAssignmentForm ? null : <p>No assignments yet. Create your first assignment!</p>}
                </div>
              )}

            </div>
          )}

          {/* Grades & Analytics Tab */}
          {activeTab === 'grades' && (
            <div className="professor-tab-content">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, color: 'var(--navy-dark)', fontSize: '1rem' }}>Grades &amp; Analytics</h3>
                {sections.length >= 2 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Click a section card to filter details.</p>
                )}
                {assignments.length > 0 && enrolledStudents.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportGradesCsv}
                    disabled={exportingGrades}
                    style={{
                      padding: '0.4rem 0.9rem',
                      borderRadius: 6,
                      border: '1px solid var(--teal-bright)',
                      background: 'var(--teal-bright)',
                      color: 'white',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      cursor: exportingGrades ? 'default' : 'pointer',
                      opacity: exportingGrades ? 0.7 : 1,
                    }}
                  >
                    {exportingGrades ? 'Exporting…' : 'Export grades'}
                  </button>
                )}
              </div>

              {/* Section overview cards */}
              {(() => {
                const scopes: { id: string | null; name: string }[] =
                  sections.length >= 2 ? [{ id: null, name: 'All sections' }, ...sections.map((s) => ({ id: s.id, name: s.name }))] : [{ id: null, name: 'All sections' }]
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                    {scopes.map((scope) => {
                      const studentsInScope = getStudentsInSection(scope.id)
                      const gradesInScope = courseGrades.filter((g) => studentsInScope.some((s) => s.id === g.student_id))
                      const total = gradesInScope.reduce((s, g) => s + (g.max_grade || 0), 0)
                      const earned = gradesInScope.reduce((s, g) => s + Number(g.grade), 0)
                      const avgPct = total > 0 ? Math.round((earned / total) * 100) : null
                      const perStudentPct: number[] = []
                      studentsInScope.forEach((stu) => {
                        const stuGrades = gradesInScope.filter((g) => g.student_id === stu.id)
                        const stuTotal = stuGrades.reduce((s, g) => s + (g.max_grade || 0), 0)
                        const stuEarn = stuGrades.reduce((s, g) => s + Number(g.grade), 0)
                        if (stuTotal > 0) perStudentPct.push((stuEarn / stuTotal) * 100)
                      })
                      const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 }
                      perStudentPct.forEach((p) => {
                        if (p >= 90) dist.A++
                        else if (p >= 80) dist.B++
                        else if (p >= 70) dist.C++
                        else if (p >= 60) dist.D++
                        else dist.F++
                      })
                      const isSelected = (scope.id || null) === (gradesSectionId || null)
                      return (
                        <button
                          key={scope.id ?? 'all'}
                          type="button"
                          onClick={() => {
                            setGradesSectionId(scope.id || null)
                            setGradesScopeChosen(true)
                          }}
                          style={{
                            textAlign: 'left',
                            padding: '0.6rem 0.7rem',
                            borderRadius: 10,
                            border: isSelected ? '2px solid var(--teal-bright)' : '1px solid var(--border)',
                            background: isSelected ? 'rgba(8,146,165,0.08)' : 'var(--surface)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.2rem',
                          }}
                        >
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{scope.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{studentsInScope.length} students</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{avgPct != null ? `${avgPct}% avg` : '—'}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            A:{dist.A} B:{dist.B} C:{dist.C} D:{dist.D} F:{dist.F}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Grades details: only after a section card is chosen */}
              {gradesScopeChosen ? (() => {
                const gradesStudents = gradesSectionId ? getStudentsInSection(gradesSectionId) : enrolledStudents
                const gradesInScope = courseGrades.filter((g) =>
                  gradesStudents.some((s) => s.id === g.student_id)
                )

                const totalPoints = gradesInScope.reduce((s, g) => s + (g.max_grade || 0), 0)
                const earnedPoints = gradesInScope.reduce((s, g) => s + Number(g.grade), 0)
                const classAvgPct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0
                const assignmentsGradedCount = assignments.filter((a) =>
                  gradesInScope.some((g) => g.assignment_name === a.title)
                ).length

                const perStudentPct: number[] = []
                gradesStudents.forEach((stu) => {
                  const stuGrades = gradesInScope.filter((g) => g.student_id === stu.id)
                  const stuTotal = stuGrades.reduce((s, g) => s + (g.max_grade || 0), 0)
                  const stuEarn = stuGrades.reduce((s, g) => s + Number(g.grade), 0)
                  if (stuTotal > 0) perStudentPct.push((stuEarn / stuTotal) * 100)
                })
                const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 }
                perStudentPct.forEach((p) => {
                  if (p >= 90) dist.A++
                  else if (p >= 80) dist.B++
                  else if (p >= 70) dist.C++
                  else if (p >= 60) dist.D++
                  else dist.F++
                })
                const studentsByGradeCount = [...gradesStudents]
                  .map((stu) => {
                    const stuGrades = gradesInScope.filter((g) => g.student_id === stu.id)
                    const total = stuGrades.reduce((s, g) => s + (g.max_grade || 0), 0)
                    const earned = stuGrades.reduce((s, g) => s + Number(g.grade), 0)
                    const pct = total > 0 ? Math.round((earned / total) * 100) : null
                    return { student: stu, count: stuGrades.length, pct }
                  })
                  .sort((a, b) => a.count - b.count)
                const studentsWithFewerGrades = studentsByGradeCount.slice(0, 15)

                const scopeLabel =
                  gradesSectionId && sections.length > 0
                    ? sections.find((s) => s.id === gradesSectionId)?.name || 'Section'
                    : 'All sections'

                return (
                  <div style={{ marginTop: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                      {scopeLabel} — {gradesStudents.length} students
                    </h4>

                    {/* Analytics cards for selected scope */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.9rem', marginBottom: '1.25rem' }}>
                      <div style={{ padding: '0.8rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Average</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)' }}>{classAvgPct}%</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{earnedPoints.toFixed(0)} / {totalPoints.toFixed(0)} pts</div>
                      </div>
                      <div style={{ padding: '0.8rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Assignments graded</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)' }}>{assignmentsGradedCount}</div>
                      </div>
                      <div style={{ padding: '0.8rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Grade distribution</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.8rem' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.2)', color: '#059669' }}>A 90+ ({dist.A})</span>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.2)', color: '#2563eb' }}>B 80–89 ({dist.B})</span>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.2)', color: '#d97706' }}>C 70–79 ({dist.C})</span>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(249,115,22,0.2)', color: '#ea580c' }}>D 60–69 ({dist.D})</span>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.2)', color: '#dc2626' }}>F &lt;60 ({dist.F})</span>
                        </div>
                      </div>
                    </div>

                    {gradesStudents.length > 0 && (
                      <div style={{ marginBottom: '1.5rem', padding: '0.8rem', background: 'var(--surface-hover)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Students with fewer grades</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.85rem' }}>
                          {studentsWithFewerGrades.map(({ student, pct }) => (
                            <span key={student.id} style={{ padding: '4px 8px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              {[student.first_name, student.last_name].filter(Boolean).join(' ') || student.email || 'Unknown'} ({pct != null ? `${pct}%` : '—'})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Grades table for selected scope */}
                    <div style={{ overflowX: 'auto' }}>
                      <table className="table" style={{ minWidth: 560, tableLayout: 'auto' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--navy-dark)', zIndex: 1 }}>
                              Student
                            </th>
                            {assignments.map((a) => (
                              <th
                                key={a.id}
                                style={{
                                  textAlign: 'center',
                                  whiteSpace: 'nowrap',
                                  minWidth: 110,
                                  maxWidth: 160,
                                  padding: '0.35rem 0.5rem',
                                  fontSize: '0.8rem',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={a.title}
                              >
                                {a.title.length > 20 ? a.title.slice(0, 18) + '…' : a.title}
                              </th>
                            ))}
                            <th style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 600, minWidth: 90 }}>Average</th>
                          </tr>
                          {/* Class average row */}
                          {assignments.length > 0 && gradesStudents.length > 0 && (
                            <tr style={{ background: 'var(--surface-hover)', fontSize: '0.85rem' }}>
                              <td style={{ color: 'var(--text-muted)', fontWeight: 600, position: 'sticky', left: 0, background: 'var(--surface-hover)', zIndex: 1 }}>Class avg</td>
                              {assignments.map((a) => {
                                const gs = gradesInScope.filter((g) => g.assignment_name === a.title)
                                const total = gs.reduce((s, g) => s + (g.max_grade || 0), 0)
                                const earned = gs.reduce((s, g) => s + Number(g.grade), 0)
                                const pct = total > 0 ? Math.round((earned / total) * 100) : null
                                return (
                                  <td key={a.id} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {pct != null ? `${pct}%` : '—'}
                                  </td>
                                )
                              })}
                              <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                                {classAvgPct > 0 ? `${classAvgPct}%` : '—'}
                              </td>
                            </tr>
                          )}
                        </thead>
                        <tbody>
                          {gradesStudents.length === 0 ? (
                            <tr>
                              <td colSpan={(assignments.length + 2)} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                No students in this scope
                              </td>
                            </tr>
                          ) : (
                      gradesStudents.map((student) => {
                        const stuGrades = gradesInScope.filter((g) => g.student_id === student.id)
                        let totalPoints = 0
                        let earnedPoints = 0
                        stuGrades.forEach((g) => {
                          totalPoints += g.max_grade || 0
                          earnedPoints += Number(g.grade)
                        })
                        const avgPct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : null
                        return (
                          <tr key={student.id}>
                            <td style={{ whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>
                              {[student.first_name, student.last_name].filter(Boolean).join(' ') || student.email || '—'}
                            </td>
                            {assignments.map((a) => {
                              const g = stuGrades.find((gr) => gr.assignment_name === a.title)
                              if (!g) return <td key={a.id} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>—</td>
                              const max = g.max_grade ?? a.max_points
                              return (
                                <td key={a.id} style={{ textAlign: 'center' }}>
                                  {Number(g.grade)} / {max}
                                </td>
                              )
                            })}
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>
                              {avgPct != null ? `${avgPct}%` : '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
                    </div>
                  </div>
                )
              })() : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Select a section card above to see its students and grades.
                </p>
              )}
              {assignments.length === 0 && (
                <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>
                  Create assignments and grade submissions in the Assignments tab to see grades and analytics here.
                </p>
              )}
            </div>
          )}

          {/* Materials Tab */}
          {activeTab === 'materials' && (
            <div className="professor-tab-content">
              {sections.length >= 2 && (
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Available to all sections (Section A &amp; Section B).</p>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h3>Course materials (PDF only)</h3>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--teal-bright)', color: 'white', borderRadius: '8px', cursor: materialUploading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: '0.9rem' }}>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleUploadMaterial}
                    disabled={materialUploading}
                    style={{ display: 'none' }}
                  />
                  {materialUploading ? (
                    <span>Uploading…</span>
                  ) : (
                    <>
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Upload PDF
                    </>
                  )}
                </label>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                After uploading, click <strong>Index for search</strong> to enable semantic search over the PDF (requires Ollama running with nomic-embed-text).
              </p>
              {materialError && (
                <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', fontSize: '0.9rem' }}>
                  {materialError}
                </div>
              )}
              {ragProcessMessage && (
                <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: ragProcessMessage.startsWith('RAG failed') ? '#fef2f2' : '#f0fdf4', color: ragProcessMessage.startsWith('RAG failed') ? '#b91c1c' : '#166534', borderRadius: '8px', fontSize: '0.9rem' }}>
                  {ragProcessMessage}
                </div>
              )}
              {materialsLoading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading materials…</p>
              ) : materials.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {materials.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <span style={{ color: '#dc2626', flexShrink: 0 }}>
                          <svg fill="currentColor" viewBox="0 0 24 24" width="24" height="24">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
                            <path fill="currentColor" d="M14 2v6h6M16 13H8m0 4h8m-4-4H8" />
                          </svg>
                        </span>
                        <span style={{ fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file_name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleIndexForSearch(m)}
                          disabled={indexingMaterialId === m.id}
                          className="btn-secondary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                          title="Extract text and index for semantic search (RAG)"
                        >
                          {indexingMaterialId === m.id ? 'Indexing…' : 'Index for search'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewingDocument({ url: getMaterialPublicUrl(m.file_path), fileName: m.file_name })}
                          className="btn-primary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMaterial(m)}
                          className="btn-secondary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No course materials yet. Upload PDFs above.</p>
              )}
            </div>
          )}

          {activeTab === 'announcements' && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}>Announcements</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Post an announcement to notify enrolled students. Choose a specific section below to notify only that section, or leave it as &quot;All sections&quot; to reach everyone in the course.
              </p>
              <form onSubmit={handlePostAnnouncement} style={{ marginBottom: '1.5rem' }}>
                <div style={{ marginBottom: '0.75rem', maxWidth: 320 }}>
                  <label
                    htmlFor="ann-section"
                    style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}
                  >
                    Section
                  </label>
                  <select
                    id="ann-section"
                    value={announcementSectionId ?? ''}
                    onChange={(e) =>
                      setAnnouncementSectionId(e.target.value === '' ? '' : e.target.value)
                    }
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      backgroundColor: 'var(--background)',
                    }}
                  >
                    <option value="">All sections</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                  </select>
                  {sections.length === 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      No sections defined yet. This announcement will go to all enrolled students.
                    </p>
                  )}
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="ann-title" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Title</label>
                  <input
                    id="ann-title"
                    type="text"
                    value={newAnnouncement.title}
                    onChange={(e) => setNewAnnouncement(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Announcement title"
                    required
                    style={{ width: '100%', maxWidth: 400, padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 8 }}
                  />
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="ann-content" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Content</label>
                  <textarea
                    id="ann-content"
                    value={newAnnouncement.content}
                    onChange={(e) => setNewAnnouncement(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Message to students (optional)"
                    rows={4}
                    style={{ width: '100%', maxWidth: 560, padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 8, resize: 'vertical' }}
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={postingAnnouncement || !newAnnouncement.title.trim()}>
                  {postingAnnouncement ? 'Posting…' : 'Post announcement'}
                </button>
              </form>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.5rem 0' }} />
              {announcementsLoading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading announcements…</p>
              ) : announcements.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {announcements.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        padding: '1rem 1.25rem',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                      }}
                    >
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.35rem' }}>{a.title}</div>
                      {a.content && <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>{a.content}</div>}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Posted by {a.author ? [a.author.first_name, a.author.last_name].filter(Boolean).join(' ') : 'Professor'} · {new Date(a.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No announcements yet. Post one above to notify all enrolled students.</p>
              )}
            </div>
          )}
        </div>
      {viewingDocument && (
        <DocumentViewer
          url={viewingDocument.url}
          fileName={viewingDocument.fileName}
          onClose={() => setViewingDocument(null)}
        />
      )}
    </main>
  )
}