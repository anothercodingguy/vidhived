import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// 1. Fix the Worker Configuration (do this at the top of the file)
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface DocumentViewerProps {
  pdfFile: File | null;
}

function DocumentViewer({ pdfFile }: DocumentViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState({}); // Track loading state per page

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }

  function onDocumentLoadError(err: Error) {
    console.error('PDF load error:', err);
    setError(err?.message || 'Failed to load PDF. Please make sure you are uploading a valid PDF file.');
    setLoading(false);
  }

  function onPageLoadSuccess(pageNumber: number) {
    setPageLoading((prev) => ({ ...prev, [pageNumber]: false }));
  }

  return (
    <div className="pdf-container w-full h-full overflow-auto flex items-center justify-center">
      {loading && !error && (
        <div className="text-center w-full">
          <span className="animate-spin inline-block mr-2">⏳</span>
          Loading PDF...<br />
          <span className="text-xs text-gray-400">If this takes too long, please check your file and try again.</span>
        </div>
      )}
      {error && (
        <div className="text-center text-red-500 w-full">
          <strong>Failed to load PDF:</strong> {error}
        </div>
      )}
      {!loading && !error && pdfFile && (
        <Document
          file={pdfFile}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading=""
        >
          {Array.from(new Array(numPages), (el, index) => {
            const pageNumber = index + 1;
            return (
              <div key={`page_${pageNumber}`} className="mb-4 relative">
                {/* Page loading indicator is not supported directly, so show after document loads and before page renders */}
                {/* You may use a skeleton or shimmer here if desired */}
                <Page
                  pageNumber={pageNumber}
                  onRenderSuccess={() => onPageLoadSuccess(pageNumber)}
                  onRenderError={onDocumentLoadError}
                />
              </div>
            );
          })}
        </Document>
      )}
    </div>
  );
}

export default DocumentViewer;
