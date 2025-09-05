import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getApiBaseUrl = () => {
	const env = process.env.NEXT_PUBLIC_API_URL
	if (env && env.trim().length > 0) return env.replace(/\/$/, '')
	// Fallback to relative path (proxy) in dev
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
