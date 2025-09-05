import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getApiBaseUrl = () => {
	// Prefer a full URL if provided
	const direct = process.env.NEXT_PUBLIC_API_URL
	if (direct && direct.trim().length > 0) return direct.replace(/\/$/, '')

	// Compose from protocol + host if provided by platform
	const host = process.env.NEXT_PUBLIC_BACKEND_HOST
	const protocol = process.env.NEXT_PUBLIC_BACKEND_PROTOCOL || 'https'
	if (host && host.trim().length > 0) {
		return `${protocol}://${host}`
	}

	// Fallback to relative path (same origin)
	return ''
}

export const apiFetch = async (path: string, init?: RequestInit) => {
	const base = getApiBaseUrl()
	const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
	const res = await fetch(url, init)
	if (!res.ok) {
		const text = await res.text().catch(() => '')
		throw new Error(`API ${res.status}: ${text}`)
	}
	return res.json()
}
