// Font families map for easy access
export const fontFamilies = {
  geist: 'var(--font-geist-sans)',
  quicksand: 'Quicksand, sans-serif',
  nunito: 'Nunito, sans-serif',
  poppins: 'Poppins, sans-serif',
  roboto: 'Roboto, sans-serif',
  ubuntu: 'Ubuntu, sans-serif',
  'varela-round': 'Varela Round, sans-serif',
  'work-sans': 'Work Sans, sans-serif',
  'zilla-slab': 'Zilla Slab, serif',
  comfortaa: 'Comfortaa, cursive',
};

export type FontFamily = keyof typeof fontFamilies;

// Initialize font from localStorage or use default on client
export function initializeFont() {
  if (typeof window !== 'undefined') {
    const savedFont = localStorage.getItem('pluggedin-font') as FontFamily;
    if (savedFont && savedFont in fontFamilies) {
      setFont(savedFont);
    }
  }
}

// Apply font to document root
export function setFont(fontFamily: FontFamily) {
  if (typeof window !== 'undefined' && fontFamily in fontFamilies) {
    document.documentElement.style.fontFamily = fontFamilies[fontFamily];
    localStorage.setItem('pluggedin-font', fontFamily);
  }
} 