'use client'

import { useEffect, useMemo, useState } from 'react'
import * as mammoth from 'mammoth'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'])
const PDF_EXT = '.pdf'
const DOCX_EXT = new Set(['.docx', '.doc'])

function getFileType(fileName: string): 'pdf' | 'image' | 'docx' | 'other' {
  const lower = (fileName || '').toLowerCase()
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : ''
  if (ext === PDF_EXT) return 'pdf'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (DOCX_EXT.has(ext)) return 'docx'
  return 'other'
}

interface DocumentViewerProps {
  url: string
  fileName: string
  onClose: () => void
}

export default function DocumentViewer({ url, fileName, onClose }: DocumentViewerProps) {
  const fileType = useMemo(() => getFileType(fileName), [fileName])
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [docxError, setDocxError] = useState<string | null>(null)
  const [docxLoading, setDocxLoading] = useState(false)

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

  useEffect(() => {
    if (fileType !== 'docx' || !url) return
    let cancelled = false
    setDocxLoading(true)
    setDocxError(null)
    setDocxHtml(null)

    fetch(url, { mode: 'cors' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load file: ${res.status}`)
        return res.arrayBuffer()
      })
      .then((arrayBuffer) => {
        if (cancelled) return
        return mammoth.convertToHtml(
          { arrayBuffer },
          {
            ignoreEmptyParagraphs: false,
            includeEmbeddedStyleMap: true,
            includeDefaultStyleMap: true,
          }
        )
      })
      .then((result) => {
        if (cancelled || !result) return
        setDocxHtml(result.value)
        if (result.messages.length > 0) {
          console.warn('Mammoth messages:', result.messages)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDocxError(err?.message || 'Could not preview document.')
        }
      })
      .finally(() => {
        if (!cancelled) setDocxLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [fileType, url])

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
            <div className="document-viewer-pdf-wrap">
              <iframe
                src={url}
                title={fileName}
                className="document-viewer-iframe"
              />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="document-viewer-pdf-fallback"
              >
                Open PDF in new tab
              </a>
            </div>
          )}
          {fileType === 'image' && (
            <img
              src={url}
              alt={fileName}
              className="document-viewer-image"
            />
          )}
          {fileType === 'docx' && (
            <div className="document-viewer-docx">
              {docxLoading && (
                <p className="document-viewer-loading">Loading preview…</p>
              )}
              {docxError && !docxLoading && (
                <div className="document-viewer-fallback">
                  <p>{docxError}</p>
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
              {docxHtml && !docxLoading && (
                <div
                  className="document-viewer-docx-content"
                  dangerouslySetInnerHTML={{ __html: docxHtml }}
                />
              )}
            </div>
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
