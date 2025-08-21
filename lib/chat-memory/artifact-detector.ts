/**
 * Tier-1 Artifact Detector
 * Language-agnostic pattern detection for emails, URLs, UUIDs, IPs, dates, money, etc.
 * Uses Unicode-aware regex patterns to support multilingual content
 */

export type ArtifactType = 
  | 'email'
  | 'url'
  | 'uuid'
  | 'ipv4'
  | 'ipv6'
  | 'date'
  | 'money'
  | 'json'
  | 'file_path'
  | 'iban'
  | 'phone';

export interface DetectedArtifact {
  type: ArtifactType;
  value: string;
  normalized?: string;
  confidence: number;
}

export interface ArtifactDetectionResult {
  hasArtifacts: boolean;
  artifacts: Partial<Record<ArtifactType, DetectedArtifact[]>>;
  rawMatches: string[];
}

/**
 * Detect emails using Unicode-aware pattern
 * Supports international domains and addresses
 */
function detectEmails(text: string): DetectedArtifact[] {
  // Unicode-aware email pattern
  const emailPattern = /\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}\b/gu;
  const matches = text.match(emailPattern) || [];
  
  return matches.map(email => ({
    type: 'email' as ArtifactType,
    value: email,
    normalized: email.toLowerCase(),
    confidence: 0.95
  }));
}

/**
 * Detect URLs using liberal pattern
 * Handles various protocols and international domains
 */
function detectURLs(text: string): DetectedArtifact[] {
  // Liberal URL pattern - matches http(s), ftp, and common URL structures
  const urlPattern = /(?:https?|ftp):\/\/[\p{L}\p{N}][\p{L}\p{N}-]*(?:\.[\p{L}\p{N}][\p{L}\p{N}-]*)+(?::\d+)?(?:\/[^\s]*)?/gu;
  const matches = text.match(urlPattern) || [];
  
  // Also try to detect URLs without protocol
  const implicitUrlPattern = /\b(?:www\.)?[\p{L}\p{N}][\p{L}\p{N}-]*(?:\.[\p{L}\p{N}][\p{L}\p{N}-]*)+(?::\d+)?(?:\/[^\s]*)?\b/gu;
  const implicitMatches = text.match(implicitUrlPattern) || [];
  
  const allUrls = [...matches];
  implicitMatches.forEach(url => {
    if (!url.startsWith('http') && !matches.some(m => m.includes(url))) {
      allUrls.push(url);
    }
  });
  
  return allUrls.map(url => {
    let normalized = url;
    if (!url.match(/^[a-z]+:\/\//i)) {
      normalized = 'https://' + url;
    }
    return {
      type: 'url' as ArtifactType,
      value: url,
      normalized,
      confidence: url.startsWith('http') ? 0.95 : 0.8
    };
  });
}

/**
 * Detect UUID v4 patterns
 */
function detectUUIDs(text: string): DetectedArtifact[] {
  const uuidPattern = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b/g;
  const matches = text.match(uuidPattern) || [];
  
  return matches.map(uuid => ({
    type: 'uuid' as ArtifactType,
    value: uuid,
    normalized: uuid.toLowerCase(),
    confidence: 1.0
  }));
}

/**
 * Detect IPv4 addresses
 */
function detectIPv4(text: string): DetectedArtifact[] {
  const ipv4Pattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const matches = text.match(ipv4Pattern) || [];
  
  return matches.map(ip => ({
    type: 'ipv4' as ArtifactType,
    value: ip,
    normalized: ip,
    confidence: 0.95
  }));
}

/**
 * Detect IPv6 addresses (simplified pattern)
 */
function detectIPv6(text: string): DetectedArtifact[] {
  // Simplified IPv6 pattern - full RFC 4291 compliance would be more complex
  const ipv6Pattern = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:)*:(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}\b/g;
  const matches = text.match(ipv6Pattern) || [];
  
  return matches.map(ip => ({
    type: 'ipv6' as ArtifactType,
    value: ip,
    normalized: ip.toLowerCase(),
    confidence: 0.9
  }));
}

/**
 * Detect dates in various formats
 * ISO-8601, common date formats, relative dates
 */
