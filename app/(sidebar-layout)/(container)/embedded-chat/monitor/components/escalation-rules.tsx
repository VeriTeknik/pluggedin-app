'use client';

import { 
  AlertTriangle,
  Clock,
  Mail,
  MessageSquare,
  Plus,
  Settings,
  Trash2,
  Users
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface EscalationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: 'wait_time' | 'message_count' | 'keywords' | 'user_frustration' | 'no_agent_available';
    value: string | number;
    operator?: 'greater_than' | 'less_than' | 'equals' | 'contains';
  };
  conditions: {
    business_hours_only?: boolean;
    visitor_type?: 'all' | 'authenticated' | 'anonymous';
    priority_level?: 'low' | 'medium' | 'high' | 'urgent';
  };
  actions: {
    notify_agents: boolean;
    assign_to_specific_agent?: string;
    change_priority?: 'low' | 'medium' | 'high' | 'urgent';
    send_email: boolean;
    auto_response?: string;
  };
  created_at: Date;
}

interface EscalationRulesProps {
  chatUuid: string;
}

export function EscalationRules({ chatUuid }: EscalationRulesProps) {
  const [rules, setRules] = useState<EscalationRule[]>([
    {
      id: 'rule-1',
      name: 'Long Wait Time Alert',
      enabled: true,
      trigger: {
        type: 'wait_time',
        value: 300, // 5 minutes
        operator: 'greater_than'
      },
      conditions: {
        business_hours_only: true,
        visitor_type: 'all',
        priority_level: 'medium'
      },
      actions: {
        notify_agents: true,
        change_priority: 'high',
        send_email: true,
        auto_response: 'We apologize for the wait. An agent will be with you shortly.'
      },
      created_at: new Date()
    },
    {
      id: 'rule-2',
      name: 'Frustrated User Detection',
      enabled: true,
      trigger: {
        type: 'keywords',
        value: 'frustrated,angry,upset,terrible,awful,hate',
        operator: 'contains'
      },
      conditions: {
        visitor_type: 'all'
      },
      actions: {
        notify_agents: true,
        change_priority: 'urgent',
        send_email: true,
        auto_response: 'I understand your frustration. Let me connect you with a human agent right away.'
      },
      created_at: new Date()
    }
  ]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRule, setNewRule] = useState<Partial<EscalationRule>>({
    name: '',
    enabled: true,
    trigger: { type: 'wait_time', value: '', operator: 'greater_than' },
    conditions: { business_hours_only: false, visitor_type: 'all' },
    actions: { notify_agents: true, send_email: false }
  });

  const triggerTypes = [
    { value: 'wait_time', label: 'Wait Time (seconds)', icon: Clock },
    { value: 'message_count', label: 'Message Count', icon: MessageSquare },
    { value: 'keywords', label: 'Keywords in Messages', icon: AlertTriangle },
    { value: 'no_agent_available', label: 'No Agent Available', icon: Users },
  ];

  const priorityLevels = [
    { value: 'low', label: 'Low', color: 'bg-gray-500' },
    { value: 'medium', label: 'Medium', color: 'bg-blue-500' },
    { value: 'high', label: 'High', color: 'bg-orange-500' },
    { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
  ];

  const toggleRule = (ruleId: string) => {
    setRules(prev => prev.map(rule => 
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    ));
  };

  const deleteRule = (ruleId: string) => {
    setRules(prev => prev.filter(rule => rule.id !== ruleId));
  };

  const createRule = () => {
    if (!newRule.name || !newRule.trigger?.value) return;

    const rule: EscalationRule = {
      id: `rule-${Date.now()}`,
      name: newRule.name,
      enabled: newRule.enabled || true,
      trigger: newRule.trigger as EscalationRule['trigger'],
      conditions: newRule.conditions || {},
      actions: newRule.actions || { notify_agents: true, send_email: false },
      created_at: new Date()
    };

    setRules(prev => [...prev, rule]);
    setNewRule({
      name: '',
      enabled: true,
      trigger: { type: 'wait_time', value: '', operator: 'greater_than' },
      conditions: { business_hours_only: false, visitor_type: 'all' },
      actions: { notify_agents: true, send_email: false }
    });
    setShowCreateForm(false);
  };

  const getTriggerDescription = (rule: EscalationRule) => {
    const { trigger } = rule;
    switch (trigger.type) {
      case 'wait_time':
        return `When visitor waits longer than ${trigger.value} seconds`;
      case 'message_count':
        return `When conversation has more than ${trigger.value} messages`;
      case 'keywords':
        return `When message contains: "${trigger.value}"`;
      case 'no_agent_available':
        return 'When no agents are available';
      default:
        return 'Unknown trigger';
    }
  };

  const getActionsDescription = (rule: EscalationRule) => {
    const actions = [];
    if (rule.actions.notify_agents) actions.push('Notify agents');
    if (rule.actions.change_priority) actions.push(`Set priority to ${rule.actions.change_priority}`);
    if (rule.actions.send_email) actions.push('Send email alert');
    if (rule.actions.auto_response) actions.push('Send auto-response');
    return actions.join(', ');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Escalation Rules</h3>
          <p className="text-sm text-muted-foreground">
            Automatically escalate conversations based on conditions
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">
                {rules.filter(r => r.enabled).length}
              </p>
              <p className="text-sm text-muted-foreground">Active Rules</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">15</p>
              <p className="text-sm text-muted-foreground">Escalations Today</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">2.3m</p>
              <p className="text-sm text-muted-foreground">Avg Response Time</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Rule Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Escalation Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input
                  placeholder="Enter rule name"
                  value={newRule.name || ''}
                  onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Trigger Type</Label>
                <Select
                  value={newRule.trigger?.type || 'wait_time'}
                  onValueChange={(value) => setNewRule(prev => ({
                    ...prev,
                    trigger: { ...prev.trigger!, type: value as any }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {triggerTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Trigger Value</Label>
                <Input
                  placeholder={newRule.trigger?.type === 'keywords' ? 'Keywords (comma separated)' : 'Number'}
                  value={newRule.trigger?.value || ''}
                  onChange={(e) => setNewRule(prev => ({
                    ...prev,
                    trigger: { ...prev.trigger!, value: e.target.value }
                  }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Priority Level</Label>
                <Select
                  value={newRule.actions?.change_priority || ''}
                  onValueChange={(value) => setNewRule(prev => ({
                    ...prev,
                    actions: { ...prev.actions!, change_priority: value as any }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityLevels.map(level => (
                      <SelectItem key={level.value} value={level.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${level.color}`} />
                          {level.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Auto-response Message (Optional)</Label>
              <Textarea
                placeholder="Message to send to the visitor when this rule triggers"
                value={newRule.actions?.auto_response || ''}
                onChange={(e) => setNewRule(prev => ({
                  ...prev,
                  actions: { ...prev.actions!, auto_response: e.target.value }
                }))}
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={newRule.actions?.notify_agents || false}
                  onCheckedChange={(checked) => setNewRule(prev => ({
                    ...prev,
                    actions: { ...prev.actions!, notify_agents: checked }
                  }))}
                />
                <Label>Notify Agents</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  checked={newRule.actions?.send_email || false}
                  onCheckedChange={(checked) => setNewRule(prev => ({
                    ...prev,
                    actions: { ...prev.actions!, send_email: checked }
                  }))}
                />
                <Label>Send Email Alert</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  checked={newRule.conditions?.business_hours_only || false}
                  onCheckedChange={(checked) => setNewRule(prev => ({
                    ...prev,
                    conditions: { ...prev.conditions!, business_hours_only: checked }
                  }))}
                />
                <Label>Business Hours Only</Label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={createRule}>Create Rule</Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules List */}
      <div className="space-y-4">
        {rules.map((rule) => (
          <Card key={rule.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <h4 className="font-medium">{rule.name}</h4>
                    <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                      {rule.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                    {rule.actions.change_priority && (
                      <Badge 
                        className={priorityLevels.find(p => p.value === rule.actions.change_priority)?.color + ' text-white'}
                      >
                        {rule.actions.change_priority.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Trigger:</strong> {getTriggerDescription(rule)}</p>
                    <p><strong>Actions:</strong> {getActionsDescription(rule)}</p>
                    {rule.actions.auto_response && (
                      <p><strong>Auto-response:</strong> "{rule.actions.auto_response}"</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleRule(rule.id)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteRule(rule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => toggleRule(rule.id)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {rules.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No escalation rules configured</p>
            <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
              Create Your First Rule
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}