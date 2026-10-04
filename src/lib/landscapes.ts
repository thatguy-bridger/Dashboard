/** Wikimedia Commons landscape photos for the idle StandBy backdrop. Fetched at
 *  960px, then pre-blurred once client-side (sigma ~22, saturation x1.25). */
const FILES = [
  "Lake Tahoe at sunset.jpg",
  "Ahuriri River before sunrise, Canterbury, New Zealand.jpg",
  "At Lyngen fjord, Spåkenes in 2012 June.jpg",
  "Alone in the unspoilt wilderness (Unsplash).jpg",
  "Amanecer en el lago Titicaca, Puno, Perú, 2015-08-01, DD 01.JPG",
  "Bieszczady - sunrise from Chatka Puchatka (2).jpg",
];

export const LANDSCAPE_SOURCES = FILES.map(
  (f) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=960`
);

/** Same-origin URLs the client loads (see /api/landscape). */
export const LANDSCAPE_URLS = FILES.map((_, i) => `/api/landscape?i=${i}`);
