import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileUpload } from './FileUpload.jsx'

afterEach(cleanup)

describe('FileUpload component', () => {
  it('validates and rejects unsupported file formats', () => {
    const handleUpload = vi.fn()
    render(
      <FileUpload
        accept="image/jpeg,image/png,application/pdf"
        maxSizeMB={10}
        onUpload={handleUpload}
      />,
    )

    const input = screen.getByLabelText(/choose file/i)
    const file = new File(['dummy content'], 'document.txt', { type: 'text/plain' })

    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Unsupported file format')
    expect(handleUpload).not.toHaveBeenCalled()
  })

  it('validates and rejects files exceeding the 10 MB maximum limit', () => {
    const handleUpload = vi.fn()
    render(
      <FileUpload
        accept="image/jpeg,image/png,application/pdf"
        maxSizeMB={10}
        onUpload={handleUpload}
      />,
    )

    const input = screen.getByLabelText(/choose file/i)
    // 11 MB file
    const largeFile = new File([new Uint8Array(11 * 1024 * 1024)], 'large-scan.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(input, { target: { files: [largeFile] } })

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('File exceeds maximum allowed size of 10 MB')
    expect(handleUpload).not.toHaveBeenCalled()
  })

  it('shows selected file information and submits successfully with progress', async () => {
    let capturedProgress = null
    const handleUpload = vi.fn(async (file, onProgress) => {
      onProgress({ loaded: 50, total: 100 })
      return { success: true, message: 'Medical record uploaded.' }
    })
    const handleSuccess = vi.fn()

    render(
      <FileUpload
        accept="application/pdf,image/jpeg"
        maxSizeMB={10}
        onUpload={handleUpload}
        onSuccess={handleSuccess}
        submitLabel="Upload record"
      />,
    )

    const input = screen.getByLabelText(/choose file/i)
    const validFile = new File(['valid pdf content'], 'xray-report.pdf', {
      type: 'application/pdf',
    })

    fireEvent.change(input, { target: { files: [validFile] } })

    expect(screen.getByText('xray-report.pdf')).toBeTruthy()
    const uploadBtn = screen.getByRole('button', { name: /upload record/i })
    expect(uploadBtn).toBeTruthy()

    fireEvent.click(uploadBtn)

    await waitFor(() => {
      expect(handleUpload).toHaveBeenCalledOnce()
      expect(handleSuccess).toHaveBeenCalledWith({ success: true, message: 'Medical record uploaded.' })
    })

    expect(screen.getByText('Medical record uploaded.')).toBeTruthy()
  })

  it('maps upload errors, prevents double submit, and allows retry', async () => {
    let failOnce = true
    const handleUpload = vi.fn(async () => {
      if (failOnce) {
        failOnce = false
        throw new Error('Uploads are temporarily unavailable. Please try again later or contact the clinic.')
      }
      return { success: true, message: 'Retry succeeded.' }
    })

    render(
      <FileUpload
        accept="application/pdf,image/jpeg"
        maxSizeMB={10}
        onUpload={handleUpload}
        submitLabel="Upload file"
      />,
    )

    const input = screen.getByLabelText(/choose file/i)
    const validFile = new File(['dummy bytes'], 'scan.jpg', { type: 'image/jpeg' })

    fireEvent.change(input, { target: { files: [validFile] } })
    const submitBtn = screen.getByRole('button', { name: /upload file/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
      expect(screen.getByRole('alert').textContent).toContain('Uploads are temporarily unavailable')
    })

    const retryBtn = screen.getByRole('button', { name: /retry/i })
    expect(retryBtn).toBeTruthy()
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Retry succeeded.')).toBeTruthy()
    })
  })
})
