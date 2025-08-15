-- Migration: Create workflow_templates table
-- This table stores reusable workflow templates for common processes

CREATE TABLE IF NOT EXISTS workflow_templates (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  base_structure JSONB NOT NULL DEFAULT '{}',
  required_capabilities TEXT[] DEFAULT '{}',
  success_rate DECIMAL(5,2) DEFAULT 0,
  average_completion_time INTERVAL,
  optimization_history JSONB DEFAULT '[]',
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workflow_templates_category ON workflow_templates(category);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_active ON workflow_templates(is_active) WHERE is_active = true;

-- Insert default workflow templates
INSERT INTO workflow_templates (id, name, category, description, base_structure, required_capabilities)
VALUES 
  (
    'meeting_scheduler',
    'Schedule Meeting',
    'scheduling',
    'Schedule a meeting with attendees and find available time slots',
    '{
      "steps": [
        {"type": "collect_attendees", "title": "Collect Attendees", "order": 1},
        {"type": "collect_time", "title": "Collect Time Preferences", "order": 2},
        {"type": "check_availability", "title": "Check Availability", "order": 3},
        {"type": "book_meeting", "title": "Book Meeting", "order": 4},
        {"type": "send_invites", "title": "Send Invitations", "order": 5}
      ],
      "required_fields": ["title", "attendees", "startTime", "endTime"],
      "optional_fields": ["description", "location", "recurrence"]
    }',
    ARRAY['schedule_meeting', 'check_availability']
  ),
  (
    'support_ticket',
    'Create Support Ticket',
    'support',
    'Create and track a support ticket',
    '{
      "steps": [
        {"type": "collect_issue", "title": "Describe Issue", "order": 1},
        {"type": "collect_priority", "title": "Set Priority", "order": 2},
        {"type": "collect_contact", "title": "Collect Contact Info", "order": 3},
        {"type": "create_ticket", "title": "Create Ticket", "order": 4},
        {"type": "notify_support", "title": "Notify Support Team", "order": 5}
      ],
      "required_fields": ["title", "description", "priority", "userEmail"],
      "optional_fields": ["category", "attachments", "urgency"]
    }',
    ARRAY['create_ticket']
  ),
  (
    'lead_capture',
    'Capture Lead',
    'sales',
    'Capture and qualify a new sales lead',
    '{
      "steps": [
        {"type": "collect_contact", "title": "Collect Contact Info", "order": 1},
        {"type": "collect_company", "title": "Company Information", "order": 2},
        {"type": "qualify_lead", "title": "Qualify Lead", "order": 3},
        {"type": "create_lead", "title": "Create Lead Record", "order": 4},
        {"type": "assign_lead", "title": "Assign to Sales Rep", "order": 5}
      ],
      "required_fields": ["firstName", "lastName", "email", "company"],
      "optional_fields": ["phone", "title", "source", "notes", "budget"]
    }',
    ARRAY['create_lead']
  ),
  (
    'email_campaign',
    'Send Email Campaign',
    'communication',
    'Send an email to one or more recipients',
    '{
      "steps": [
        {"type": "collect_recipients", "title": "Collect Recipients", "order": 1},
        {"type": "compose_email", "title": "Compose Email", "order": 2},
        {"type": "review_email", "title": "Review Content", "order": 3},
        {"type": "send_email", "title": "Send Email", "order": 4}
      ],
      "required_fields": ["to", "subject", "message"],
      "optional_fields": ["cc", "bcc", "attachments", "schedule"]
    }',
    ARRAY['send_email']
  )
ON CONFLICT (id) DO UPDATE SET
  updated_at = NOW();

-- Add comments
COMMENT ON TABLE workflow_templates IS 'Stores reusable workflow templates for common business processes';
COMMENT ON COLUMN workflow_templates.id IS 'Unique identifier for the template';
COMMENT ON COLUMN workflow_templates.category IS 'Category of workflow (scheduling, support, sales, etc.)';
COMMENT ON COLUMN workflow_templates.base_structure IS 'JSON structure defining the workflow steps and requirements';
COMMENT ON COLUMN workflow_templates.required_capabilities IS 'Array of capability IDs required to execute this workflow';
COMMENT ON COLUMN workflow_templates.success_rate IS 'Historical success rate of this workflow template';
COMMENT ON COLUMN workflow_templates.average_completion_time IS 'Average time to complete this workflow';
COMMENT ON COLUMN workflow_templates.optimization_history IS 'History of optimizations and improvements made to the template';