import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Download,
  ExternalLink,
  Printer,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileText,
  AlertTriangle,
  RefreshCw,
  Eye,
} from 'lucide-react';
import client from '../api/client';

export function RecordViewer({ record, fileUrl, title, onClose }) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [blobUrl, setBlobUrl] = useState(null);
  const [fileType, setFileType] = useState('pdf'); // 'pdf' | 'image' | 'other'
  const [errorMessage, setErrorMessage] = useState('');
  const [zoom, setZoom] = useState(1);
  const frameRef = useRef(null);
  const activeBlobRef = useRef(null);

  const docTitle = title || record?.title || 'Document';
  const docType = record?.type || (fileType === 'pdf' ? 'PDF Document' : 'Document');

  const isMobile =
    typeof navigator !== 'undefined' &&
    (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && window.innerWidth < 768));

  const loadDocument = useCallback(async () => {
    setStatus('loading');
    setErrorMessage('');

    // Determine target endpoint
    let endpoint = '';
    if (fileUrl) {
      endpoint = fileUrl;
    } else if (record?._id) {
      endpoint = `/medical-records/${record._id}/file`;
    } else if (record?.file?.url) {
      endpoint = record.file.url;
    }

    if (!endpoint) {
      setStatus('error');
      setErrorMessage('No valid file path or record ID specified.');
      return;
    }

    try {
      const response = await client.get(endpoint, {
        responseType: 'blob',
        timeout: 20000,
      });

      const blob = response.data;
      let detectedType = 'other';
      let resolvedBlob = blob;

      const declaredMime = blob.type || '';
      const declaredFormat = (record?.file?.format || '').toLowerCase();
      const declaredName = (record?.file?.originalName || docTitle || '').toLowerCase();

      // Check PDF indicators
      if (
        declaredMime.includes('pdf') ||
        declaredFormat === 'pdf' ||
        declaredName.endsWith('.pdf')
      ) {
        detectedType = 'pdf';
        if (!declaredMime.includes('pdf')) {
          resolvedBlob = new Blob([blob], { type: 'application/pdf' });
        }
      } else if (
        declaredMime.startsWith('image/') ||
        ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(declaredFormat)
      ) {
        detectedType = 'image';
      } else {
        // Inspect magic bytes if content-type was octet-stream
        try {
          const headerBuffer = await blob.slice(0, 8).arrayBuffer();
          const bytes = new Uint8Array(headerBuffer);
          if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
            detectedType = 'pdf';
            resolvedBlob = new Blob([blob], { type: 'application/pdf' });
          } else if (
            bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47
          ) {
            detectedType = 'image';
          } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
            detectedType = 'image';
          }
        } catch {
          // ignore byte check failure
        }
      }

      if (activeBlobRef.current) {
        URL.revokeObjectURL(activeBlobRef.current);
      }

      const url = URL.createObjectURL(resolvedBlob);
      activeBlobRef.current = url;
      setBlobUrl(url);
      setFileType(detectedType);
      setStatus('success');
    } catch (err) {
      let msg = 'Unable to fetch the requested document.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json?.message) msg = json.message;
        } catch {
          // fallback
        }
      } else if (err.response?.data?.message) {
        msg = err.response.data.message;
      } else if (err.message) {
        msg = err.message;
      }
      setErrorMessage(msg);
      setStatus('error');
    }
  }, [fileUrl, record, docTitle]);

  useEffect(() => {
    loadDocument();
    return () => {
      if (activeBlobRef.current) {
        URL.revokeObjectURL(activeBlobRef.current);
        activeBlobRef.current = null;
      }
    };
  }, [loadDocument]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Direct user gesture download
  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    const ext = fileType === 'pdf' ? 'pdf' : (record?.file?.format || 'bin');
    const safeTitle = (docTitle || 'document').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = record?.file?.originalName || `${safeTitle}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Direct user gesture new tab
  const handleOpenInNewTab = () => {
    if (!blobUrl) return;
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  };

  // Direct user gesture print
  const handlePrint = () => {
    if (!blobUrl) return;
    if (fileType === 'pdf' && frameRef.current?.contentWindow) {
      try {
        frameRef.current.contentWindow.print();
        return;
      } catch {
        // Fallback to window.open for print
      }
    }
    const printWin = window.open(blobUrl, '_blank');
    if (printWin) {
      printWin.addEventListener('load', () => printWin.print(), { once: true });
    }
  };

  return (
    <div
      className="modal-backdrop record-viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={docTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="modal-dialog record-viewer-dialog">
        {/* Top Header & Toolbar */}
        <header className="record-viewer-header">
          <div className="record-viewer-info">
            <span className="record-type-pill">{docType}</span>
            <h2 className="record-viewer-title" title={docTitle}>
              {docTitle}
            </h2>
          </div>

          <div className="record-viewer-tools">
            {fileType === 'image' && status === 'success' && (
              <div className="record-viewer-zoom-group">
                <button
                  type="button"
                  className="icon-button"
                  title="Zoom Out"
                  aria-label="Zoom Out"
                  onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                >
                  <ZoomOut size={16} />
                </button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  className="icon-button"
                  title="Zoom In"
                  aria-label="Zoom In"
                  onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title="Reset Zoom"
                  aria-label="Reset Zoom"
                  onClick={() => setZoom(1)}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            )}

            {status === 'success' && (
              <>
                <button
                  type="button"
                  className="button button-quiet button-small toolbar-btn"
                  onClick={handleOpenInNewTab}
                  title="Open in new browser tab"
                  aria-label="Open in new tab"
                >
                  <ExternalLink size={15} />
                  <span className="btn-text">Open</span>
                </button>

                <button
                  type="button"
                  className="button button-quiet button-small toolbar-btn"
                  onClick={handlePrint}
                  title="Print document"
                  aria-label="Print"
                >
                  <Printer size={15} />
                  <span className="btn-text">Print</span>
                </button>

                <button
                  type="button"
                  className="button button-primary button-small toolbar-btn"
                  onClick={handleDownload}
                  title="Download file"
                  aria-label="Download"
                >
                  <Download size={15} />
                  <span className="btn-text">Download</span>
                </button>
              </>
            )}

            <button
              type="button"
              className="icon-button close-btn"
              onClick={onClose}
              title="Close viewer (Esc)"
              aria-label="Close viewer"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="record-viewer-body">
          {status === 'loading' && (
            <div className="record-viewer-loading">
              <RefreshCw className="animate-spin text-teal-500" size={32} />
              <p>Loading document preview...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="record-viewer-error">
              <AlertTriangle size={38} className="text-rose-500 mb-2" />
              <h3>Unable to view document</h3>
              <p className="record-error-msg">{errorMessage}</p>
              <div className="record-error-actions">
                <button
                  type="button"
                  className="button button-primary button-small"
                  onClick={loadDocument}
                >
                  <RefreshCw size={14} className="mr-1" /> Retry
                </button>
                <button
                  type="button"
                  className="button button-quiet button-small"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {status === 'success' && fileType === 'pdf' && (
            <div className="record-viewer-pdf-container">
              {isMobile && (
                <div className="mobile-pdf-notice">
                  <span>Mobile browsers may restrict multi-page PDF viewing.</span>
                  <div className="mobile-notice-btns">
                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={handleOpenInNewTab}
                    >
                      <ExternalLink size={14} className="mr-1" /> Open Full PDF
                    </button>
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      onClick={handleDownload}
                    >
                      <Download size={14} className="mr-1" /> Download
                    </button>
                  </div>
                </div>
              )}
              <object
                ref={frameRef}
                data={blobUrl}
                type="application/pdf"
                className="record-viewer-frame"
                aria-label={docTitle}
              >
                <div className="pdf-fallback-view">
                  <FileText size={44} className="text-slate-400 mb-2" />
                  <p>Inline PDF rendering is not supported by your browser.</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={handleOpenInNewTab}
                    >
                      Open PDF in New Tab
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={handleDownload}
                    >
                      Download PDF
                    </button>
                  </div>
                </div>
              </object>
            </div>
          )}

          {status === 'success' && fileType === 'image' && (
            <div className="record-viewer-image-container">
              <img
                src={blobUrl}
                alt={docTitle}
                className="record-viewer-img"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
              />
            </div>
          )}

          {status === 'success' && fileType === 'other' && (
            <div className="record-viewer-other">
              <FileText size={52} className="text-teal-400 mb-3" />
              <h3>{docTitle}</h3>
              <p>Preview is not available for this file type.</p>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleDownload}
                >
                  <Download size={15} className="mr-1" /> Download File
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleOpenInNewTab}
                >
                  <ExternalLink size={15} className="mr-1" /> Open in New Tab
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RecordViewer;

