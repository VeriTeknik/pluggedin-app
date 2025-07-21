// File type detection utilities

export const TEXT_FILE_EXTENSIONS = [
  '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.py', 
  '.yml', '.yaml', '.xml', '.html', '.css', '.scss', 
  '.java', '.c', '.cpp', '.h', '.go', '.rs', '.sh', '.bash'
] as const;

export const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  go: 'go',
  rs: 'rust',
  sh: 'bash',
  bash: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  md: 'markdown',
};

// Constants for viewer limits
export const ZOOM_LIMITS = {
  MIN: 0.1,
  MAX: 5.0,
  STEP: 1.2,
} as const;

export const PDF_SCALE_LIMITS = {
  MIN: 0.5,
  MAX: 3.0,
  DEFAULT: 1.0,
} as const;

// File type structure for better organization
export interface FileType {
  isText: boolean;
  isPDF: boolean;
  isImage: boolean;
}

export function getFileType(mimeType: string, fileName: string): FileType {
  return {
    isText: isTextFile(mimeType, fileName),
    isPDF: isPDFFile(mimeType),
    isImage: isImageFile(mimeType),
  };
}

export function isTextFile(mimeType: string, fileName: string): boolean {
  return mimeType.startsWith('text/') || 
         TEXT_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext));
}

export function isPDFFile(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function getFileLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return LANGUAGE_MAP[ext || ''] || 'text';
}

export function isMarkdownFile(fileName: string): boolean {
  return fileName.endsWith('.md');
}

// MIME type validation for security
export function isValidTextMimeType(mimeType: string | null): boolean {
  if (!mimeType) return false;
  
  const validTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/typescript',
    'application/xml',
  ];
  
  return validTypes.some(type => mimeType.startsWith(type));
}