function detectDates(text: string): DetectedArtifact[] {
  const artifacts: DetectedArtifact[] = [];
  
  // ISO-8601 dates
  const isoPattern = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?)?\b/g;
  const isoMatches: string[] = text.match(isoPattern) || [];
  isoMatches.forEach(date => {
    artifacts.push({
      type: 'date' as ArtifactType,
      value: date,
      normalized: date,
      confidence: 1.0
    });
  });
  
  // Common date formats (MM/DD/YYYY, DD/MM/YYYY, MM-DD-YYYY, etc.)
  const commonPattern = /\b(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{2,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b/g;
  const commonMatches: string[] = text.match(commonPattern) || [];
  commonMatches.forEach(date => {
    if (!isoMatches.includes(date)) {
      artifacts.push({
        type: 'date' as ArtifactType,
        value: date,
        normalized: date,
        confidence: 0.8
      });
    }
  });
  
  return artifacts;
}

/**
 * Detect money amounts with various currency symbols
 * Supports international formats with different decimal/thousand separators
 */
function detectMoney(text: string): DetectedArtifact[] {
  // Unicode currency symbols and common patterns
  const moneyPattern = /(?<!\w)[\p{Sc}]?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?(?:\s?[\p{Sc}])?(?!\w)/gu;
  const matches = text.match(moneyPattern) || [];
  
  // Also detect common currency codes with amounts
  const currencyCodePattern = /\b(?:USD|EUR|GBP|JPY|CNY|TRY|INR)\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\b/g;
  const currencyMatches = text.match(currencyCodePattern) || [];
  
  const allMoney = [...matches, ...currencyMatches];
  const unique = Array.from(new Set(allMoney));
  
  return unique.map(money => ({
    type: 'money' as ArtifactType,
    value: money,
    normalized: money.replace(/,/g, '').replace(/\s+/g, ' ').trim(),
    confidence: 0.85
  }));
}

/**
 * Detect JSON blocks
 */
function detectJSON(text: string): DetectedArtifact[] {
  const artifacts: DetectedArtifact[] = [];
  
  // Try to find JSON-like structures
  const jsonPattern = /\{[^{}]*\}|\[[^\[\]]*\]/g;
  const matches = text.match(jsonPattern) || [];
  
  matches.forEach(potential => {
    try {
      const parsed = JSON.parse(potential);
      if (typeof parsed === 'object' && parsed !== null) {
        artifacts.push({
          type: 'json' as ArtifactType,
          value: potential,
          normalized: JSON.stringify(parsed),
          confidence: 1.0
        });
      }
    } catch {
      // Not valid JSON, skip
    }
  });
  
  return artifacts;
}

/**
 * Detect file paths (POSIX and Windows)
 */
function detectFilePaths(text: string): DetectedArtifact[] {
  const artifacts: DetectedArtifact[] = [];
  
  // POSIX paths
  const posixPattern = /(?:\/[\p{L}\p{N}_.-]+)+(?:\/[\p{L}\p{N}_.-]+)*\/?/gu;
  const posixMatches = text.match(posixPattern) || [];
  
  // Windows paths
  const windowsPattern = /[A-Za-z]:\\(?:[^\\\/:*?"<>|\r\n]+\\)*[^\\\/:*?"<>|\r\n]*/g;
  const windowsMatches = text.match(windowsPattern) || [];
  
  [...posixMatches, ...windowsMatches].forEach(path => {
    // Filter out likely false positives (single segment paths, very short paths)
    if (path.length > 5 && (path.includes('/') || path.includes('\\'))) {
      artifacts.push({
        type: 'file_path' as ArtifactType,
        value: path,
        normalized: path,
        confidence: 0.7
      });
    }
  });
  
  return artifacts;
}

/**
 * Detect IBAN (International Bank Account Numbers)
 * Focused on TR and EU formats
 */
function detectIBAN(text: string): DetectedArtifact[] {
  // Basic IBAN pattern - country code + check digits + account identifier
  const ibanPattern = /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g;
  const matches = text.match(ibanPattern) || [];
  
  return matches.map(iban => ({
    type: 'iban' as ArtifactType,
    value: iban,
    normalized: iban.replace(/\s+/g, ''),
    confidence: 0.85
  }));
}

/**
 * Detect phone numbers (international formats)
 * Very basic pattern - comprehensive phone detection would require per-country rules
 */
function detectPhoneNumbers(text: string): DetectedArtifact[] {
  // International format with optional country code
  // More strict pattern to avoid false positives with dates
  const phonePattern = /(?:\+\d{1,3}[\s\-]?)?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{0,4}\b/g;
  const matches = text.match(phonePattern) || [];
  
  return matches
    .filter(phone => {
      // Filter out likely false positives
      const digits = phone.replace(/\D/g, '');
      // Must have at least 7 digits and not look like a date (YYYYMMDD = 8 digits starting with 19 or 20)
      if (digits.length < 7 || digits.length > 15) return false;
      if (digits.length === 8 && (digits.startsWith('19') || digits.startsWith('20'))) return false;
      // Must have at least one separator or country code to be considered a phone
      return phone.includes('+') || phone.includes('(') || phone.includes('-') || phone.includes(' ');
    })
    .map(phone => ({
      type: 'phone' as ArtifactType,
      value: phone,
      normalized: phone.replace(/\D/g, ''),
      confidence: 0.7
    }));
}

/**
 * Main artifact detection function
 * Runs all detectors and aggregates results
 */
export function detectArtifacts(text: string): ArtifactDetectionResult {
  const artifacts: Partial<Record<ArtifactType, DetectedArtifact[]>> = {};
  const rawMatches: string[] = [];
  
  // Run all detectors
  const emailArtifacts = detectEmails(text);
  if (emailArtifacts.length > 0) {
    artifacts.email = emailArtifacts;
    rawMatches.push(...emailArtifacts.map(a => a.value));
  }
  
  const urlArtifacts = detectURLs(text);
  if (urlArtifacts.length > 0) {
    artifacts.url = urlArtifacts;
    rawMatches.push(...urlArtifacts.map(a => a.value));
  }
  
  const uuidArtifacts = detectUUIDs(text);
  if (uuidArtifacts.length > 0) {
    artifacts.uuid = uuidArtifacts;
    rawMatches.push(...uuidArtifacts.map(a => a.value));
  }
  
  const ipv4Artifacts = detectIPv4(text);
  if (ipv4Artifacts.length > 0) {
    artifacts.ipv4 = ipv4Artifacts;
    rawMatches.push(...ipv4Artifacts.map(a => a.value));
  }
  
  const ipv6Artifacts = detectIPv6(text);
  if (ipv6Artifacts.length > 0) {
    artifacts.ipv6 = ipv6Artifacts;
    rawMatches.push(...ipv6Artifacts.map(a => a.value));
  }
  
  const dateArtifacts = detectDates(text);
  if (dateArtifacts.length > 0) {
    artifacts.date = dateArtifacts;
    rawMatches.push(...dateArtifacts.map(a => a.value));
  }
  
  const moneyArtifacts = detectMoney(text);
  if (moneyArtifacts.length > 0) {
    artifacts.money = moneyArtifacts;
    rawMatches.push(...moneyArtifacts.map(a => a.value));
  }
  
  const jsonArtifacts = detectJSON(text);
  if (jsonArtifacts.length > 0) {
    artifacts.json = jsonArtifacts;
    rawMatches.push(...jsonArtifacts.map(a => a.value));
  }
  
  const filePathArtifacts = detectFilePaths(text);
  if (filePathArtifacts.length > 0) {
    artifacts.file_path = filePathArtifacts;
    rawMatches.push(...filePathArtifacts.map(a => a.value));
  }
  
  const ibanArtifacts = detectIBAN(text);
  if (ibanArtifacts.length > 0) {
    artifacts.iban = ibanArtifacts;
    rawMatches.push(...ibanArtifacts.map(a => a.value));
  }
  
  const phoneArtifacts = detectPhoneNumbers(text);
  if (phoneArtifacts.length > 0) {
    artifacts.phone = phoneArtifacts;
    rawMatches.push(...phoneArtifacts.map(a => a.value));
  }
  
  return {
    hasArtifacts: Object.keys(artifacts).length > 0,
    artifacts,
    rawMatches: Array.from(new Set(rawMatches))
  };
}

/**
 * Check if tool output contains valuable artifacts
 * Tool outputs with IDs, URLs, or structured data bypass the gate
 */
export function detectToolArtifacts(toolOutput: any): ArtifactDetectionResult {
  let text = '';
  
  // Convert tool output to text for detection
  if (typeof toolOutput === 'string') {
    text = toolOutput;
  } else if (typeof toolOutput === 'object' && toolOutput !== null) {
    // Look for common fields that contain artifacts
    const valuableFields = ['id', 'uuid', 'url', 'email', 'uri', 'path', 'file', 
                           'ticket', 'event_id', 'channel', 'host', 'address'];
    
    for (const field of valuableFields) {
      if (toolOutput[field]) {
        text += ' ' + String(toolOutput[field]);
      }
    }
    
    // Also stringify the whole object for comprehensive detection
    try {
      text += ' ' + JSON.stringify(toolOutput);
    } catch {
      // Ignore circular reference errors
    }
  }
  
  return detectArtifacts(text);
}

/**
 * Determine if artifacts contain PII (Personally Identifiable Information)
 */
export function containsPII(artifacts: Partial<Record<ArtifactType, DetectedArtifact[]>>): boolean {
  // Only email and phone are considered PII
  // IBAN is financial data but not directly PII
  return !!(artifacts.email?.length || artifacts.phone?.length);
}

/**
 * Extract the most valuable artifact from detection results
 * Used for determining the primary memory item
 */
export function getMostValuableArtifact(artifacts: Partial<Record<ArtifactType, DetectedArtifact[]>>): DetectedArtifact | null {
  // Priority order for artifact types
  const priority: ArtifactType[] = ['email', 'uuid', 'url', 'iban', 'phone', 'ipv4', 'date', 'money', 'json', 'file_path'];
  
  for (const type of priority) {
    const typeArtifacts = artifacts[type];
    if (typeArtifacts && typeArtifacts.length > 0) {
      // Return the artifact with highest confidence
      return typeArtifacts.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
    }
  }
  
  return null;
}