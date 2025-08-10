import { describe, it, expect } from 'vitest';
import { 
  detectArtifacts, 
  detectToolArtifacts, 
  containsPII,
  getMostValuableArtifact,
  type DetectedArtifact 
} from '../artifact-detector';

describe('Artifact Detector', () => {
  describe('Email Detection', () => {
    it('should detect standard emails', () => {
      const text = 'Contact me at john.doe@example.com for more info';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.email).toBeDefined();
      expect(result.artifacts.email![0].value).toBe('john.doe@example.com');
      expect(result.artifacts.email![0].normalized).toBe('john.doe@example.com');
    });
    
    it('should detect international emails', () => {
      const text = 'メールはyamada@nihon.jp です';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.email).toBeDefined();
    });
    
    it('should detect Turkish emails', () => {
      const text = 'E-postam çağrı@şirket.com.tr';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.email).toBeDefined();
    });
  });
  
  describe('URL Detection', () => {
    it('should detect URLs with protocol', () => {
      const text = 'Visit https://www.example.com/path?query=1';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.url).toBeDefined();
      expect(result.artifacts.url![0].value).toBe('https://www.example.com/path?query=1');
    });
    
    it('should detect URLs without protocol', () => {
      const text = 'Check out www.example.com for details';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.url).toBeDefined();
      expect(result.artifacts.url![0].normalized).toBe('https://www.example.com');
    });
    
    it('should detect international domain URLs', () => {
      const text = 'サイト: https://日本.jp/ページ';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.url).toBeDefined();
    });
  });
  
  describe('UUID Detection', () => {
    it('should detect UUID v4', () => {
      const text = 'The ID is 550e8400-e29b-41d4-a716-446655440000';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.uuid).toBeDefined();
      expect(result.artifacts.uuid![0].value).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
    
    it('should not detect invalid UUIDs', () => {
      const text = 'Invalid: 550e8400-xxxx-41d4-a716-446655440000';
      const result = detectArtifacts(text);
      
      expect(result.artifacts.uuid).toBeUndefined();
    });
  });
  
  describe('IP Address Detection', () => {
    it('should detect IPv4 addresses', () => {
      const text = 'Server at 192.168.1.1 is running';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.ipv4).toBeDefined();
      expect(result.artifacts.ipv4![0].value).toBe('192.168.1.1');
    });
    
    it('should detect IPv6 addresses', () => {
      const text = 'IPv6: 2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.ipv6).toBeDefined();
    });
  });
  
  describe('Date Detection', () => {
    it('should detect ISO-8601 dates', () => {
      const text = 'Meeting on 2024-03-15T10:30:00Z';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.date).toBeDefined();
      expect(result.artifacts.date![0].value).toBe('2024-03-15T10:30:00Z');
      expect(result.artifacts.date![0].confidence).toBe(1.0);
    });
    
    it('should detect common date formats', () => {
      const text = 'Due date: 03/15/2024 or 15-03-2024';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.date).toBeDefined();
      expect(result.artifacts.date!.length).toBeGreaterThan(0);
    });
  });
  
  describe('Money Detection', () => {
    it('should detect USD amounts', () => {
      const text = 'Total: $1,234.56';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.money).toBeDefined();
      expect(result.artifacts.money![0].normalized).toBe('$1234.56');
    });
    
    it('should detect EUR amounts', () => {
      const text = 'Price: €1.234,56';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.money).toBeDefined();
    });
    
    it('should detect currency codes', () => {
      const text = 'Amount: USD 500.00';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.money).toBeDefined();
    });
  });
  
  describe('JSON Detection', () => {
    it('should detect valid JSON objects', () => {
      const text = 'Config: {"key": "value", "number": 123}';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.json).toBeDefined();
      expect(result.artifacts.json![0].confidence).toBe(1.0);
    });
    
    it('should detect JSON arrays', () => {
      const text = 'Data: [1, 2, 3]';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.json).toBeDefined();
    });
  });
  
  describe('File Path Detection', () => {
    it('should detect POSIX paths', () => {
      const text = 'File at /home/user/documents/file.txt';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.file_path).toBeDefined();
    });
    
    it('should detect Windows paths', () => {
      const text = 'Located at C:\\Users\\Documents\\file.txt';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.file_path).toBeDefined();
    });
  });
  
  describe('IBAN Detection', () => {
    it('should detect Turkish IBAN', () => {
      const text = 'IBAN: TR330006100519786457841326';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.iban).toBeDefined();
    });
    
    it('should detect German IBAN', () => {
      const text = 'DE89370400440532013000';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.iban).toBeDefined();
    });
  });
  
  describe('Phone Number Detection', () => {
    it('should detect international format', () => {
      const text = 'Call +1 (555) 123-4567';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.phone).toBeDefined();
      expect(result.artifacts.phone![0].normalized).toBe('15551234567');
    });
    
    it('should detect various formats', () => {
      const text = 'Numbers: 555-1234, (555) 123-4567, +90 532 123 45 67';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.phone).toBeDefined();
      expect(result.artifacts.phone!.length).toBeGreaterThan(0);
    });
  });
  
  describe('Tool Artifact Detection', () => {
    it('should detect artifacts in tool output objects', () => {
      const toolOutput = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@example.com',
        url: 'https://example.com/resource',
        event_id: 'evt_123456'
      };
      
      const result = detectToolArtifacts(toolOutput);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.uuid).toBeDefined();
      expect(result.artifacts.email).toBeDefined();
      expect(result.artifacts.url).toBeDefined();
    });
    
    it('should handle string tool outputs', () => {
      const toolOutput = 'Created ticket #12345 at https://support.example.com';
      const result = detectToolArtifacts(toolOutput);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.url).toBeDefined();
    });
  });
  
  describe('PII Detection', () => {
    it('should identify PII in artifacts', () => {
      const text = 'Email: user@example.com, Phone: +1-555-1234';
      const result = detectArtifacts(text);
      
      expect(containsPII(result.artifacts)).toBe(true);
    });
    
    it('should not flag non-PII as PII', () => {
      const text = 'URL: https://example.com, Date: 2024-03-15';
      const result = detectArtifacts(text);
      
      expect(containsPII(result.artifacts)).toBe(false);
    });
  });
  
  describe('Most Valuable Artifact', () => {
    it('should prioritize email over other artifacts', () => {
      const text = 'Contact: user@example.com, Date: 2024-03-15, Path: /home/user';
      const result = detectArtifacts(text);
      const mostValuable = getMostValuableArtifact(result.artifacts);
      
      expect(mostValuable).toBeDefined();
      expect(mostValuable!.type).toBe('email');
    });
    
    it('should prioritize UUID when no email', () => {
      const text = 'ID: 550e8400-e29b-41d4-a716-446655440000, Date: 2024-03-15';
      const result = detectArtifacts(text);
      const mostValuable = getMostValuableArtifact(result.artifacts);
      
      expect(mostValuable).toBeDefined();
      expect(mostValuable!.type).toBe('uuid');
    });
  });
  
  describe('Multilingual Support', () => {
    it('should handle Chinese text with artifacts', () => {
      const text = '我的邮箱是 zhang@公司.cn，网站是 https://中文.cn';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.email).toBeDefined();
      expect(result.artifacts.url).toBeDefined();
    });
    
    it('should handle Japanese text with artifacts', () => {
      const text = 'メール: tanaka@会社.jp、サイト: https://日本.jp/ページ';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
    });
    
    it('should handle Hindi text with artifacts', () => {
      const text = 'ईमेल: raj@company.in पर संपर्क करें';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
    });
    
    it('should handle Turkish text with artifacts', () => {
      const text = 'E-posta: çağrı@şirket.com.tr, Telefon: +90 532 123 45 67';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.email).toBeDefined();
      expect(result.artifacts.phone).toBeDefined();
    });
    
    it('should handle Dutch text with artifacts', () => {
      const text = 'E-mail: jan@bedrijf.nl, Website: https://nederlands.nl';
      const result = detectArtifacts(text);
      
      expect(result.hasArtifacts).toBe(true);
      expect(result.artifacts.email).toBeDefined();
      expect(result.artifacts.url).toBeDefined();
    });
  });
});