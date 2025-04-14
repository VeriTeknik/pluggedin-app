// Font families map for easy access
export const fontFamilies = {
  geist: 'var(--font-geist-sans)',
  quicksand: 'var(--font-quicksand)',
  nunito: 'var(--font-nunito)',
  poppins: 'var(--font-poppins)',
  roboto: 'var(--font-roboto)',
  ubuntu: 'var(--font-ubuntu)',
  'varela-round': 'Varela Round, sans-serif',
  'work-sans': 'var(--font-work-sans)',
  'zilla-slab': 'var(--font-zilla-slab)',
  comfortaa: 'var(--font-comfortaa)',
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
    // Remove all existing font classes
    document.documentElement.classList.forEach((className) => {
      if (className.startsWith('font-')) {
        document.documentElement.classList.remove(className);
      }
    });
    
    // Add the new font class
    document.documentElement.classList.add(`font-${fontFamily}`);
    localStorage.setItem('pluggedin-font', fontFamily);
  }
} 