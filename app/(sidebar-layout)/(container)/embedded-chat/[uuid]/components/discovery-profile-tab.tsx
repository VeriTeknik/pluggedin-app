'use client';

import { 
  Brain,
  Briefcase,
  Globe, 
  Hash,
  MapPin,
  Sparkles,
  Target} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { updateEmbeddedChatConfig } from '@/app/actions/embedded-chat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { EmbeddedChat } from '@/types/embedded-chat';

interface DiscoveryProfileTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

// Category options
const CATEGORIES = [
  { value: 'technology', label: 'Technology' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'finance', label: 'Finance' },
  { value: 'retail', label: 'Retail' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'travel', label: 'Travel' },
  { value: 'realestate', label: 'Real Estate' },
  { value: 'legal', label: 'Legal' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
];

// Company size options
const COMPANY_SIZES = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

// Response time options
const RESPONSE_TIMES = [
  { value: 'instant', label: 'Instant' },
  { value: '1-5min', label: '1-5 minutes' },
  { value: '5-15min', label: '5-15 minutes' },
  { value: '15-30min', label: '15-30 minutes' },
  { value: '30-60min', label: '30-60 minutes' },
  { value: '1-2hours', label: '1-2 hours' },
  { value: '2-4hours', label: '2-4 hours' },
  { value: '4-8hours', label: '4-8 hours' },
  { value: '24hours', label: 'Within 24 hours' },
];

// Pricing model options
const PRICING_MODELS = [
  { value: 'free', label: 'Free' },
  { value: 'freemium', label: 'Freemium' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'pay-per-use', label: 'Pay Per Use' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'custom', label: 'Custom Pricing' },
];

// Interaction style options
const INTERACTION_STYLES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
  { value: 'formal', label: 'Formal' },
  { value: 'technical', label: 'Technical' },
  { value: 'educational', label: 'Educational' },
  { value: 'supportive', label: 'Supportive' },
];

// Common languages
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'zh', label: 'Chinese' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'tr', label: 'Turkish' },
  { value: 'nl', label: 'Dutch' },
];

