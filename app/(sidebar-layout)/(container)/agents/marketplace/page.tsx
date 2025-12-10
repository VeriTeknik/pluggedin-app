'use client';

import {
  BadgeCheck,
  Box,
  Download,
  Filter,
  Search,
  Star,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AGENT_CATEGORIES,
  type AgentTemplate,
  DEFAULT_TEMPLATES_LIMIT,
  isValidImageUrl,
  SWR_MARKETPLACE_CONFIG,
} from '@/lib/pap-ui-utils';

interface TemplatesResponse {
  templates: AgentTemplate[];
  total: number;
  limit: number;
  offset: number;
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch templates');
  return response.json();
};


export default function MarketplacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [showFeatured, setShowFeatured] = useState(searchParams.get('featured') === 'true');

  // Sync state with URL when user navigates back/forward
  useEffect(() => {
    setSearchQuery(searchParams.get('search') || '');
    setCategory(searchParams.get('category') || 'all');
    setShowFeatured(searchParams.get('featured') === 'true');
  }, [searchParams]);

  // Build query URL
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (category && category !== 'all') params.set('category', category);
    if (showFeatured) params.set('featured', 'true');
    params.set('limit', String(DEFAULT_TEMPLATES_LIMIT));
    return `/api/agents/templates?${params.toString()}`;
  }, [searchQuery, category, showFeatured]);

  const { data, error, isLoading } = useSWR<TemplatesResponse>(
    queryUrl,
    fetcher,
    SWR_MARKETPLACE_CONFIG
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Update URL params
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (category && category !== 'all') params.set('category', category);
    if (showFeatured) params.set('featured', 'true');
    router.push(`/agents/marketplace?${params.toString()}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Agent Marketplace</h1>
            <p className="text-muted-foreground mt-1">
              Discover and deploy autonomous agents for your workflows
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/agents">
              <Box className="mr-2 h-4 w-4" />
              My Agents
            </Link>
          </Button>
        </div>

        {/* Search and Filters */}
        <form onSubmit={handleSearch} className="flex gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {AGENT_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={showFeatured ? 'default' : 'outline'}
            onClick={() => setShowFeatured(!showFeatured)}
          >
            <Star className="mr-2 h-4 w-4" />
            Featured
          </Button>
          <Button type="submit">Search</Button>
        </form>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-pulse">Loading templates...</div>
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">
          Failed to load templates. Please try again.
        </div>
      ) : data?.templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Box className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Templates Found</h3>
            <p className="text-muted-foreground">
              {searchQuery
                ? `No results for "${searchQuery}". Try different search terms.`
                : 'No templates available yet. Check back later!'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground mb-4">
            Showing {data?.templates.length} of {data?.total} templates
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {data?.templates.map((template) => (
              <TemplateCard key={template.uuid} template={template} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TemplateCard({ template }: { template: AgentTemplate }) {
  return (
    <Card className="hover:shadow-lg transition-shadow flex flex-col">
      <CardHeader>
        <div className="flex items-start gap-3">
          {isValidImageUrl(template.icon_url) ? (
            <img
              src={template.icon_url}
              alt={template.display_name}
              className="w-12 h-12 rounded-lg object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
              <Box className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg truncate">
                {template.display_name}
              </CardTitle>
              {template.is_verified && (
                <BadgeCheck className="h-4 w-4 text-blue-500 flex-shrink-0" />
              )}
            </div>
            <CardDescription className="text-xs font-mono">
              {template.namespace}/{template.name}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
          {template.description}
        </p>
        <div className="flex flex-wrap gap-1">
          {template.is_featured && (
            <Badge variant="default" className="text-xs">
              <Star className="mr-1 h-3 w-3" />
              Featured
            </Badge>
          )}
          {template.category && (
            <Badge variant="outline" className="text-xs">
              {template.category}
            </Badge>
          )}
          {template.tags?.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              <Tag className="mr-1 h-3 w-3" />
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between items-center border-t pt-4">
        <div className="flex items-center text-sm text-muted-foreground">
          <Download className="mr-1 h-4 w-4" />
          {template.install_count} installs
        </div>
        <Button asChild>
          <Link href={`/agents/marketplace/${template.namespace}/${template.name}`}>
            View Details
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
