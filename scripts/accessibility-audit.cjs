#!/usr/bin/env node

/**
 * Accessibility Audit Script
 * Runs automated accessibility checks on components
 */

const fs = require('fs').promises;
const path = require('path');

const COMPONENTS_TO_CHECK = [
  'components/ui/animated-metric.tsx',
  'components/ui/glow-card.tsx',
  'components/ui/growth-badge.tsx',
  'components/ui/error-boundary.tsx',
  'components/landing-sections/hero-enterprise.tsx',
  'components/landing-sections/trust-indicators.tsx',
  'components/landing-sections/particle-background.tsx'
];

const ACCESSIBILITY_CHECKS = {
  aria: {
    patterns: [
      { regex: /<(?!.*aria-)/gi, message: 'Interactive elements should have ARIA labels' },
      { regex: /role=["'](?!button|link|navigation|main|banner|contentinfo)/gi, message: 'Check ARIA role usage' }
    ]
  },
  semantics: {
    patterns: [
      { regex: /<div.*onClick/gi, message: 'Use semantic button/link instead of div with onClick' },
      { regex: /<span.*onClick/gi, message: 'Use semantic button/link instead of span with onClick' }
    ]
  },
  alt: {
    patterns: [
      { regex: /<img(?!.*alt=)/gi, message: 'Images must have alt text' },
      { regex: /<Image(?!.*alt=)/gi, message: 'Next/Image components must have alt text' }
    ]
  },
  contrast: {
    patterns: [
      { regex: /text-(gray|muted)-(300|400)/gi, message: 'Check color contrast for light text' },
      { regex: /opacity-(30|40|50)/gi, message: 'Check contrast with reduced opacity' }
    ]
  },
  keyboard: {
    patterns: [
      { regex: /onMouse(?!.*onKey)/gi, message: 'Mouse events should have keyboard equivalents' },
      { regex: /tabIndex=["']-1/gi, message: 'Avoid removing elements from tab order' }
    ]
  },
  motion: {
    patterns: [
      { regex: /animate-/gi, message: 'Animations should respect prefers-reduced-motion' },
      { regex: /transition/gi, message: 'Transitions should respect prefers-reduced-motion' }
    ]
  }
};

async function checkFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const issues = [];

    for (const [category, { patterns }] of Object.entries(ACCESSIBILITY_CHECKS)) {
      for (const { regex, message } of patterns) {
        const matches = content.match(regex);
        if (matches) {
          issues.push({
            category,
            message,
            count: matches.length,
            examples: matches.slice(0, 3)
          });
        }
      }
    }

    // Check for accessibility hooks
    const hasReducedMotion = content.includes('prefers-reduced-motion');
    const hasAriaLabels = content.includes('aria-label') || content.includes('aria-describedby');
    const hasScreenReaderText = content.includes('sr-only') || content.includes('visually-hidden');

    return {
      file: filePath,
      issues,
      features: {
        reducedMotion: hasReducedMotion,
        ariaLabels: hasAriaLabels,
        screenReaderText: hasScreenReaderText
      }
    };
  } catch (error) {
    return {
      file: filePath,
      error: error.message
    };
  }
}

async function runAudit() {
  console.log('🔍 Running Accessibility Audit...\n');

  const results = await Promise.all(
    COMPONENTS_TO_CHECK.map(file => checkFile(path.join(process.cwd(), file)))
  );

  let totalIssues = 0;
  let filesWithIssues = 0;

  console.log('📊 Audit Results:\n');
  console.log('=' .repeat(80));

  for (const result of results) {
    if (result.error) {
      console.log(`❌ ${result.file}: Error - ${result.error}\n`);
      continue;
    }

    const issueCount = result.issues.length;
    totalIssues += issueCount;

    if (issueCount > 0) {
      filesWithIssues++;
      console.log(`⚠️  ${result.file} (${issueCount} potential issues)`);

      for (const issue of result.issues) {
        console.log(`   - ${issue.category}: ${issue.message} (${issue.count} instances)`);
      }
    } else {
      console.log(`✅ ${result.file} - No issues found`);
    }

    // Report positive features
    const features = [];
    if (result.features.reducedMotion) features.push('reduced-motion');
    if (result.features.ariaLabels) features.push('ARIA labels');
    if (result.features.screenReaderText) features.push('screen reader text');

    if (features.length > 0) {
      console.log(`   ✨ Features: ${features.join(', ')}`);
    }

    console.log();
  }

  console.log('=' .repeat(80));
  console.log('\n📈 Summary:');
  console.log(`   Files checked: ${results.length}`);
  console.log(`   Files with issues: ${filesWithIssues}`);
  console.log(`   Total potential issues: ${totalIssues}`);

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      filesChecked: results.length,
      filesWithIssues,
      totalIssues
    },
    results: results.filter(r => !r.error),
    recommendations: [
      'Add aria-labels to all interactive elements',
      'Ensure all animations respect prefers-reduced-motion',
      'Test with screen readers (NVDA, JAWS, VoiceOver)',
      'Check color contrast ratios (WCAG AA minimum)',
      'Ensure keyboard navigation works for all interactive elements',
      'Add skip links for keyboard users',
      'Test with browser extensions like axe DevTools'
    ]
  };

  await fs.writeFile(
    path.join(process.cwd(), 'accessibility-audit-report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log('\n📄 Full report saved to accessibility-audit-report.json');

  if (totalIssues > 0) {
    console.log('\n⚡ Quick Fixes:');
    console.log('1. Add aria-labels to interactive elements');
    console.log('2. Use semantic HTML (button, nav, main, etc.)');
    console.log('3. Check animations have reduced-motion support');
    console.log('4. Ensure sufficient color contrast');
    console.log('5. Test keyboard navigation');
  }

  process.exit(filesWithIssues > 0 ? 1 : 0);
}

// Run the audit
runAudit().catch(error => {
  console.error('Audit failed:', error);
  process.exit(1);
});