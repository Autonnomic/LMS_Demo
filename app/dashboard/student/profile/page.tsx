'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '../components/Sidebar'
import { ChatProvider } from '../components/ChatContext'
import ProfileContent, { type ProfileData, type StudyPlanWithProgress } from '../../components/ProfileContent'

interface GradeRow {
  id: string
  assignment_name: string
  grade: number
  max_grade: number
  course: { id: string; code: string; name: string; credits: number } | null
}

export default function StudentProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [sidebarCourses, setSidebarCourses] = useState<{ id: string; code: string; name: string }[]>([])
  const [gpa, setGpa] = useState(0)
  const [totalCredits, setTotalCredits] = useState(0)
  const [gradesCount, setGradesCount] = useState(0)
  const [enrolledCoursesCount, setEnrolledCoursesCount] = useState(0)
  const [assignmentsSubmitted, setAssignmentsSubmitted] = useState(0)
  const [assignmentsTotal, setAssignmentsTotal] = useState(0)
  const [studyPlans, setStudyPlans] = useState<StudyPlanWithProgress[]>([])
  const [attendancePresentCount, setAttendancePresentCount] = useState(0)
  const [feeDetails, setFeeDetails] = useState<{ amount_due: number; amount_paid: number; due_date: string | null; updated_at: string | null } | null>(null)
  const [feeDetailsLoading, setFeeDetailsLoading] = useState(true)

  useEffect(() => {
    async function loadShell() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }
      const { data: profileData, error } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email, role, created_at')
        .eq('id', user.id)
        .single()
      if (error || !profileData || profileData.role !== 'student') {
        router.replace('/dashboard')
        return
      }
      setProfile(profileData as ProfileData)
      const { data: regsData } = await supabase
        .from('course_registrations')
        .select('course:courses ( id, code, name )')
        .eq('student_id', user.id)
        .eq('status', 'enrolled')
      const sidebarCoursesList = (regsData || [])
        .map((r: any) => r.course as { id: string; code: string; name: string } | null)
        .filter((c): c is { id: string; code: string; name: string } => !!c)
      setSidebarCourses(sidebarCoursesList)
      setEnrolledCoursesCount(sidebarCoursesList.length)
      setLoading(false)
    }
    loadShell()
  }, [router])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    async function loadMetrics() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data: gradesData } = await supabase
        .from('grades')
        .select('id, assignment_name, grade, max_grade, course:courses ( id, code, name, credits )')
        .eq('student_id', user.id)
        .order('graded_at', { ascending: false })
      if (cancelled) return
      if (gradesData?.length) {
        setGradesCount(gradesData.length)
        const gradesList = (gradesData as unknown) as GradeRow[]
        const courseMap = new Map<string, GradeRow[]>()
        gradesList.forEach((g) => {
          if (g.course) {
            const id = g.course.id
            if (!courseMap.has(id)) courseMap.set(id, [])
            courseMap.get(id)!.push(g)
          }
        })
        let totalGradePoints = 0
        let totalCreditsEarned = 0
        courseMap.forEach((courseGrades) => {
          const course = courseGrades[0].course!
          const totalPoints = courseGrades.reduce((s, g) => s + Number(g.grade), 0)
          const maxPoints = courseGrades.reduce((s, g) => s + Number(g.max_grade || 100), 0)
          const averageGrade = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0
          totalGradePoints += (averageGrade / 10) * (course.credits || 0)
          totalCreditsEarned += course.credits || 0
        })
        setTotalCredits(totalCreditsEarned)
        setGpa(totalCreditsEarned > 0 ? totalGradePoints / totalCreditsEarned : 0)
      }
      const { data: regs } = await supabase
        .from('course_registrations')
        .select('course_id')
        .eq('student_id', user.id)
        .eq('status', 'enrolled')
      const courseIds = (regs || []).map((r: { course_id: string }) => r.course_id)
      if (courseIds.length > 0 && !cancelled) {
        const { count: totalAssignments } = await supabase.from('assignments').select('*', { count: 'exact', head: true }).in('course_id', courseIds)
        const { count: submittedCount } = await supabase.from('assignment_submissions').select('*', { count: 'exact', head: true }).eq('student_id', user.id)
        setAssignmentsTotal(totalAssignments ?? 0)
        setAssignmentsSubmitted(submittedCount ?? 0)
      }
      const { data: plansData } = await supabase
        .from('student_study_plans')
        .select('id, topic, total_days, hours_per_day, created_at')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false })
      if (plansData?.length && !cancelled) {
        const withProgress: StudyPlanWithProgress[] = []
        for (const plan of plansData as { id: string; topic: string; total_days: number; hours_per_day: number; created_at: string }[]) {
          const { data: items } = await supabase.from('student_study_plan_items').select('id, is_completed').eq('plan_id', plan.id)
          const totalItems = items?.length ?? 0
          const completedItems = items?.filter((i: { is_completed: boolean }) => i.is_completed).length ?? 0
          withProgress.push({ ...plan, progress: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0, completedItems, totalItems })
        }
        setStudyPlans(withProgress)
      }
      if (!cancelled) {
        const { count: attendanceCount } = await supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('student_id', user.id).eq('status', 'present')
        setAttendancePresentCount(attendanceCount ?? 0)
      }
      if (!cancelled) setMetricsLoading(false)
    }
    loadMetrics()
    return () => { cancelled = true }
  }, [profile?.id])

  useEffect(() => {
    if (!profile || profile.role !== 'student') return
    let cancelled = false
    async function loadFees() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const headers: Record<string, string> = {}
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
        const res = await fetch('/api/student/fees', { credentials: 'include', headers })
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          setFeeDetails({ amount_due: data.amount_due ?? 0, amount_paid: data.amount_paid ?? 0, due_date: data.due_date ?? null, updated_at: data.updated_at ?? null })
        } else {
          setFeeDetails(null)
        }
      } catch {
        if (!cancelled) setFeeDetails(null)
      } finally {
        if (!cancelled) setFeeDetailsLoading(false)
      }
    }
    loadFees()
    return () => { cancelled = true }
  }, [profile?.id, profile?.role])

  if (loading) {
    return (
      <ChatProvider>
        <div className="canvas-layout">
          <Sidebar courses={[]} />
          <main className="canvas-main-content">
            <div className="canvas-topbar"><span className="canvas-topbar-title">← Dashboard</span></div>
            <div className="canvas-content-area">
              <div className="skeleton skeleton-text lg" style={{ width: '200px', marginBottom: '1rem' }} />
              <div className="skeleton-card skeleton" style={{ padding: '2rem', maxWidth: 480 }} />
            </div>
          </main>
        </div>
      </ChatProvider>
    )
  }

  if (!profile) return null

  return (
    <ChatProvider>
      <div className="canvas-layout">
        <Sidebar courses={sidebarCourses} />
        <main className="canvas-main-content">
          <ProfileContent
            profile={profile}
            dashboardHref="/dashboard/student"
            gpa={gpa}
            totalCredits={totalCredits}
            gradesCount={gradesCount}
            enrolledCoursesCount={enrolledCoursesCount}
            assignmentsSubmitted={assignmentsSubmitted}
            assignmentsTotal={assignmentsTotal}
            studyPlans={studyPlans}
            attendancePresentCount={attendancePresentCount}
            metricsLoading={metricsLoading}
            feeDetails={feeDetails}
            feeDetailsLoading={feeDetailsLoading}
          />
        </main>
      </div>
    </ChatProvider>
  )
}
