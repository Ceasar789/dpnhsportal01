// src/constants/images.js
const BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/school-assets`;

export const IMAGES = {
  logo:        `${BASE}/branding/capstonelogo.png`,
  background:  `${BASE}/branding/capstonebackground.jpg`,
  carousel1:   `${BASE}/carousel/capstoneimage1.jpg`,
  carousel2:   `${BASE}/carousel/capstoneimage2.jpg`,
  carousel3:   `${BASE}/carousel/capstoneimage3.jpg`,
};