-- Update the scheduling workflow template to include availability checking
DELETE FROM workflow_templates WHERE category = 'scheduling';

-- Insert updated scheduling workflow with availability checking
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
  'Schedule Meeting with Availability Check',
  'scheduling',
  jsonb_build_object(
    'steps', jsonb_build_array(
      jsonb_build_object(
        'id', 'gather_attendees',
        'type', 'gather',
        'title', 'Who should attend?',
        'description', 'Need email addresses of all participants',
        'requiredData', jsonb_build_array('attendees'),
        'critical', true,
        'prompt', 'Please provide the email addresses of everyone who should attend (separated by commas):'
      ),
      jsonb_build_object(
        'id', 'gather_datetime',
        'type', 'gather',
        'title', 'When should we meet?',
        'description', 'Need specific date and time',
        'requiredData', jsonb_build_array('startTime', 'duration'),
        'critical', true,
        'prompt', 'What date and time works for you? (e.g., "Tomorrow at 2pm" or "Friday 3:30pm")'
      ),
      jsonb_build_object(
        'id', 'check_availability',
        'type', 'execute',
        'title', 'Checking calendar availability',
        'description', 'Finding available time slots',
        'action', 'check_calendar_availability',
        'dependsOn', jsonb_build_array('gather_datetime'),
        'critical', true
      ),
      jsonb_build_object(
        'id', 'select_slot',
        'type', 'decision',
        'title', 'Confirm or choose alternative',
        'description', 'Select from available slots if original time is busy',
        'dependsOn', jsonb_build_array('check_availability'),
        'critical', true,
        'prompt', 'The time slot is available! Shall I book it, or would you prefer a different time?'
      ),
      jsonb_build_object(
        'id', 'gather_details',
        'type', 'gather',
        'title', 'Additional details',
        'description', 'Optional meeting details',
        'optionalData', jsonb_build_array('description', 'location'),
        'critical', false,
        'dependsOn', jsonb_build_array('select_slot'),
        'prompt', 'Any agenda or location details? (optional - press Enter to skip)'
      ),
      jsonb_build_object(
        'id', 'confirm_booking',
        'type', 'confirm',
        'title', 'Review meeting details',
        'description', 'Confirm before sending invites',
        'dependsOn', jsonb_build_array('gather_attendees', 'select_slot', 'gather_details'),
        'critical', true,
        'summary_template', 'Meeting: {title}\nWith: {attendees}\nWhen: {startTime}\nDuration: {duration} minutes\nLocation: {location}'
      ),
      jsonb_build_object(
        'id', 'book_meeting',
        'type', 'execute',
        'title', 'Creating calendar event',
        'description', 'Book the meeting and send invites',
        'action', 'book_calendar_meeting',
        'dependsOn', jsonb_build_array('confirm_booking'),
        'critical', true,
        'retryOnFailure', true
      ),
      jsonb_build_object(
        'id', 'send_confirmation',
        'type', 'notify',
        'title', 'Meeting booked!',
        'description', 'Confirmation sent to all attendees',
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
);