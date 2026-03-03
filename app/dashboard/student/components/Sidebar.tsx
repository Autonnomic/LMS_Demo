'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import AutonnomicLogo from './AutonnomicLogo'

interface Course {
  id: string
  code: string
  name: string
}

interface SidebarProps {
  courses: Course[]
}

export default function Sidebar({ courses }: SidebarProps) {
  const pathname = usePathname()
  const [coursesExpanded, setCoursesExpanded] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const isDashboardActive = () => {
    return pathname === '/dashboard/student'
  }

  const isCoursesActive = () => {
    return pathname.startsWith('/dashboard/student/courses')
  }

  const isCourseActive = (courseId: string) => {
    return pathname === `/dashboard/student/courses/${courseId}`
  }

  const isGradesActive = () => {
    return pathname === '/dashboard/student/grades'
  }

  const isAssignmentsActive = () => {
    return pathname.startsWith('/dashboard/student/assignments')
  }

  const isStudyPlansActive = () => {
    return pathname.startsWith('/dashboard/student/study-plans')
  }

  const isCalendarActive = () => {
    return pathname === '/dashboard/student/calendar'
  }

  const isAiHelperActive = () => {
    return pathname === '/dashboard/student/ai-helper'
  }

  return (
    <>
    <aside className={`canvas-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="canvas-sidebar-header">
        <div className="sidebar-logo-container">
          <AutonnomicLogo />
        </div>
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label="Toggle sidebar"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
            {sidebarCollapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            )}
          </svg>
        </button>
      </div>
      
      <nav className="canvas-sidebar-nav" aria-label="Main navigation">
        <Link 
          href="/dashboard/student" 
          className={`canvas-nav-item ${isDashboardActive() || isCoursesActive() ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="nav-text">Dashboard</span>
        </Link>
        
        <Link
          href="/dashboard/student/inbox"
          className={`canvas-nav-item ${pathname === '/dashboard/student/inbox' ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="nav-text">Inbox</span>
        </Link>
        
        <Link 
          href="/dashboard/student/assignments" 
          className={`canvas-nav-item ${isAssignmentsActive() ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="nav-text">Assignments</span>
        </Link>
        
        <Link 
          href="/dashboard/student/grades" 
          className={`canvas-nav-item ${isGradesActive() ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="nav-text">Grades</span>
        </Link>

        <Link 
          href="/dashboard/student/study-plans" 
          className={`canvas-nav-item ${isStudyPlansActive() ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 5h11M8 9h8M8 13h6M5 5v14a1 1 0 001 1h10.5a1.5 1.5 0 001.5-1.5V5a2 2 0 00-2-2H7a2 2 0 00-2 2z"
            />
          </svg>
          <span className="nav-text">Study Plans</span>
        </Link>
        
        <Link 
          href="/dashboard/student/calendar" 
          className={`canvas-nav-item ${isCalendarActive() ? 'active' : ''}`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="nav-text">Calendar</span>
        </Link>

        <Link 
          href="/dashboard/student/ai-helper" 
          className={`canvas-nav-item ${isAiHelperActive() ? 'active' : ''}`}
          title="AI helper"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="nav-text">AI helper</span>
        </Link>
      </nav>
      
      <div className="canvas-courses-section">
        <button
          className="courses-section-header"
          onClick={() => setCoursesExpanded(!coursesExpanded)}
        >
          <div className="canvas-courses-section-title">My Courses</div>
          <svg 
            className={`expand-icon ${coursesExpanded ? 'expanded' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            width="16"
            height="16"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        <div className={`courses-list ${coursesExpanded ? 'expanded' : 'collapsed'}`}>
          {courses.length > 0 ? (
            courses.map((course) => (
              <Link
                key={course.id}
                href={`/dashboard/student/courses/${course.id}`}
                className={`canvas-course-link ${isCourseActive(course.id) ? 'active' : ''}`}
              >
                <span className="course-code-small">{course.code}</span>
                <span className="course-name">{course.name}</span>
              </Link>
            ))
          ) : (
            <div style={{ padding: '0.75rem 1.5rem', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.875rem' }}>
              No courses
            </div>
          )}
        </div>
      </div>
    </aside>

    {/* Mobile bottom bar: icons only */}
    <nav className="canvas-sidebar-mobile-bottom" aria-label="Mobile navigation">
      <Link href="/dashboard/student" className={`canvas-mobile-nav-item ${isDashboardActive() || isCoursesActive() ? 'active' : ''}`} aria-label="Dashboard">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </Link>
      <Link href="/dashboard/student/inbox" className={`canvas-mobile-nav-item ${pathname === '/dashboard/student/inbox' ? 'active' : ''}`} aria-label="Inbox">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </Link>
      <Link href="/dashboard/student/assignments" className={`canvas-mobile-nav-item ${isAssignmentsActive() ? 'active' : ''}`} aria-label="Assignments">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </Link>
      <Link href="/dashboard/student/grades" className={`canvas-mobile-nav-item ${isGradesActive() ? 'active' : ''}`} aria-label="Grades">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </Link>
      <Link href="/dashboard/student/study-plans" className={`canvas-mobile-nav-item ${isStudyPlansActive() ? 'active' : ''}`} aria-label="Study plans">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5h11M8 9h8M8 13h6M5 5v14a1 1 0 001 1h10.5a1.5 1.5 0 001.5-1.5V5a2 2 0 00-2-2H7a2 2 0 00-2 2z" />
        </svg>
      </Link>
      <Link href="/dashboard/student/calendar" className={`canvas-mobile-nav-item ${isCalendarActive() ? 'active' : ''}`} aria-label="Calendar">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </Link>
      <Link href="/dashboard/student/ai-helper" className={`canvas-mobile-nav-item ${isAiHelperActive() ? 'active' : ''}`} aria-label="AI helper">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </Link>
    </nav>
    </>
  )
}