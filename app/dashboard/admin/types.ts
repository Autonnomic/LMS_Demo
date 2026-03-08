export type Profile = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  role: 'student' | 'professor' | 'admin' | null
  roll_number?: string | null
  created_at: string
}

export type Course = {
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

export type EnrollmentRequest = {
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

export type AllowedSignupEmail = { id: string; email: string; created_at: string }

export function getCourseColor(courseId: string): string {
  const palette = [
    '#0892A5', '#2563EB', '#10B981', '#F97316', '#EC4899', '#8B5CF6', '#F59E0B', '#EF4444',
  ]
  const hash = courseId.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0)
  return palette[Math.abs(hash) % palette.length]
}
