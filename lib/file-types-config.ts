// Supported file types for upload
export const SUPPORTED_FILE_TYPES = {
  // Documents
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  
  // Text files
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'application/json': ['.json'],
  'text/yaml': ['.yml', '.yaml'],
  'application/xml': ['.xml'],
  'text/html': ['.html'],
  'text/css': ['.css'],
  
  // Programming languages
  'text/javascript': ['.js'],
  'application/javascript': ['.js'],
  'text/typescript': ['.ts'],
  'application/typescript': ['.ts', '.tsx'],
  'text/jsx': ['.jsx'],
  'text/python': ['.py'],
  'text/java': ['.java'],
  'text/c': ['.c', '.h'],
  'text/cpp': ['.cpp'],
  'text/go': ['.go'],
  'text/rust': ['.rs'],
  'application/x-sh': ['.sh'],
  'text/x-shellscript': ['.bash'],
  
  // Images
  'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp'],
} as const;

// Helper to get all supported extensions
export function getSupportedExtensions(): string[] {
  return Object.values(SUPPORTED_FILE_TYPES).flat();
}

// Helper to get display text for supported formats
export function getSupportedFormatsText(): string {
  return "PDF, DOCX, TXT, MD, JSON, YAML, XML, HTML, CSS, JS/TS, Python, Java, C/C++, Go, Rust, Shell scripts, Images (max 10MB per file)";
} 