/** @type {import('next').NextConfig} */
const supabaseHostname = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) return null;
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const nextConfig = {
  transpilePackages: ["@refinedev/antd"],
  output: "standalone",
  excludeDefaultMomentLocales: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack(config) {
    // Excluir la carpeta academia-crystal-main del bundle
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [...(config.watchOptions?.ignored || []), "**/academia-crystal-main/**"],
    };
    return config;
  },
  images: {
    remotePatterns: [
      ...(supabaseHostname
        ? [
            {
              protocol: "https",
              hostname: supabaseHostname,
            },
          ]
        : []),
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
