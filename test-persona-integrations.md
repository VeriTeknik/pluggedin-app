# Persona Integrations Test Plan

## Overview
This document outlines the test plan for the persona integrations feature, which includes:
1. Removal of From Email/Name fields from email configuration
2. Beautiful email template implementation
3. Persona capabilities as LangChain tools
4. System prompt updates for authentication

## Test Scenarios

### 1. Email Configuration Tests

#### Test 1.1: Verify From Email/Name Fields Removal
**Description**: Ensure that "From Email" and "From Name" input fields are removed from the email configuration UI.
**Steps**:
1. Navigate to the persona integrations page
2. Click on the Email integration configuration
3. Verify that "From Email" and "From Name" fields are not present
4. Verify that the email integration still works with system email

**Expected Result**: Email configuration works without requiring From Email/Name fields.

#### Test 1.2: Verify System Email Usage
**Description**: Ensure that the system email from environment variables is used for sending emails.
**Steps**:
1. Configure an email integration with a recipient
2. Send a test email
3. Check the email headers to verify the sender is the system email

**Expected Result**: Email is sent from the system email address configured in environment variables.

### 2. Beautiful Email Template Tests

#### Test 2.1: Verify Email Template Structure
**Description**: Ensure that the email template includes all required elements.
**Steps**:
1. Send a test email
2. Verify the email contains:
   - Professional header with Plugged.in branding
   - Sender information with authenticated user details
   - Message body with proper formatting
   - Footer with social links and unsubscribe option

**Expected Result**: Email contains all required elements with proper styling.

#### Test 2.2: Verify Dark Mode Support
**Description**: Ensure that the email template supports dark mode.
**Steps**:
1. Send a test email
2. View the email in a dark mode email client
3. Verify that the colors and styling adapt to dark mode

**Expected Result**: Email displays correctly in dark mode with appropriate color adjustments.

#### Test 2.3: Verify Mobile Responsiveness
**Description**: Ensure that the email template is responsive on mobile devices.
**Steps**:
1. Send a test email
2. View the email on a mobile device
3. Verify that the layout adapts to the smaller screen size

**Expected Result**: Email displays correctly on mobile devices with responsive layout.

### 3. Persona Capabilities as LangChain Tools Tests

#### Test 3.1: Verify Slack Message Tool
**Description**: Ensure that the Slack message tool works correctly.
**Steps**:
1. Configure a Slack integration for a persona
2. Enable the Slack messaging capability
3. In a chat, ask the persona to send a Slack message
4. Verify the message is sent to the configured Slack channel

**Expected Result**: Slack message is sent successfully with the correct content.

#### Test 3.2: Verify Calendar Booking Tool
**Description**: Ensure that the calendar booking tool works correctly.
**Steps**:
1. Configure a Google Calendar integration for a persona
2. Enable the calendar booking capability
3. In a chat, ask the persona to book a meeting
4. Verify the meeting is created in Google Calendar

**Expected Result**: Meeting is created successfully in Google Calendar with the correct details.

#### Test 3.3: Verify Email Sending Tool
**Description**: Ensure that the email sending tool works correctly with the beautiful template.
**Steps**:
1. Configure an email integration for a persona
2. Enable the email sending capability
3. In a chat, ask the persona to send an email
4. Verify the email is sent with the beautiful template

**Expected Result**: Email is sent successfully with the beautiful template and correct content.

#### Test 3.4: Verify CRM Lead Tool
**Description**: Ensure that the CRM lead tool works correctly.
**Steps**:
1. Configure a CRM integration for a persona
2. Enable the CRM lead capability
3. In a chat, ask the persona to create a CRM lead
4. Verify the lead is created in the CRM system

**Expected Result**: CRM lead is created successfully with the correct information.

#### Test 3.5: Verify Support Ticket Tool
**Description**: Ensure that the support ticket tool works correctly.
**Steps**:
1. Configure a support system integration for a persona
2. Enable the support ticket capability
3. In a chat, ask the persona to create a support ticket
4. Verify the ticket is created in the support system

