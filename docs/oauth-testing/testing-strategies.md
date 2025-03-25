# OAuth Account Linking Testing Strategies

This document outlines different approaches for testing the OAuth account linking functionality.

## Testing Challenges

Testing OAuth authentication presents several challenges:

1. **External Dependencies**: OAuth relies on external providers (GitHub, Google, etc.)
2. **Browser Interaction**: The full flow requires redirects and user interactions
3. **State Management**: The authentication process maintains state across multiple requests
4. **Sensitive Data**: Tests must avoid exposing real credentials
5. **Session Handling**: Session cookies and tokens need to be managed correctly

## Testing Approaches

### 1. Unit Testing

Unit tests focus on isolated pieces of functionality without external dependencies.

#### Key Components to Test:

- **signIn callback**: Test the account linking logic in isolation
- **jwt callback**: Verify correct token creation and augmentation
- **session callback**: Ensure session is properly populated from JWT
- **authorize function**: Test credential verification logic

#### Example: Testing signIn Callback

```typescript
import { authOptions } from '@/lib/auth';

// Mock dependencies
jest.mock('@/db', () => ({
  db: {
    query: {
      users: { findFirst: jest.fn() },
      accounts: { findFirst: jest.fn() },
    },
    insert: jest.fn(() => ({ values: jest.fn() })),
  },
}));

describe('signIn callback', () => {
  it('links OAuth account to existing user', async () => {
    // Setup mocks
    db.query.users.findFirst.mockResolvedValue({
      id: 'existing-user-id',
      email: 'test@example.com',
    });
    db.query.accounts.findFirst.mockResolvedValue(null);
    
    // Call the callback
    const user = { id: 'oauth-user-id', email: 'test@example.com' };
    const account = { provider: 'github', providerAccountId: '12345' };
    
    const signInCallback = authOptions.callbacks.signIn;
    const result = await signInCallback({ user, account, profile: {} });
    
    // Assertions
    expect(result).toBe(true);
    expect(user.id).toBe('existing-user-id');
    expect(db.insert).toHaveBeenCalledWith(accounts);
  });
});
```

### 2. Integration Testing

Integration tests verify interactions between components and with the database.

#### Approaches:

1. **Test Database**: Use a dedicated test database with known state
2. **In-Memory DB**: For faster tests, use an in-memory SQLite database
3. **Transaction Rollback**: Run tests in transactions that get rolled back

#### Example: Integration Test Setup

```typescript
import { db } from '@/db';
import { users, accounts } from '@/db/schema';
import { authOptions } from '@/lib/auth';

// Setup and teardown for each test
beforeEach(async () => {
  // Clear relevant tables
  await db.delete(accounts);
  await db.delete(users);
  
  // Seed test data
  await db.insert(users).values({
    id: 'test-user-id',
    email: 'test@example.com',
    emailVerified: new Date(),
    name: 'Test User',
  });
});

test('links OAuth account to existing user', async () => {
  // Call authentication handlers with test data
  const user = { id: 'oauth-id', email: 'test@example.com' };
  const account = { 
    provider: 'github',
    type: 'oauth',
    providerAccountId: 'gh-12345'
  };
  
  const signInCallback = authOptions.callbacks.signIn;
  await signInCallback({ user, account, profile: {} });
  
  // Verify database state
  const linkedAccount = await db.query.accounts.findFirst({
    where: (accounts, { eq }) => eq(accounts.providerAccountId, 'gh-12345'),
  });
  
  expect(linkedAccount).toBeDefined();
  expect(linkedAccount.userId).toBe('test-user-id');
});
```

### 3. Mocking OAuth Providers

For tests that involve the full authentication flow, mock the OAuth providers.

#### Approaches:

1. **Mock Authorization Server**: Create a simple OAuth server for testing
2. **NextAuth Test Helpers**: Use the built-in test utilities from NextAuth
3. **Request Interception**: Intercept and mock HTTP requests to providers

#### Example: Mock Provider

