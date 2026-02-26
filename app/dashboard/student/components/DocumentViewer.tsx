'use client'

import { useEffect, useMemo } from 'react'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'])
const PDF_EXT = '.pdf'

function getFileType(fileName: string): 'pdf' | 'image' | 'other' {
  const lower = (fileName || '').toLowerCase()
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : ''
  if (ext === PDF_EXT) return 'pdf'
  if (IMAGE_EXT.has(ext)) return 'image'
  return 'other'
}

interface DocumentViewerProps {
  url: string
  fileName: string
  onClose: () => void
}

export default function DocumentViewer({ url, fileName, onClose }: DocumentViewerProps) {
  const fileType = useMemo(() => getFileType(fileName), [fileName])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      className="document-viewer-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`View document: ${fileName}`}
    >
      <div className="document-viewer-modal">
        <div className="document-viewer-header">
          <span className="document-viewer-title" title={fileName}>
            {fileName}
          </span>
          <div className="document-viewer-actions">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="document-viewer-download"
              download={fileName}
            >
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="document-viewer-close"
              aria-label="Close"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="document-viewer-body">
          {fileType === 'pdf' && (
            <iframe
              src={url}
              title={fileName}
              className="document-viewer-iframe"
            />
          )}
          {fileType === 'image' && (
            <img
              src={url}
              alt={fileName}
              className="document-viewer-image"
            />
          )}
          {fileType === 'other' && (
            <div className="document-viewer-fallback">
              <p>Preview is not available for this file type.</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="document-viewer-download-link"
                download={fileName}
              >
                Download {fileName}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