export function DiscoveryProfileTab({ chat, chatUuid }: DiscoveryProfileTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [showInfo, setShowInfo] = useState(true);

  // Form state
  const [formData, setFormData] = useState({
    // Location & Availability
    location: chat.location || '',
    timezone: chat.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    response_time: chat.response_time || 'instant',
    language: chat.language || 'en',
    
    // Professional Information
    profession: chat.profession || '',
    expertise: chat.expertise || [],
    industry: chat.industry || '',
    company_name: chat.company_name || '',
    company_size: chat.company_size || '',
    
    // Classification
    category: chat.category || '',
    subcategory: chat.subcategory || '',
    keywords: chat.keywords || [],
    use_cases: chat.use_cases || [],
    
    // Target Audience
    target_audience: chat.target_audience || [],
    pricing_model: chat.pricing_model || 'free',
    
    // AI Optimization
    semantic_tags: chat.semantic_tags || [],
    capabilities_summary: chat.capabilities_summary || '',
    personality_traits: chat.personality_traits || [],
    interaction_style: chat.interaction_style || 'professional',
  });

  // Tag input states
  const [expertiseInput, setExpertiseInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [useCaseInput, setUseCaseInput] = useState('');
  const [audienceInput, setAudienceInput] = useState('');
  const [semanticTagInput, setSemanticTagInput] = useState('');
  const [personalityInput, setPersonalityInput] = useState('');

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await updateEmbeddedChatConfig(chatUuid, formData);
      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('embeddedChat.discovery.saveSuccess', 'Discovery profile updated successfully'),
        });
      } else {
        throw new Error(result.error || 'Failed to save');
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to save discovery profile',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addTag = (field: keyof typeof formData, input: string, setInput: (val: string) => void) => {
    if (input.trim() && !formData[field]?.includes(input.trim())) {
      setFormData({
        ...formData,
        [field]: [...(formData[field] as string[] || []), input.trim()]
      });
      setInput('');
    }
  };

  const removeTag = (field: keyof typeof formData, tag: string) => {
    setFormData({
      ...formData,
      [field]: (formData[field] as string[]).filter(t => t !== tag)
    });
  };

  return (
    <div className="space-y-6">
      {/* Information Banner */}
      {showInfo && (
        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  {t('embeddedChat.discovery.howItWorks', 'How Discovery Works')}
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                  {t('embeddedChat.discovery.infoDescription', 
                    'The information you provide here helps users and AI models discover your assistant through multiple channels:')}
                </p>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2 mb-3">
                  <li className="flex items-start gap-2">
                    <Globe className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>{t('embeddedChat.discovery.publicProfile', 'Public Profile Page')}:</strong>{' '}
                      {t('embeddedChat.discovery.publicProfileDesc', 
                        'Your assistant will be discoverable at plugged.in/to/[username] with advanced filtering options')}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Brain className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>{t('embeddedChat.discovery.mcpServer', 'MCP Server Integration')}:</strong>{' '}
                      {t('embeddedChat.discovery.mcpServerDesc', 
                        'AI models using Plugged.in MCP can discover and recommend your assistant based on user needs')}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Target className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>{t('embeddedChat.discovery.semanticSearch', 'Semantic Search')}:</strong>{' '}
                      {t('embeddedChat.discovery.semanticSearchDesc', 
                        'Natural language queries will match your expertise, use cases, and capabilities')}
                    </span>
                  </li>
                </ul>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {t('embeddedChat.discovery.privacyNote', 
                    'Note: Your assistant must be marked as "Public" in General settings for discovery features to work.')}
                </p>
              </div>
              <button
                onClick={() => setShowInfo(false)}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
              >
                ×
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Location & Availability */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {t('embeddedChat.discovery.locationAvailability', 'Location & Availability')}
          </CardTitle>
          <CardDescription>
            {t('embeddedChat.discovery.locationAvailabilityDesc', 'Help users find you based on location and availability')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="location">
                {t('embeddedChat.discovery.location', 'Location')}
              </Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="San Francisco, USA"
              />
            </div>
            <div>
              <Label htmlFor="timezone">
                {t('embeddedChat.discovery.timezone', 'Timezone')}
              </Label>
              <Input
                id="timezone"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                placeholder="America/Los_Angeles"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="response_time">
                {t('embeddedChat.discovery.responseTime', 'Expected Response Time')}
              </Label>
              <Select
                value={formData.response_time}
                onValueChange={(value) => setFormData({ ...formData, response_time: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESPONSE_TIMES.map((time) => (
                    <SelectItem key={time.value} value={time.value}>
                      {time.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="language">
                {t('embeddedChat.discovery.primaryLanguage', 'Primary Language')}
              </Label>
              <Select
                value={formData.language}
                onValueChange={(value) => setFormData({ ...formData, language: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Professional Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            {t('embeddedChat.discovery.professionalInfo', 'Professional Information')}
          </CardTitle>
          <CardDescription>
            {t('embeddedChat.discovery.professionalInfoDesc', 'Describe your professional background and expertise')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="profession">
                {t('embeddedChat.discovery.profession', 'Profession/Role')}
              </Label>
              <Input
                id="profession"
                value={formData.profession}
                onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                placeholder="Software Engineer, Doctor, Teacher..."
              />
            </div>
            <div>
              <Label htmlFor="industry">
                {t('embeddedChat.discovery.industry', 'Industry')}
              </Label>
              <Input
                id="industry"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                placeholder="Technology, Healthcare, Education..."
              />
            </div>
          </div>

          <div>
            <Label htmlFor="expertise">
              {t('embeddedChat.discovery.expertise', 'Areas of Expertise')}
            </Label>
            <div className="flex gap-2 mb-2">
              <Input
                id="expertise"
                value={expertiseInput}
                onChange={(e) => setExpertiseInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('expertise', expertiseInput, setExpertiseInput);
                  }
                }}
                placeholder="Add expertise area..."
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addTag('expertise', expertiseInput, setExpertiseInput)}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.expertise.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => removeTag('expertise', tag)}
                >
                  {tag} ×
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="company_name">
                {t('embeddedChat.discovery.companyName', 'Company/Organization')}
              </Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <Label htmlFor="company_size">
                {t('embeddedChat.discovery.companySize', 'Company Size')}
              </Label>
              <Select
                value={formData.company_size}
                onValueChange={(value) => setFormData({ ...formData, company_size: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_SIZES.map((size) => (
                    <SelectItem key={size.value} value={size.value}>
                      {size.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Classification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            {t('embeddedChat.discovery.classification', 'Classification')}
          </CardTitle>
          <CardDescription>
            {t('embeddedChat.discovery.classificationDesc', 'Categorize your chat for better discovery')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">
                {t('embeddedChat.discovery.category', 'Category')}
              </Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="subcategory">
                {t('embeddedChat.discovery.subcategory', 'Subcategory')}
              </Label>
              <Input
                id="subcategory"
                value={formData.subcategory}
                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                placeholder="More specific category..."
              />
            </div>
          </div>

          <div>
            <Label htmlFor="keywords">
              {t('embeddedChat.discovery.keywords', 'Keywords')}
            </Label>
            <div className="flex gap-2 mb-2">
              <Input
                id="keywords"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('keywords', keywordInput, setKeywordInput);
                  }
                }}
                placeholder="Add keyword..."
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addTag('keywords', keywordInput, setKeywordInput)}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.keywords.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => removeTag('keywords', tag)}
                >
                  {tag} ×
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="use_cases">
              {t('embeddedChat.discovery.useCases', 'Use Cases')}
            </Label>
            <div className="flex gap-2 mb-2">
              <Input
                id="use_cases"
                value={useCaseInput}
                onChange={(e) => setUseCaseInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('use_cases', useCaseInput, setUseCaseInput);
                  }
                }}
                placeholder="Add use case..."
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addTag('use_cases', useCaseInput, setUseCaseInput)}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.use_cases.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => removeTag('use_cases', tag)}
                >
                  {tag} ×
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Target Audience */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {t('embeddedChat.discovery.targetAudience', 'Target Audience')}
          </CardTitle>
          <CardDescription>
            {t('embeddedChat.discovery.targetAudienceDesc', 'Define who your chat is designed to help')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="target_audience">
              {t('embeddedChat.discovery.whoIsThisFor', 'Who is this for?')}
            </Label>
            <div className="flex gap-2 mb-2">
              <Input
                id="target_audience"
                value={audienceInput}
                onChange={(e) => setAudienceInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('target_audience', audienceInput, setAudienceInput);
                  }
                }}
                placeholder="Developers, Students, Business Owners..."
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addTag('target_audience', audienceInput, setAudienceInput)}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.target_audience.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => removeTag('target_audience', tag)}
                >
                  {tag} ×
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="pricing_model">
              {t('embeddedChat.discovery.pricingModel', 'Pricing Model')}
            </Label>
            <Select
              value={formData.pricing_model}
              onValueChange={(value) => setFormData({ ...formData, pricing_model: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICING_MODELS.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* AI Optimization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            {t('embeddedChat.discovery.aiOptimization', 'AI Optimization')}
          </CardTitle>
          <CardDescription>
            {t('embeddedChat.discovery.aiOptimizationDesc', 'Help AI models better understand and match your chat')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="capabilities_summary">
              {t('embeddedChat.discovery.capabilitiesSummary', 'Capabilities Summary')}
            </Label>
            <Textarea
              id="capabilities_summary"
              value={formData.capabilities_summary}
              onChange={(e) => setFormData({ ...formData, capabilities_summary: e.target.value })}
              placeholder="Describe what your chat can do in natural language..."
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="semantic_tags">
              {t('embeddedChat.discovery.semanticTags', 'Semantic Tags')}
            </Label>
            <div className="flex gap-2 mb-2">
              <Input
                id="semantic_tags"
                value={semanticTagInput}
                onChange={(e) => setSemanticTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag('semantic_tags', semanticTagInput, setSemanticTagInput);
                  }
                }}
                placeholder="Add semantic tag..."
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addTag('semantic_tags', semanticTagInput, setSemanticTagInput)}
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.semantic_tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => removeTag('semantic_tags', tag)}
                >
                  {tag} ×
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="interaction_style">
                {t('embeddedChat.discovery.interactionStyle', 'Interaction Style')}
              </Label>
              <Select
                value={formData.interaction_style}
                onValueChange={(value) => setFormData({ ...formData, interaction_style: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERACTION_STYLES.map((style) => (
                    <SelectItem key={style.value} value={style.value}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="personality_traits">
                {t('embeddedChat.discovery.personalityTraits', 'Personality Traits')}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="personality_traits"
                  value={personalityInput}
                  onChange={(e) => setPersonalityInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag('personality_traits', personalityInput, setPersonalityInput);
                    }
                  }}
                  placeholder="Helpful, Patient..."
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addTag('personality_traits', personalityInput, setPersonalityInput)}
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {formData.personality_traits.map((trait) => (
                  <Badge
                    key={trait}
                    variant="outline"
                    className="cursor-pointer text-xs"
                    onClick={() => removeTag('personality_traits', trait)}
                  >
                    {trait} ×
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}