/** @type {import('next').NextConfig} */
const nextConfig = {
	output: 'standalone',
	reactStrictMode: true,
	typescript: { ignoreBuildErrors: false },
	eslint: { ignoreDuringBuilds: true },
	experimental: { optimizePackageImports: ['lucide-react'] },
}

export default nextConfig;
