import Script from 'next/script';

import { PLATFORM_METRICS } from '@/lib/constants/metrics';

interface StructuredDataProps {
  type?: 'Organization' | 'WebSite' | 'Product' | 'FAQPage' | 'BreadcrumbList';
  data?: any;
}

export function StructuredData({ type = 'Organization', data }: StructuredDataProps) {
  const getOrganizationSchema = () => ({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Plugged.in',
    url: 'https://plugged.in',
    logo: 'https://plugged.in/logo.png',
    description: 'Plugged.in is the enterprise Model Context Protocol (MCP) platform for seamless AI integration. Connect 7,000+ tools and 1,500+ MCP servers with SOC 2 certified security.',
    foundingDate: '2024',
    license: 'https://plugged.in/terms',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'US'
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: 'support@plugged.in',
      availableLanguage: ['en', 'tr', 'zh', 'hi', 'ja', 'nl']
    },
    sameAs: [
      'https://github.com/VeriTeknik/pluggedin-app',
      'https://twitter.com/pluggedin',
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: PLATFORM_METRICS.DEVELOPERS.value.toString(),
      bestRating: '5',
      worstRating: '1'
    }
  });

  const getWebSiteSchema = () => ({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Plugged.in',
    url: 'https://plugged.in',
    license: 'https://plugged.in/terms',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://plugged.in/search?q={search_term_string}'
      },
      'query-input': 'required name=search_term_string'
    }
  });

  const getProductSchema = () => ({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Plugged.in MCP Platform',
    operatingSystem: 'Web',
    applicationCategory: 'DeveloperApplication',
    license: 'https://plugged.in/terms',
    offers: [
      {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        name: 'Free Plan',
        description: 'Start with essential MCP integration features including 100+ tools, basic server connections, and community support for individual developers.'
      },
      {
        '@type': 'Offer',
        price: '12',
        priceCurrency: 'USD',
        name: 'Pro Plan',
        description: 'Advanced features for professionals including unlimited tools, priority support, custom configurations, and enhanced security features.',
        priceValidUntil: '2025-12-31'
      },
      {
        '@type': 'Offer',
        price: '49',
        priceCurrency: 'USD',
        name: 'Enterprise Plan',
        description: 'Complete enterprise solution with dedicated support, SOC 2 compliance, custom integrations, SSO, and unlimited team members.'
      }
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      ratingCount: PLATFORM_METRICS.DEVELOPERS.value,
      reviewCount: Math.floor(PLATFORM_METRICS.DEVELOPERS.value * 0.8)
    },
    features: [
      `${PLATFORM_METRICS.TOOLS.value}+ Verified Tools`,
      `${PLATFORM_METRICS.SERVERS.value}+ MCP Servers`,
      'Enterprise Security (SOC 2, ISO 27001)',
      'Multi-language Support',
      'AI Document Generation',
      'Real-time Collaboration'
    ],
    screenshot: 'https://plugged.in/screenshots/dashboard.png',
    softwareVersion: process.env.NEXT_PUBLIC_APP_VERSION || '2.10.3',
    datePublished: '2024-01-01',
    dateModified: new Date().toISOString().split('T')[0]
  });

  const getFAQSchema = () => ({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is Plugged.in?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Plugged.in is an enterprise Model Context Protocol (MCP) platform that enables seamless AI integration with over 7,000+ verified tools and 1,500+ MCP servers.'
        }
      },
      {
        '@type': 'Question',
        name: 'How many tools are available on Plugged.in?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Plugged.in offers ${PLATFORM_METRICS.TOOLS.value}+ pre-verified tools with encrypted keys for secure integration.`
        }
      },
      {
        '@type': 'Question',
        name: 'Is Plugged.in secure for enterprise use?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, Plugged.in is SOC 2 Type II certified, ISO 27001 compliant, GDPR compliant, and HIPAA ready, ensuring enterprise-grade security.'
        }
      },
      {
        '@type': 'Question',
        name: 'What is the uptime guarantee?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Plugged.in offers a ${PLATFORM_METRICS.UPTIME.value}% uptime SLA with response times under ${PLATFORM_METRICS.RESPONSE_TIME.value}ms.`
        }
      }
    ]
  });

  const getBreadcrumbSchema = (items: Array<{ name: string; url: string }>) => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  });

  const getMetricsSchema = () => ({
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Plugged.in Platform Metrics',
    description: 'Real-time platform performance and usage metrics for Plugged.in MCP platform, tracking tool availability, server connections, developer activity, and system reliability.',
    license: 'https://plugged.in/terms',
    creator: {
      '@type': 'Organization',
      name: 'Plugged.in'
    },
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: 'https://plugged.in/api/metrics'
      }
    ],
    variableMeasured: [
      {
        '@type': 'PropertyValue',
        name: 'Verified Tools',
        value: PLATFORM_METRICS.TOOLS.value,
        unitText: 'tools'
      },
      {
        '@type': 'PropertyValue',
        name: 'MCP Servers',
        value: PLATFORM_METRICS.SERVERS.value,
        unitText: 'servers'
      },
      {
        '@type': 'PropertyValue',
        name: 'Active Developers',
        value: PLATFORM_METRICS.DEVELOPERS.value,
        unitText: 'developers'
      },
      {
        '@type': 'PropertyValue',
        name: 'Monthly API Calls',
        value: PLATFORM_METRICS.API_CALLS.value,
        unitText: 'calls'
      },
      {
        '@type': 'PropertyValue',
        name: 'Uptime',
        value: PLATFORM_METRICS.UPTIME.value,
        unitText: 'percent'
      }
    ]
  });

  let schema;
  switch (type) {
    case 'Organization':
      schema = getOrganizationSchema();
      break;
    case 'WebSite':
      schema = getWebSiteSchema();
      break;
    case 'Product':
      schema = getProductSchema();
      break;
    case 'FAQPage':
      schema = getFAQSchema();
      break;
    case 'BreadcrumbList':
      schema = getBreadcrumbSchema(data?.items || []);
      break;
    default:
      schema = { ...getOrganizationSchema(), ...data };
  }

  // Add metrics as additional schema
  const schemas = [schema];
  if (type === 'Organization' || type === 'WebSite') {
    schemas.push(getMetricsSchema());
  }

  return (
    <>
      {schemas.map((s, index) => (
        <Script
          key={`structured-data-${type}-${index}`}
          id={`structured-data-${type}-${index}`}
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(s) }}
        />
      ))}
    </>
  );
}