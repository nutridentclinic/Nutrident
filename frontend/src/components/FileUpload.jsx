import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileText, Image as ImageIcon, RotateCcw, Upload, X } from 'lucide-react'

export function FileUpload({
  accept = 'image/jpeg,image/png,image/webp,application/pdf',
  maxSizeMB = 10,
  onUpload,
  label = 'Choose file',
  hint = 'JPG, PNG, WEBP or PDF up to 10 MB',
  submitLabel = 'Upload file',
  previewUrl = null,
  disabled = false,
  extraFields = null,
  onSuccess,
}) {
  const [file, setFile] = useState(null)
  const [localPreview, setLocalPreview] = useState(null)
  const [progress, setProgress] = useState(null) // null or 0..100
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const inputRef = useRef(null)

  const allowedTypes = accept.split(',').map((t) => t.trim().toLowerCase())
  const maxBytes = maxSizeMB * 1024 * 1024

  useEffect(() => {
    if (!file) {
      setLocalPreview(null)
      return
    }
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setLocalPreview(url)
      return () => URL.revokeObjectURL(url)
    }
    setLocalPreview(null)
  }, [file])

  const validateFile = (selected) => {
    if (!selected) return 'Please select a file.'
    const fileType = selected.type.toLowerCase()
    const isAllowed = allowedTypes.some((type) => {
      if (type.endsWith('/*')) {
        return fileType.startsWith(type.replace('/*', '/'))
      }
      return fileType === type
    })

    if (!isAllowed) {
      return `Unsupported file format (${selected.type || 'unknown'}). Please choose ${allowedTypes.join(', ')}.`
    }

    if (selected.size > maxBytes) {
      return `File exceeds maximum allowed size of ${maxSizeMB} MB (${(selected.size / (1024 * 1024)).toFixed(1)} MB).`
    }

    return null
  }

  const handleFileSelect = (event) => {
    setError('')
    setSuccessMessage('')
    setProgress(null)
    const selected = event.target.files?.[0] || null
    if (!selected) return

    const validationErr = validateFile(selected)
    if (validationErr) {
      setError(validationErr)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setFile(selected)
  }

  const handleClear = () => {
    setFile(null)
    setLocalPreview(null)
    setError('')
    setProgress(null)
    setSuccessMessage('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleSubmit = async (event) => {
    if (event) event.preventDefault()
    if (!file) {
      setError('Please choose a file to upload.')
      return
    }

    const validationErr = validateFile(file)
    if (validationErr) {
      setError(validationErr)
      return
    }

    setBusy(true)
    setError('')
    setSuccessMessage('')
    setProgress(0)

    try {
      const handleProgress = (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          setProgress(percent)
        }
      }

      const result = await onUpload(file, handleProgress)
      setSuccessMessage(result?.message || 'File uploaded successfully.')
      setProgress(100)
      setFile(null)
      setLocalPreview(null)
      if (inputRef.current) inputRef.current.value = ''
      onSuccess?.(result)
    } catch (err) {
      const message = err.message || 'File upload failed. Please try again.'
      setError(message)
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  const isImage = file?.type.startsWith('image/') || (!file && previewUrl && (previewUrl.endsWith('.jpg') || previewUrl.endsWith('.png') || previewUrl.endsWith('.webp') || previewUrl.includes('image')))

  return (
    <div className="file-upload-card" style={{ display: 'grid', gap: '1rem' }}>
      {/* Messages */}
      {error && (
        <div className="notice notice-error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
          <button
            type="button"
            className="button button-quiet button-small"
            onClick={handleSubmit}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      )}

      {successMessage && (
        <div className="notice notice-success" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Extra form fields if supplied (e.g. record title, type) */}
      {extraFields}

      {/* Upload drop / picker box */}
      <div
        className="upload-dropzone"
        style={{
          border: '2px dashed var(--border, #cbd5e1)',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          background: 'var(--surface-subtle, #f8fafc)',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={busy || disabled}
          onChange={handleFileSelect}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            cursor: busy || disabled ? 'not-allowed' : 'pointer',
            width: '100%',
            height: '100%',
          }}
          aria-label={label}
        />

        {/* Preview State or Empty State */}
        {localPreview && file ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
            <img
              src={localPreview}
              alt="Selected preview"
              style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '0.5rem' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </strong>
              <small style={{ color: 'var(--text-muted, #64748b)' }}>
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </small>
            </div>
            {!busy && (
              <button
                type="button"
                className="icon-button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleClear()
                }}
                aria-label="Remove selected file"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ) : file ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '0.5rem',
                background: 'var(--primary-subtle, #e0e7ff)',
                color: 'var(--primary, #4338ca)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <FileText size={24} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </strong>
              <small style={{ color: 'var(--text-muted, #64748b)' }}>
                {(file.size / (1024 * 1024)).toFixed(2)} MB · {file.type || 'Document'}
              </small>
            </div>
            {!busy && (
              <button
                type="button"
                className="icon-button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleClear()
                }}
                aria-label="Remove selected file"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ) : (
          <div style={{ pointerEvents: 'none' }}>
            {previewUrl && isImage && (
              <div style={{ marginBottom: '0.75rem' }}>
                <img
                  src={previewUrl}
                  alt="Current"
                  style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: '50%', margin: '0 auto' }}
                />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', color: 'var(--primary, #4338ca)' }}>
              {isImage ? <ImageIcon size={28} /> : <Upload size={28} />}
            </div>
            <div style={{ fontWeight: 600, color: 'var(--text, #0f172a)' }}>
              {label || 'Choose or drop a file'}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #64748b)', marginTop: '0.25rem' }}>
              {hint}
            </div>
          </div>
        )}
      </div>

      {/* Upload Progress Bar */}
      {progress !== null && busy && (
        <div style={{ display: 'grid', gap: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
            <span>Uploading…</span>
            <span>{progress}%</span>
          </div>
          <div
            style={{
              height: '6px',
              borderRadius: '3px',
              background: 'var(--border, #e2e8f0)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: 'var(--primary, #4338ca)',
                transition: 'width 0.2s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Action Submit Button */}
      {file && (
        <button
          type="button"
          className="button button-primary"
          disabled={busy || disabled}
          onClick={handleSubmit}
          style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
        >
          {busy ? (
            'Uploading…'
          ) : (
            <>
              <Upload size={16} /> {submitLabel}
            </>
          )}
        </button>
      )}
    </div>
  )
}
