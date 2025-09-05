"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { apiFetch } from "@/lib/utils"
import NextDynamic from "next/dynamic"
import {
  Upload,
  FileText,
  MessageCircle,
  Send,
  Loader2,
  XCircle,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

// React-PDF must be client-only; dynamically import components with SSR disabled
const Document = NextDynamic(async () => (await import("react-pdf")).Document, { ssr: false }) as any
const Page = NextDynamic(async () => (await import("react-pdf")).Page, { ssr: false }) as any

interface Clause {
  id: string
  type: string
  category: "high" | "medium" | "low"
  explanation: string
  location: {
    page: number
    x: number
    y: number
    width: number
    height: number
  }
}

interface AnalysisResult {
  status: "completed" | "processing" | "failed"
  analysis: Clause[]
}

interface ChatMessage {
  id: string
  type: "user" | "ai"
  message: string
  timestamp: Date
}

type AppState = "idle" | "uploading" | "processing" | "analyzing" | "failed"

export const dynamic = "force-dynamic"

export default function VidHivedApp() {
  const [appState, setAppState] = useState<AppState>("idle")
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [activeClause, setActiveClause] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"insights" | "chat">("insights")
  const [chatInput, setChatInput] = useState("")
  const [numPages, setNumPages] = useState<number>(0)
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const [scale, setScale] = useState(1.0)
  const [currentPage, setCurrentPage] = useState(1)
  const [showToolbar, setShowToolbar] = useState(false)
  const [pageRefs, setPageRefs] = useState<{ [key: number]: HTMLDivElement | null }>({})
  const [hoveredClause, setHoveredClause] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfViewerRef = useRef<HTMLDivElement>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "high":
        return "#B22222"
      case "medium":
        return "#FBBF24"
      case "low":
        return "#22C55E"
      default:
        return "#6B7280"
    }
  }

  const handleUpload = async (file: File) => {
    if (!file || file.type !== "application/pdf") {
      alert("Please select a valid PDF file")
      return
    }

    setPdfFile(file)
    setAppState("uploading")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await apiFetch("/upload", {
        method: "POST",
        body: formData as any,
      })

      const data = response as any
      setDocumentId(data.documentId)
      setAppState("processing")

      // Start polling for analysis status
      checkAnalysisStatus(data.documentId)
    } catch (error) {
      console.error("Upload error:", error)
      setAppState("failed")
    }
  }

  const checkAnalysisStatus = (id: string) => {
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const data: AnalysisResult = await apiFetch(`/document/${id}`)

        if (data.status === "completed") {
          setAnalysisResult(data)
          setAppState("analyzing")
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
          }
        } else if (data.status === "failed") {
          setAppState("failed")
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
          }
        }
      } catch (error) {
        console.error("Status check error:", error)
        setAppState("failed")
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
      }
    }, 3000)
  }

  const handleAskQuestion = async (query: string) => {
    if (!query.trim() || !documentId) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      message: query,
      timestamp: new Date(),
    }

    setChatHistory((prev) => [...prev, userMessage])
    setChatInput("")

    try {
      const response = await apiFetch("/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId,
          query,
        }),
      })

      const data = response as any

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        message: data.answer,
        timestamp: new Date(),
      }

      setChatHistory((prev) => [...prev, aiMessage])
    } catch (error) {
      console.error("Ask question error:", error)
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        message: "Sorry, I encountered an error processing your question.",
        timestamp: new Date(),
      }
      setChatHistory((prev) => [...prev, errorMessage])
    }
  }

  const handleClauseClick = (clauseId: string) => {
    setActiveClause(clauseId)

    const clause = analysisResult?.analysis.find((c) => c.id === clauseId)
    if (clause && pageRefs[clause.location.page]) {
      const pageElement = pageRefs[clause.location.page]
      if (pageElement) {
        // Scroll to page first
        pageElement.scrollIntoView({ behavior: "smooth", block: "center" })

        // Then scroll to specific highlight within the page
        setTimeout(() => {
          const highlightElement = pageElement.querySelector(`[data-clause-id="${clauseId}"]`)
          if (highlightElement) {
            highlightElement.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        }, 500)
      }
    }
  }

  const handleClauseHover = (clauseId: string | null) => {
    setHoveredClause(clauseId)
  }

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3.0))
  }

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5))
  }

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1)
      const pageElement = pageRefs[currentPage - 1]
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }
  }

  const handleNextPage = () => {
    if (currentPage < numPages) {
      setCurrentPage((prev) => prev + 1)
      const pageElement = pageRefs[currentPage + 1]
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }
  }

  const getScaledCoordinates = useCallback(
    (clause: Clause, pageWidth: number, pageHeight: number) => {
      const scaleX = pageWidth / pdfDimensions.width
      const scaleY = pageHeight / pdfDimensions.height

      return {
        left: clause.location.x * scaleX,
        top: clause.location.y * scaleY,
        width: clause.location.width * scaleX,
        height: clause.location.height * scaleY,
      }
    },
    [pdfDimensions],
  )

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNumber = Number.parseInt(entry.target.getAttribute("data-page-number") || "1")
            setCurrentPage(pageNumber)
          }
        })
      },
      { threshold: 0.5 },
    )

    Object.values(pageRefs).forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [pageRefs])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
  }

  const onPageLoadSuccess = (page: any) => {
    try {
      const viewport = page.getViewport({ scale: 1 })
      setPdfDimensions({ width: viewport.width, height: viewport.height })
    } catch {
      // no-op in SSR fallback
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleUpload(file)
    }
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) {
      handleUpload(file)
    }
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
  }

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  // Initial Upload Screen
  if (appState === "idle") {
    return (
      <div className="min-h-screen bg-gray-900 text-white font-['Inter'] flex items-center justify-center p-8">
        <div className="text-center max-w-md w-full">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Vidhived.ai
          </h1>
          <p className="text-gray-400 mb-8 text-lg">Your Smart Legal Co-pilot</p>

          <div
            className="border-2 border-dashed border-gray-600 rounded-lg p-12 mb-6 hover:border-blue-500 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-300 mb-2">Drag and drop your PDF here</p>
            <p className="text-gray-500 text-sm">or click to browse</p>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
          >
            Upload Document
          </button>

          <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileSelect} className="hidden" />
        </div>
      </div>
    )
  }

  // Processing States
  if (appState === "uploading" || appState === "processing") {
    return (
      <div className="min-h-screen bg-gray-900 text-white font-['Inter'] flex">
        {/* Left Pane - PDF Skeleton */}
        <div className="flex-1 p-6 border-r border-gray-700">
          <div className="bg-gray-800 rounded-lg h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-48 h-64 bg-gray-700 rounded-lg mb-4 animate-pulse"></div>
              <p className="text-gray-400">Digitizing Document...</p>
            </div>
          </div>
        </div>

        {/* Right Pane - Analysis Loading */}
        <div className="w-2/5 p-6 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
            <p className="text-gray-300 mb-2">Analyzing Clauses & Highlighting Risks...</p>
            <p className="text-gray-500 text-sm">This may take a moment.</p>
          </div>
        </div>
      </div>
    )
  }


  // Main Analysis View (show PDF viewer for both 'analyzing' and 'failed' states)
  if (appState === "analyzing" || appState === "failed") {
    return (
      <div className="min-h-screen bg-gray-900 text-white font-['Inter'] flex flex-col lg:flex-row">
        {/* Left Pane - Enhanced PDF Viewer */}
        <div
          className="flex-1 p-6 border-r border-gray-700 overflow-auto relative"
          ref={pdfViewerRef}
          onMouseEnter={() => setShowToolbar(true)}
          onMouseLeave={() => setShowToolbar(false)}
        >
          <div className="relative">
            {pdfFile && (
              <Document file={pdfFile} onLoadSuccess={onDocumentLoadSuccess} className="max-w-full">
                {Array.from(new Array(numPages), (el, index) => {
                  const pageNumber = index + 1
                  return (
                    <div
                      key={`page_${pageNumber}`}
                      className="relative mb-4"
                      data-page-number={pageNumber}
                      ref={(el) => setPageRefs((prev) => ({ ...prev, [pageNumber]: el }))}
                    >
                      <Page
                        pageNumber={pageNumber}
                        onLoadSuccess={onPageLoadSuccess}
                        className="shadow-lg"
                        scale={scale}
                        width={Math.min(600 * scale, window.innerWidth * 0.5)}
                      />

                      {analysisResult?.analysis
                        .filter((clause) => clause.location.page === pageNumber)
                        .map((clause) => {
                          const pageElement = pageRefs[pageNumber]
                          const pageRect = pageElement?.querySelector("canvas")?.getBoundingClientRect()

                          if (!pageRect) return null

                          const coords = getScaledCoordinates(clause, pageRect.width, pageRect.height)
                          const isActive = activeClause === clause.id
                          const isHovered = hoveredClause === clause.id

                          return (
                            <div
                              key={clause.id}
                              data-clause-id={clause.id}
                              className={`absolute cursor-pointer transition-all duration-200 border ${
                                isActive ? "opacity-40 border-2" : isHovered ? "opacity-35 border" : "opacity-30 border"
                              }`}
                              style={{
                                left: `${coords.left}px`,
                                top: `${coords.top}px`,
                                width: `${coords.width}px`,
                                height: `${coords.height}px`,
                                backgroundColor: getCategoryColor(clause.category),
                                borderColor: getCategoryColor(clause.category),
                              }}
                              onMouseEnter={() => handleClauseHover(clause.id)}
                              onMouseLeave={() => handleClauseHover(null)}
                              onClick={() => handleClauseClick(clause.id)}
                            />
                          )
                        })}
                    </div>
                  )
                })}
              </Document>
            )}
          </div>

          {showToolbar && pdfFile && (
            <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-800/70 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-2 z-10 transition-opacity duration-200">
              <button
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                className="p-2 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <span className="text-sm text-gray-300 px-2">{Math.round(scale * 100)}%</span>

              <button
                onClick={handleZoomIn}
                disabled={scale >= 3.0}
                className="p-2 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <div className="w-px h-6 bg-gray-600 mx-2" />

              <button
                onClick={handlePrevPage}
                disabled={currentPage <= 1}
                className="p-2 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-sm text-gray-300 px-2 min-w-[80px] text-center">
                Page {currentPage} of {numPages}
              </span>

              <button
                onClick={handleNextPage}
                disabled={currentPage >= numPages}
                className="p-2 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right Pane - AI Insights Panel */}
        <div className="w-full lg:w-2/5 flex flex-col bg-gray-800">
          {/* Tab Headers */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab("insights")}
              className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 transition-colors ${
                activeTab === "insights"
                  ? "bg-gray-700 text-blue-400 border-b-2 border-blue-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <FileText className="w-5 h-5" />
              Key Insights
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 transition-colors ${
                activeTab === "chat"
                  ? "bg-gray-700 text-blue-400 border-b-2 border-blue-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <MessageCircle className="w-5 h-5" />
              AI Chat
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto">
            {appState === "failed" ? (
              <div className="flex flex-col items-center justify-center h-full">
                <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">Analysis Failed</h2>
                <p className="text-gray-400 mb-6">Something went wrong while processing your document.</p>
                <button
                  onClick={() => {
                    setAppState("idle")
                    setDocumentId(null)
                    setAnalysisResult(null)
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : (
              // ...existing tab content rendering...
              <>{activeTab === "insights" ? renderInsightsTab() : renderChatTab()}</>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Main Analysis View
  return (
    <div className="min-h-screen bg-gray-900 text-white font-['Inter'] flex flex-col lg:flex-row">
      {/* Left Pane - Enhanced PDF Viewer */}
      <div
        className="flex-1 p-6 border-r border-gray-700 overflow-auto relative"
        ref={pdfViewerRef}
        onMouseEnter={() => setShowToolbar(true)}
        onMouseLeave={() => setShowToolbar(false)}
      >
        <div className="relative">
          {pdfFile && (
            <Document file={pdfFile} onLoadSuccess={onDocumentLoadSuccess} className="max-w-full">
              {Array.from(new Array(numPages), (el, index) => {
                const pageNumber = index + 1
                return (
                  <div
                    key={`page_${pageNumber}`}
                    className="relative mb-4"
                    data-page-number={pageNumber}
                    ref={(el) => setPageRefs((prev) => ({ ...prev, [pageNumber]: el }))}
                  >
                    <Page
                      pageNumber={pageNumber}
                      onLoadSuccess={onPageLoadSuccess}
                      className="shadow-lg"
                      scale={scale}
                      width={Math.min(600 * scale, window.innerWidth * 0.5)}
                    />

                    {analysisResult?.analysis
                      .filter((clause) => clause.location.page === pageNumber)
                      .map((clause) => {
                        const pageElement = pageRefs[pageNumber]
                        const pageRect = pageElement?.querySelector("canvas")?.getBoundingClientRect()

                        if (!pageRect) return null

                        const coords = getScaledCoordinates(clause, pageRect.width, pageRect.height)
                        const isActive = activeClause === clause.id
                        const isHovered = hoveredClause === clause.id

                        return (
                          <div
                            key={clause.id}
                            data-clause-id={clause.id}
                            className={`absolute cursor-pointer transition-all duration-200 border ${
                              isActive ? "opacity-40 border-2" : isHovered ? "opacity-35 border" : "opacity-30 border"
                            }`}
                            style={{
                              left: `${coords.left}px`,
                              top: `${coords.top}px`,
                              width: `${coords.width}px`,
                              height: `${coords.height}px`,
                              backgroundColor: getCategoryColor(clause.category),
                              borderColor: getCategoryColor(clause.category),
                            }}
                            onMouseEnter={() => handleClauseHover(clause.id)}
                            onMouseLeave={() => handleClauseHover(null)}
                            onClick={() => handleClauseClick(clause.id)}
                          />
                        )
                      })}
                  </div>
                )
              })}
            </Document>
          )}
        </div>

        {showToolbar && pdfFile && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-800/70 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-2 z-10 transition-opacity duration-200">
            <button
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="p-2 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <span className="text-sm text-gray-300 px-2">{Math.round(scale * 100)}%</span>

            <button
              onClick={handleZoomIn}
              disabled={scale >= 3.0}
              className="p-2 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <div className="w-px h-6 bg-gray-600 mx-2" />

            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="p-2 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-sm text-gray-300 px-2 min-w-[80px] text-center">
              Page {currentPage} of {numPages}
            </span>

            <button
              onClick={handleNextPage}
              disabled={currentPage >= numPages}
              className="p-2 text-white hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Right Pane - AI Insights Panel */}
      <div className="w-full lg:w-2/5 flex flex-col bg-gray-800">
        {/* Tab Headers */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab("insights")}
            className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 transition-colors ${
              activeTab === "insights"
                ? "bg-gray-700 text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <FileText className="w-5 h-5" />
            Key Insights
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 transition-colors ${
              activeTab === "chat"
                ? "bg-gray-700 text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            Ask a Question
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "insights" && (
            <div className="h-full overflow-y-auto p-6 space-y-4">
              {analysisResult?.analysis.map((clause) => (
                <div
                  key={clause.id}
                  onClick={() => handleClauseClick(clause.id)}
                  onMouseEnter={() => handleClauseHover(clause.id)}
                  onMouseLeave={() => handleClauseHover(null)}
                  className={`bg-gray-700 rounded-lg p-4 cursor-pointer transition-all duration-200 hover:bg-gray-600 border-l-4 ${
                    activeClause === clause.id ? "ring-2 ring-blue-500" : ""
                  } ${hoveredClause === clause.id ? "bg-gray-600" : ""}`}
                  style={{ borderLeftColor: getCategoryColor(clause.category) }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                      style={{ backgroundColor: getCategoryColor(clause.category) }}
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-white mb-2">{clause.type}</h3>
                      <p className="text-gray-300 text-sm leading-relaxed">{clause.explanation}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "chat" && (
            <div className="h-full flex flex-col">
              {/* Chat History */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatHistory.length === 0 ? (
                  <div className="text-center text-gray-400 mt-8">
                    <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Ask me anything about your document</p>
                  </div>
                ) : (
                  chatHistory.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.type === "user" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-100"
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{message.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Chat Input */}
              <div className="p-6 border-t border-gray-700">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleAskQuestion(chatInput)
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask a question about your document..."
                    className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
