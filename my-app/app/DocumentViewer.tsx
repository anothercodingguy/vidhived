import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// 1. Fix the Worker Configuration (do this at the top of the file)
console.log('Setting PDF.js worker:', pdfjs.version);
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type PDFSource = File | string | null;
interface DocumentViewerProps {
  pdfFile: PDFSource;
}

function DocumentViewer({ pdfFile }: DocumentViewerProps) {
  console.log('DocumentViewer mounted. pdfFile:', pdfFile);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState({}); // Track loading state per page

  // Debug: log file info
  React.useEffect(() => {
    if (typeof pdfFile === 'string') {
      console.log('PDF file URL:', pdfFile);
      setError(null);
      setLoading(true);
    } else if (pdfFile) {
      console.log('PDF file info:', {
        type: (pdfFile as File).type,
        size: (pdfFile as File).size,
        name: (pdfFile as File).name,
      });
      if ((pdfFile as File).type !== 'application/pdf') {
        setError('The uploaded file is not a valid PDF.');
        setLoading(false);
      }
    }
  }, [pdfFile]);

  // Timeout: if loading takes longer than 10s, show error
  React.useEffect(() => {
    if (loading && pdfFile) {
      const timer = setTimeout(() => {
        setError('PDF loading timed out. Please check your file or try a different PDF.');
        setLoading(false);
        console.error('PDF loading timed out.');
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [loading, pdfFile]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }

    function onDocumentLoadError(err: any) {
      // PDF.js errors can be strings or Error objects
      let errorMsg = 'Failed to load PDF.';
      if (err) {
        if (typeof err === 'string') errorMsg = err;
        else if (err.message) errorMsg = err.message;
        else if (err.toString) errorMsg = err.toString();
      }
      console.error('PDF load error:', err);
      setError(errorMsg + ' (PDF.js error)');
      setLoading(false);
    }

  function onPageLoadSuccess(pageNumber: number) {
    setPageLoading((prev) => ({ ...prev, [pageNumber]: false }));
  }

  // Fallback error if no file or invalid file
  if (!pdfFile) {
    return (
      <div className="text-center text-red-500 w-full">
        <strong>No PDF file selected.</strong>
        <div className="text-gray-400">Please upload a valid PDF document or provide a PDF URL.</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 w-full">
        <strong>Failed to load PDF:</strong> {error}
        <div className="text-xs text-gray-400 mt-2">Try a different browser or PDF file. If you see errors in the console, share them for support.</div>
      </div>
    );
  }

  return (
    <div className="pdf-container w-full h-full overflow-auto flex items-center justify-center">
      {loading && !error && (
        <div className="text-center w-full">
          <span className="animate-spin inline-block mr-2">⏳</span>
          Loading PDF...<br />
          <span className="text-xs text-gray-400">If this takes too long, check your file, browser compatibility, or try a different PDF.</span>
        </div>
      )}
      {!loading && !error && pdfFile && (
        <Document
          file={pdfFile}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div className="text-center text-blue-400">Loading PDF document...</div>}
          error={<div className="text-center text-red-500">Failed to load PDF. Please check the file or URL and try again.</div>}
          noData={<div className="text-center text-gray-400">No PDF file or URL provided.</div>}
        >
          {Array.from(new Array(numPages), (el, index) => {
            const pageNumber = index + 1;
            return (
              <div key={`page_${pageNumber}`} className="mb-4 relative">
                <Page
                  pageNumber={pageNumber}
                  onRenderSuccess={() => onPageLoadSuccess(pageNumber)}
                  onRenderError={onDocumentLoadError}
                  loading={<div className="text-center text-blue-400">Loading page {pageNumber}...</div>}
                  error={<div className="text-center text-red-500">Failed to load page {pageNumber}.</div>}
                  noData={<div className="text-center text-gray-400">No page data.</div>}
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
