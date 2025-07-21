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