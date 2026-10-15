// Tek dosyalık çevrimdışı önizleme (botla antrenman) derler.
// React, CDN'den UMD olarak yüklenir; uygulama kodu ve CSS sayfanın içine gömülür.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2] ?? "dist-preview/kovala.html";

const globalsPlugin = {
  name: "react-globals",
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({ path: args.path, namespace: "g" }));
    b.onLoad({ filter: /.*/, namespace: "g" }, (args) => {
      if (args.path === "react/jsx-runtime" || args.path === "react/jsx-dev-runtime") {
        // React 18 UMD'de jsx-runtime yok; createElement üzerinden küçük bir köprü.
        return {
          contents: `const R = window.React;
            const jsx = (type, props, key) => R.createElement(type, key === undefined ? props : { ...props, key });
            module.exports = { jsx, jsxs: jsx, jsxDEV: jsx, Fragment: R.Fragment };`,
          loader: "js",
        };
      }
      return {
        contents: args.path.startsWith("react-dom") ? "module.exports = window.ReactDOM;" : "module.exports = window.React;",
        loader: "js",
      };
    });
  },
};

const res = await build({
  entryPoints: ["src/client/main.tsx"],
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  outdir: "out",
  target: "es2020",
  jsx: "automatic",
  define: { "import.meta.env.VITE_OFFLINE": '"1"' },
  plugins: [globalsPlugin],
  logLevel: "warning",
});

let js = "";
let css = "";
for (const f of res.outputFiles) {
  if (f.path.endsWith(".js")) js = f.text;
  if (f.path.endsWith(".css")) css = f.text;
}
const svg = readFileSync("public/favicon.svg", "utf8");
const svgUri = "data:image/svg+xml," + encodeURIComponent(svg);
js = js.replace(/"\/favicon\.svg"/g, JSON.stringify(svgUri)).replace(/<\/script/gi, "<\\/script");

const html = `<title>Evade</title>
<meta name="theme-color" content="#0b1220">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,800;1,800&display=swap">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;
mkdirSync(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + " KB");