**Expected Result**: Support ticket is created successfully with the correct details.

### 4. System Prompt and Authentication Tests

#### Test 4.1: Verify Authentication Check
**Description**: Ensure that the system checks for user authentication before using persona capabilities.
**Steps**:
1. Start a chat session without being authenticated
2. Ask the persona to perform an action that requires authentication (e.g., send an email)
3. Verify that the persona asks for the user's email and name

**Expected Result**: Persona requests user's email and name before proceeding with the action.

#### Test 4.2: Verify Authentication Flow
**Description**: Ensure that the authentication flow works correctly.
**Steps**:
1. Start a chat session without being authenticated
2. Ask the persona to perform an action that requires authentication
3. Provide your email and name when prompted
4. Verify that the persona proceeds with the action

**Expected Result**: Persona uses the provided email and name to perform the requested action.

#### Test 4.3: Verify Tool Availability
**Description**: Ensure that persona capability tools are available alongside MCP tools.
**Steps**:
1. Start a chat session with a persona that has enabled capabilities
2. Ask the persona what tools it has available
3. Verify that both MCP tools and persona capability tools are listed

**Expected Result**: Persona lists both MCP tools and persona capability tools.

### 5. Integration Tests

#### Test 5.1: End-to-End Workflow
**Description**: Test the complete workflow from configuration to execution.
**Steps**:
1. Configure a persona with multiple integrations (email, calendar, Slack)
2. Enable multiple capabilities for the persona
3. Start a chat session
4. Ask the persona to perform a complex task that involves multiple capabilities
5. Verify that all tools work together correctly

**Expected Result**: Persona successfully completes the complex task using multiple tools.

#### Test 5.2: Error Handling
**Description**: Test error handling for various failure scenarios.
**Steps**:
1. Test with invalid integration configurations
2. Test with network failures
3. Test with authentication failures
4. Verify that appropriate error messages are displayed

**Expected Result**: System handles errors gracefully and provides helpful error messages.

## Test Environment Setup

### Required Environment Variables
```
EMAIL_FROM_ADDRESS=noreply@plugged.in
EMAIL_FROM_NAME=Plugged.in
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=smtp_username
SMTP_PASS=smtp_password
```

### Required Integrations
1. Google Calendar integration
2. Slack integration
3. Email integration
4. CRM integration
5. Support system integration

## Test Data

### Sample Persona Configuration
```json
{
  "name": "Test Assistant",
  "role": "AI Assistant",
  "instructions": "Help users with their tasks using available capabilities.",
  "capabilities": [
    {
      "name": "Send Email",
      "category": "Communication",
      "description": "Send emails to users",
      "enabled": true
    },
    {
      "name": "Book Meeting",
      "category": "Calendar",
      "description": "Book meetings in Google Calendar",
      "enabled": true
    },
    {
      "name": "Send Slack Message",
      "category": "Communication",
      "description": "Send messages to Slack channels",
      "enabled": true
    }
  ],
  "integrations": {
    "communication": {
      "email": {
        "enabled": true,
        "config": {}
      },
      "slack": {
        "enabled": true,
        "config": {
          "webhookUrl": "https://hooks.slack.com/services/...",
          "channel": "#test"
        }
      }
    },
    "calendar": {
      "google": {
        "enabled": true,
        "config": {
          "clientId": "google_client_id",
          "clientSecret": "google_client_secret",
          "accessToken": "access_token",
          "refreshToken": "refresh_token"
        }
      }
    }
  }
}
```

## Expected Outcomes

### Successful Test Results
1. All persona capabilities work as expected
2. Beautiful email template is used for all emails
3. Authentication flow works correctly
4. Error handling is robust
5. Performance is acceptable

### Metrics to Measure
1. Tool execution time
2. Email delivery time
3. Authentication success rate
4. Error rate
5. User satisfaction

## Conclusion

This test plan provides comprehensive coverage of the persona integrations feature. By following these test scenarios, we can ensure that all components work together correctly and provide a seamless user experience.