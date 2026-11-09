import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are bundled in the repo (src/fonts, variable woff2, Latin subset) so a build never depends on downloading them.
// Pairing A (used): Figtree for words, Nunito for numerals (tabular figures, so a ticking clock never jitters). Calm weights only: 400 to 600.
const textA = localFont({ src: "../fonts/figtree.woff2", weight: "400 600", variable: "--nf-text-a", display: "swap" });
const numA = localFont({ src: "../fonts/nunito.woff2", weight: "300 600", variable: "--nf-num-a", display: "swap" });
// Pairing B (candidate, only loaded for local previews: ?font=b): DM Sans + Quicksand.
const textB = localFont({ src: "../fonts/dm-sans.woff2", weight: "400 600", variable: "--nf-text-b", display: "swap" });
const numB = localFont({ src: "../fonts/quicksand.woff2", weight: "400 600", variable: "--nf-num-b", display: "swap" });

export const metadata: Metadata = { title: "Home", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0f0e13", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

const PREVIEW = process.env.NEXT_PUBLIC_DASH_MOCK === "1";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cls = [textA.variable, numA.variable, ...(PREVIEW ? [textB.variable, numB.variable] : [])].join(" ");
  return (<html lang="en" className={cls}><body>{children}<script dangerouslySetInnerHTML={{ __html: "(function(){var errs=[];window.addEventListener('error',function(ev){errs.push(String(ev&&ev.message||ev))});window.addEventListener('unhandledrejection',function(ev){errs.push('promise: '+String(ev&&ev.reason))});\nfunction feats(){var c=window.CSS&&CSS.supports?CSS.supports.bind(CSS):function(){return false};return 'color-mix:'+c('color','color-mix(in srgb, red 50%, blue)')+' aspect-ratio:'+c('aspect-ratio','1 / 1')+' inset:'+c('inset','0')+' container:'+c('container-type','inline-size')+' backdrop:'+(c('backdrop-filter','blur(2px)')||c('-webkit-backdrop-filter','blur(2px)'))+' flex-gap:'+c('gap','1px')}\nfunction box(t,border){var d=document.createElement('div');d.style.cssText='position:fixed;left:2%;right:2%;'+border+';padding:20px;background:#000;color:#fff;font:18px/1.4 sans-serif;z-index:99999;border:2px solid #f66;border-radius:12px;word-break:break-all';d.textContent=t;document.body.appendChild(d)}\nsetTimeout(function(){if(!document.documentElement.getAttribute('data-ready'))box('The page could not start. '+navigator.userAgent+' | '+feats()+' | '+errs.join(' | '),'top:8%')},10000);\nif(/[?&]debug=1/.test(location.search))window.addEventListener('load',function(){box(navigator.userAgent+' | '+feats()+' | '+innerWidth+'x'+innerHeight+' dpr '+devicePixelRatio,'bottom:2%')})})();" }} /></body></html>);
}
