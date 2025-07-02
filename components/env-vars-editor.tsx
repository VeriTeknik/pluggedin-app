'use client';

import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface EnvVarsEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

interface EnvVar {
  key: string;
  value: string;
}

export function EnvVarsEditor({ value, onChange, className, placeholder }: EnvVarsEditorProps) {
  const { t } = useTranslation();
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  // Parse the textarea format into individual env vars
  useEffect(() => {
    if (!value) {
      setEnvVars([]);
      return;
    }

    const vars: EnvVar[] = [];
    const lines = value.split('\n');
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      // Parse KEY=VALUE format
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        vars.push({
          key: match[1].trim(),
          value: match[2].trim().replace(/^["']|["']$/g, '') // Remove quotes if present
        });
      }
    });
    
    setEnvVars(vars);
  }, [value]);

  // Convert env vars back to textarea format
  const updateValue = (vars: EnvVar[]) => {
    const text = vars
      .filter(v => v.key) // Only include vars with keys
      .map(v => `${v.key}="${v.value}"`)
      .join('\n');
    onChange(text);
  };

  const addEnvVar = () => {
    if (!newKey) return;
    
    // Check if key already exists
    const existingIndex = envVars.findIndex(v => v.key === newKey);
    if (existingIndex >= 0) {
      // Update existing
      const updated = [...envVars];
      updated[existingIndex].value = newValue;
      updateValue(updated);
    } else {
      // Add new
      const updated = [...envVars, { key: newKey, value: newValue }];
      updateValue(updated);
    }
    
    setNewKey('');
    setNewValue('');
  };

  const removeEnvVar = (index: number) => {
    const updated = envVars.filter((_, i) => i !== index);
    updateValue(updated);
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...envVars];
    updated[index][field] = value;
    updateValue(updated);
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Existing env vars with scrollable area */}
      {envVars.length > 0 && (
        <ScrollArea className="h-[300px] w-full rounded-md border bg-muted/50 p-3">
          <div className="space-y-2">
            {envVars.map((envVar, index) => (
              <div key={index} className="flex items-center gap-2 group">
                <Input
                  value={envVar.key}
                  onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                  className="font-mono text-sm flex-[2] bg-background"
                  placeholder="KEY"
                />
                <span className="text-muted-foreground">=</span>
                <Input
                  value={envVar.value}
                  onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                  className="font-mono text-sm flex-[3] bg-background"
                  placeholder="value"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeEnvVar(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Add new env var */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Add new environment variable</Label>
        <div className="flex items-center gap-2">
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addEnvVar()}
            className="font-mono text-sm flex-[2]"
            placeholder="NEW_KEY"
          />
          <span className="text-muted-foreground">=</span>
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addEnvVar()}
            className="font-mono text-sm flex-[3]"
            placeholder="value"
          />
          <Button
            type="button"
            size="icon"
            onClick={addEnvVar}
            disabled={!newKey}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Raw textarea fallback */}
      <details className="group">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
          Edit as raw text
        </summary>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full mt-2 bg-muted p-3 rounded-md font-mono text-sm min-h-[100px] border-none resize-y"
          placeholder={placeholder || "KEY1=\"value1\"\nKEY2=\"value2\""}
        />
      </details>
    </div>
  );
}