/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the renderer's Node font paths valid in the production server bundle.
  serverExternalPackages: ["pdfmake"],
  outputFileTracingIncludes: {
    "/campaigns/*/export/*": ["./node_modules/pdfmake/fonts/Roboto/*.ttf"],
  },
};

export default nextConfig;
