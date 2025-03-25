# OAuth Account Linking Test Plan

This document outlines a comprehensive test plan for the OAuth account linking functionality in our authentication system.

## Overview

The application allows users to sign in through multiple methods:
- Email/password credentials
- GitHub OAuth
- Google OAuth
- Email magic links

Our implementation includes OAuth account linking for existing users, which means that if a user signs in with an OAuth provider using an email address that already exists in our database, we link the OAuth account to the existing user record.

## Test Cases

### 1. Credential Login Flow

**Scenario 1.1:** Basic credential login
- **Given:** A user with verified email exists in the database
- **When:** The user attempts to login with correct credentials
- **Then:** Login should succeed
- **Verification:** The signIn callback should return true

**Scenario 1.2:** Credential login with unverified email
- **Given:** A user with unverified email exists in the database
- **When:** The user attempts to login with correct credentials
- **Then:** Login should fail with "Email not verified" error
- **Verification:** The authorize function should throw an error

### 2. OAuth Login Without Existing Account

**Scenario 2.1:** New user signs in with OAuth
- **Given:** No user exists with the email address
- **When:** The user signs in with an OAuth provider
- **Then:** A new user account should be created
- **Verification:** NextAuth adapter should create a new user record

**Scenario 2.2:** OAuth login without email
- **Given:** OAuth provider doesn't provide an email address
- **When:** The user attempts to login via OAuth
- **Then:** Login should fail
- **Verification:** The signIn callback should return false

### 3. OAuth Account Linking for Existing Users

**Scenario 3.1:** User with credentials signs in with OAuth
- **Given:** A user exists with verified email and password credentials
- **When:** The user signs in with GitHub using the same email
- **Then:** The GitHub account should be linked to the existing user
- **Verification:** 
  - The signIn callback should find the existing user
  - A new account record should be inserted with userId pointing to existing user
  - The user.id should be updated to match existing user's ID

**Scenario 3.2:** User tries to sign in with already linked OAuth
- **Given:** A user has already linked their GitHub account
- **When:** The user signs in with GitHub again
- **Then:** The user should be authenticated without creating duplicate links
- **Verification:**
  - The signIn callback should find the existing account link
  - No new account record should be inserted

**Scenario 3.3:** User links multiple OAuth providers
- **Given:** A user has already linked their GitHub account
- **When:** The user signs in with Google using the same email
- **Then:** The Google account should also be linked to the existing user
- **Verification:**
  - The signIn callback should link the Google account
  - A new account record should be inserted for Google provider

### 4. Integration With Auth Flow

**Scenario 4.1:** Data flow between callbacks
- **Given:** A user signs in via OAuth linking to existing account
- **When:** The authentication flow proceeds
- **Then:** The user ID should be preserved through JWT and session callbacks
- **Verification:**
  - signIn callback should update user.id
  - jwt callback should store this ID in the token
  - session callback should copy the ID to the session

**Scenario 4.2:** Session content
- **Given:** A user has been authenticated via OAuth linking
- **When:** The session is created
- **Then:** The session should contain correct user information
- **Verification:**
  - Session should include user ID, name, email, and image

### 5. Error Handling

**Scenario 5.1:** Database error during linking
- **Given:** Database is unavailable or returns an error
- **When:** A user attempts to sign in via OAuth
- **Then:** The error should be handled gracefully
- **Verification:** The signIn callback should return false and log the error

## Implementation Notes

When implementing the tests:

1. **Unit Tests:** 
   - Mock the database queries and responses
   - Extract and test the signIn, jwt, and session callbacks individually
   - Verify the account linking logic correctly identifies existing users
   - Ensure proper error handling

2. **Integration Tests:**
   - Set up a test database with known fixtures
   - Test the complete authentication flow
   - Verify correct records are created/updated in the database

3. **E2E Tests:**
   - Use test accounts for OAuth providers
   - Verify the full user journey works correctly
   - Test session persistence and multiple login methods

## Mock Strategy

For the unit tests, we should mock:
- `db.query.users.findFirst`
- `db.query.accounts.findFirst`
- `db.insert(accounts).values()`

With different mock responses to simulate:
- New users
- Existing users
- Existing account links
- Database errors

## Additional Considerations

- **Security:** Ensure that linking doesn't allow account takeover by verifying email ownership
- **Cleanup:** Delete test users and accounts after testing
- **Idempotency:** Verify that repeated sign-ins work correctly
- **Session handling:** Test that sessions are correctly maintained after OAuth linking 