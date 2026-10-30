import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordViewer } from './RecordViewer.jsx'
import client from '../api/client.js'

vi.mock('../api/client.js', () => ({
  default: {
    get: vi.fn(),
  },
}))

describe('RecordViewer component states', () => {
  let createdUrls = []

  beforeEach(() => {
    createdUrls = []
    global.URL.createObjectURL = vi.fn((blob) => {
      const url = `blob:http://localhost/${Math.random().toString(36).slice(2)}`
      createdUrls.push(url)
      return url
    })
    global.URL.revokeObjectURL = vi.fn()
    window.open = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders loading state initially while document is being fetched', async () => {
    let resolvePromise
    client.get.mockReturnValue(
      new Promise((res) => {
        resolvePromise = res
      }),
    )

    render(
      <RecordViewer
        record={{ _id: 'rec_1', title: 'X-Ray Scan', type: 'xray' }}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText(/loading document preview/i)).toBeTruthy()
    expect(screen.getByText('X-Ray Scan')).toBeTruthy()

    // Clean up unresolved promise
    resolvePromise({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) })
  })

  it('renders PDF state with <object> viewer and toolbar controls', async () => {
    const pdfBlob = new Blob(['%PDF-1.4 test pdf content'], { type: 'application/pdf' })
    client.get.mockResolvedValueOnce({
      data: pdfBlob,
    })

    const handleClose = vi.fn()
    render(
      <RecordViewer
        record={{
          _id: 'rec_pdf_1',
          title: 'Full Jaw Panoramic',
          type: 'xray',
          file: { format: 'pdf', originalName: 'jaw_panoramic.pdf' },
        }}
        onClose={handleClose}
      />,
    )

    await waitFor(() => {
      expect(screen.queryByText(/loading document preview/i)).toBeNull()
    })

    const obj = document.querySelector('object')
    expect(obj).toBeTruthy()
    expect(obj.getAttribute('type')).toBe('application/pdf')
    expect(obj.getAttribute('data')).toContain('blob:http://localhost/')

    // Toolbar buttons are rendered
    const downloadBtns = screen.getAllByRole('button', { name: /download/i })
    expect(downloadBtns.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: /open in new tab/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /print/i })).toBeTruthy()

    // Test Open in new tab
    fireEvent.click(screen.getByRole('button', { name: /open in new tab/i }))
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('blob:http://localhost/'),
      '_blank',
      'noopener,noreferrer',
    )

    // Test Download button click
    fireEvent.click(downloadBtns[0])

    // Test Close
    fireEvent.click(screen.getByRole('button', { name: /close viewer/i }))
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('renders image state with <img> element and zoom controls', async () => {
    const imageBlob = new Blob(['fake image bytes'], { type: 'image/png' })
    client.get.mockResolvedValueOnce({
      data: imageBlob,
    })

    render(
      <RecordViewer
        record={{
          _id: 'rec_img_1',
          title: 'Front Smile Photo',
          type: 'scan',
          file: { format: 'png', originalName: 'front_smile.png' },
        }}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.queryByText(/loading document preview/i)).toBeNull()
    })

    const img = screen.getByRole('img', { name: /front smile photo/i })
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toContain('blob:http://localhost/')

    // Zoom controls
    expect(screen.getByText('100%')).toBeTruthy()
    const zoomInBtn = screen.getByRole('button', { name: /zoom in/i })
    fireEvent.click(zoomInBtn)
    expect(screen.getByText('125%')).toBeTruthy()

    const zoomOutBtn = screen.getByRole('button', { name: /zoom out/i })
    fireEvent.click(zoomOutBtn)
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('renders error state with retry button when upstream fetch fails', async () => {
    client.get.mockRejectedValueOnce(new Error('Storage provider connection timed out or is unreachable.'))

    render(
      <RecordViewer
        record={{
          _id: 'rec_err_1',
          title: 'Corrupted File',
          type: 'other',
        }}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/unable to view document/i)).toBeTruthy()
    })

    expect(screen.getByText(/storage provider connection timed out/i)).toBeTruthy()
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    expect(retryBtn).toBeTruthy()

    // Test Retry
    const pdfBlob = new Blob(['%PDF-1.4 fixed content'], { type: 'application/pdf' })
    client.get.mockResolvedValueOnce({ data: pdfBlob })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.queryByText(/unable to view document/i)).toBeNull()
    })
    expect(document.querySelector('object')).toBeTruthy()
  })

  it('closes on Escape key press and revokes blob URL on unmount', async () => {
    const pdfBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    client.get.mockResolvedValueOnce({ data: pdfBlob })

    const handleClose = vi.fn()
    const { unmount } = render(
      <RecordViewer
        record={{ _id: 'rec_esc_1', title: 'Doc' }}
        onClose={handleClose}
      />,
    )

    await waitFor(() => {
      expect(document.querySelector('object')).toBeTruthy()
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalled()

    unmount()
    expect(global.URL.revokeObjectURL).toHaveBeenCalled()
  })
})
