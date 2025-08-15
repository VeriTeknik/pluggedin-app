-- Add initial workflow templates for common workflows
-- This ensures the WorkflowBrain can detect and create workflows

-- Insert scheduling workflow template
INSERT INTO workflow_templates (
  id,
  name,
  category,
  base_structure,
  required_capabilities,
  is_active,
  success_rate,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'Schedule Meeting',
  'scheduling',
  jsonb_build_object(
    'steps', jsonb_build_array(
      jsonb_build_object(
        'id', 'gather_attendees',
        'type', 'gather',
        'title', 'Gather attendee information',
        'description', 'Collect email addresses of meeting participants',
        'requiredData', jsonb_build_array('attendees'),
        'critical', true,
        'skip_if_known', true,
        'prerequisites', jsonb_build_array(
          jsonb_build_object(
            'field', 'attendees',
            'type', 'email',
            'required', true
          )
        )
      ),
      jsonb_build_object(
        'id', 'gather_datetime',
        'type', 'gather',
        'title', 'Determine meeting time',
        'description', 'Specify when the meeting should occur',
        'requiredData', jsonb_build_array('startTime', 'endTime'),
        'critical', true,
        'skip_if_known', true,
        'prerequisites', jsonb_build_array(
          jsonb_build_object(
            'field', 'startTime',
            'type', 'datetime',
            'required', true
          ),
          jsonb_build_object(
            'field', 'endTime',
            'type', 'datetime',
            'required', true
          )
        )
      ),
      jsonb_build_object(
        'id', 'gather_details',
        'type', 'gather',
        'title', 'Collect meeting details',
        'description', 'Optional details like location and description',
        'requiredData', jsonb_build_array(),
        'optionalData', jsonb_build_array('location', 'description'),
        'critical', false,
        'skip_if_known', true,
        'dependsOn', jsonb_build_array('gather_attendees', 'gather_datetime')
      ),
      jsonb_build_object(
        'id', 'check_availability',
        'type', 'execute',
        'title', 'Check calendar availability',
        'description', 'Find available time slots',
        'requiredData', jsonb_build_array('startTime', 'endTime'),
        'dependsOn', jsonb_build_array('gather_datetime'),
        'critical', true,
        'action', 'check_calendar_availability'
      ),
      jsonb_build_object(
        'id', 'select_slot',
        'type', 'decision',
        'title', 'Select available time slot',
        'description', 'Choose from available slots or suggest alternatives',
        'dependsOn', jsonb_build_array('check_availability'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'confirm_details',
        'type', 'confirm',
        'title', 'Confirm meeting details',
        'description', 'Review all details before booking',
        'dependsOn', jsonb_build_array('gather_attendees', 'gather_datetime', 'select_slot'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'book_meeting',
        'type', 'execute',
        'title', 'Book the meeting',
        'description', 'Create calendar event and send invites',
        'dependsOn', jsonb_build_array('confirm_details'),
        'critical', true,
        'retryOnFailure', true
      ),
      jsonb_build_object(
        'id', 'notify_success',
        'type', 'notify',
        'title', 'Send confirmation',
        'description', 'Notify about successful booking',
        'dependsOn', jsonb_build_array('book_meeting'),
        'critical', false
      )
    )
  ),
  ARRAY['calendar']::text[],
  true,
  '85.00',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- Insert support ticket workflow template
INSERT INTO workflow_templates (
  id,
  name,
  category,
  base_structure,
  required_capabilities,
  is_active,
  success_rate,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'Create Support Ticket',
  'support',
  jsonb_build_object(
    'steps', jsonb_build_array(
      jsonb_build_object(
        'id', 'gather_issue',
        'type', 'gather',
        'title', 'Describe the issue',
        'description', 'Collect details about the problem',
        'requiredData', jsonb_build_array('issue_description', 'severity'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'gather_contact',
        'type', 'gather',
        'title', 'Contact information',
        'description', 'How to reach you about this issue',
        'requiredData', jsonb_build_array('contact_email'),
        'optionalData', jsonb_build_array('phone'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'categorize',
        'type', 'decision',
        'title', 'Categorize issue',
        'description', 'Determine issue type and priority',
        'dependsOn', jsonb_build_array('gather_issue'),
        'critical', false
      ),
      jsonb_build_object(
        'id', 'create_ticket',
        'type', 'execute',
        'title', 'Create support ticket',
        'description', 'Submit the ticket to support system',
        'dependsOn', jsonb_build_array('gather_issue', 'gather_contact'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'send_confirmation',
        'type', 'notify',
        'title', 'Send confirmation',
        'description', 'Email ticket details and number',
        'dependsOn', jsonb_build_array('create_ticket'),
        'critical', false
      )
    )
  ),
  NULL,
  true,
  '90.00',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- Insert communication workflow template
INSERT INTO workflow_templates (
  id,
  name,
  category,
  base_structure,
  required_capabilities,
  is_active,
  success_rate,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'Send Team Update',
  'communication',
  jsonb_build_object(
    'steps', jsonb_build_array(
      jsonb_build_object(
        'id', 'gather_recipients',
        'type', 'gather',
        'title', 'Select recipients',
        'description', 'Who should receive this update',
        'requiredData', jsonb_build_array('recipients'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'compose_message',
        'type', 'gather',
        'title', 'Compose message',
        'description', 'Write your update message',
        'requiredData', jsonb_build_array('subject', 'message'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'review',
        'type', 'confirm',
        'title', 'Review message',
        'description', 'Check message before sending',
        'dependsOn', jsonb_build_array('gather_recipients', 'compose_message'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'send',
        'type', 'execute',
        'title', 'Send update',
        'description', 'Deliver message to recipients',
        'dependsOn', jsonb_build_array('review'),
        'critical', true
      )
    )
  ),
  ARRAY['email', 'slack']::text[],
  true,
  '95.00',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- Insert data collection workflow template
INSERT INTO workflow_templates (
  id,
  name,
  category,
  base_structure,
  required_capabilities,
  is_active,
  success_rate,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'Collect Feedback',
  'dataCollection',
  jsonb_build_object(
    'steps', jsonb_build_array(
      jsonb_build_object(
        'id', 'define_questions',
        'type', 'gather',
        'title', 'Define questions',
        'description', 'What information to collect',
        'requiredData', jsonb_build_array('questions'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'select_audience',
        'type', 'gather',
        'title', 'Select audience',
        'description', 'Who to collect feedback from',
        'requiredData', jsonb_build_array('audience'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'set_deadline',
        'type', 'gather',
        'title', 'Set deadline',
        'description', 'When responses are needed by',
        'requiredData', jsonb_build_array('deadline'),
        'critical', false
      ),
      jsonb_build_object(
        'id', 'create_form',
        'type', 'execute',
        'title', 'Create feedback form',
        'description', 'Generate the collection form',
        'dependsOn', jsonb_build_array('define_questions'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'distribute',
        'type', 'execute',
        'title', 'Distribute form',
        'description', 'Send to selected audience',
        'dependsOn', jsonb_build_array('create_form', 'select_audience'),
        'critical', true
      )
    )
  ),
  NULL,
  true,
  '88.00',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;