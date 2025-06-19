export interface DocCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  order: number;
}

export interface DocArticle {
  id: string;
  slug: string;
  category: string;
  title: string;
  description: string;
  content: string;
  order: number;
  readingTime: number;
  lastUpdated: Date;
  author?: string;
  tags?: string[];
}

export interface DocMetadata {
  title: string;
  description: string;
  author?: string;
  tags?: string[];
  order?: number;
}

export interface TableOfContentsItem {
  id: string;
  title: string;
  level: number;
  children?: TableOfContentsItem[];
}