```typescript
// In your test setup
import { mockOAuthProviders } from '@/test/helpers/mockOAuth';

beforeAll(() => {
  // Start mock OAuth server
  mockOAuthProviders.start({
    github: {
      clientId: 'mock-github-client-id',
      clientSecret: 'mock-github-client-secret',
      testUsers: [
        {
          id: 'github-12345',
          email: 'test@example.com',
          name: 'GitHub User',
        },
      ],
    },
  });
});

afterAll(() => {
  mockOAuthProviders.stop();
});
```

### 4. End-to-End Testing

E2E tests verify the complete user journey through the application.

#### Tools:

- **Playwright/Puppeteer**: Automate browser interactions
- **Cypress**: E2E testing framework with good OAuth support
- **MSW (Mock Service Worker)**: Intercept network requests for testing

#### E2E Test Strategy:

1. Create test accounts with the OAuth providers
2. Use Playwright/Cypress to automate the authentication flow
3. Verify the account linking behavior works as expected

#### Example: Cypress Test

```typescript
describe('OAuth account linking', () => {
  it('links GitHub account to existing user', () => {
    // Login with credentials first
    cy.visit('/login');
    cy.get('input[name=email]').type('test@example.com');
    cy.get('input[name=password]').type('password123');
    cy.get('button[type=submit]').click();
    
    // Verify login succeeded
    cy.url().should('include', '/dashboard');
    
    // Logout
    cy.visit('/logout');
    
    // Now login with GitHub
    cy.visit('/login');
    cy.get('button[data-provider=github]').click();
    
    // Mock GitHub OAuth (using Cypress interceptors)
    cy.intercept('POST', 'https://github.com/login/oauth/access_token', {
      access_token: 'mock-token',
      token_type: 'bearer',
    });
    
    cy.intercept('GET', 'https://api.github.com/user', {
      id: 12345,
      login: 'testuser',
      name: 'Test GitHub User',
      email: 'test@example.com',
    });
    
    // Should be redirected to dashboard again
    cy.url().should('include', '/dashboard');
    
    // Verify the accounts are linked (check profile page)
    cy.visit('/profile');
    cy.get('[data-connected-providers]').should('contain', 'GitHub');
  });
});
```

### 5. Mock Next.js API Routes

Test the NextAuth API routes directly by mocking requests.

```typescript
import { createMocks } from 'node-mocks-http';
import authHandler from '@/app/api/auth/[...nextauth]/route';

test('handles OAuth callback with account linking', async () => {
  // Mock the API request
  const { req, res } = createMocks({
    method: 'GET',
    query: {
      nextauth: ['callback', 'github'],
    },
    cookies: {
      // Include necessary cookies for CSRF protection
      'next-auth.csrf-token': 'mock-csrf-token',
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  // Add necessary query parameters
  req.query.code = 'mock-auth-code';
  req.query.state = 'mock-state';
  
  // Call the handler
  await authHandler(req, res);
  
  // Check response
  expect(res.statusCode).toBe(302); // Redirect status
  
  // Verify session was created
  const cookies = res.getHeader('Set-Cookie');
  expect(cookies).toContain('next-auth.session-token');
});
```

## Testing Tools

1. **Jest/Vitest**: For unit and integration tests
2. **MSW (Mock Service Worker)**: For mocking HTTP requests
3. **node-mocks-http**: For testing API routes
4. **@testing-library/react**: For testing React components
5. **Playwright/Cypress**: For E2E testing

## Test Coverage Goals

Aim for comprehensive test coverage across different levels:

1. **Unit Tests**: 90%+ coverage of authentication logic
2. **Integration Tests**: Key flows and edge cases
3. **E2E Tests**: Critical user journeys

## Conclusion

A multi-layered testing approach is recommended for thoroughly testing OAuth account linking:

1. Start with unit tests for the core logic
2. Add integration tests with a test database
3. Implement E2E tests for critical user journeys
4. Continuously monitor and test in production (with safe test accounts)

This approach will help ensure the OAuth account linking functionality is robust, secure, and provides a good user experience. 