# Memory System Documentation

## Overview

The memory system is a comprehensive solution for managing conversation memories in the embedded chat application. It provides capabilities for extracting, storing, retrieving, and managing memories from conversations, with a focus on preventing memory loss and providing users with tools to view and manage their memories.

## System Architecture

### Core Components

1. **MemoryStore** (`/lib/chat-memory/memory-store.ts`)
   - Central class for processing and storing memories
   - Handles conversation and user memory storage with deduplication
   - Includes memory pruning and statistics functionality
   - Manages memory extraction, storage, and retrieval

2. **StructuredMemoryExtractor** (`/lib/chat-memory/structured-extractor.ts`)
   - Uses OpenAI's GPT-4o-mini model with function calling for structured extraction
   - Extracts memories from conversations with metadata (fact type, importance, confidence)
   - Includes memory filtering and ranking based on relevance

3. **MemoryGate** (`/lib/chat-memory/memory-gate.ts`)
   - Decides whether to extract memories from a conversation
   - Supports both LLM-based and embedding-based gating strategies
   - Prevents unnecessary memory extraction for trivial conversations

4. **ArtifactDetector** (`/lib/chat-memory/artifact-detector.ts`)
   - Detects important artifacts like emails, URLs, UUIDs, etc.
   - Uses Unicode-aware regex patterns for multilingual support

5. **MemoryContextBuilder** (`/lib/chat-memory/context-builder.ts`)
   - Formats memories for injection into conversation context
   - Supports multiple output formats (structured, narrative, minimal)

6. **ErrorLogger** (`/lib/chat-memory/error-logger.ts`)
   - Comprehensive error logging system for memory operations
   - Tracks failures in memory extraction, storage, and retrieval
   - Provides persistent storage in database with memoryErrorsTable

### Database Schema

The memory system uses several database tables:

1. **conversationMemoriesTable**
   - Stores memories specific to individual conversations
   - Fields: id, conversation_id, owner_id, kind, value_jsonb, salience, novelty_hash, created_at, last_used_at

2. **userMemoriesTable**
   - Stores important memories promoted to user level
   - Fields: id, owner_id, kind, value_jsonb, salience, novelty_hash, created_at, last_used_at

3. **memoryErrorsTable**
   - Tracks errors in memory operations for debugging
   - Fields: id, operation, error_message, error_details, conversation_id, user_id, created_at

4. **conversationTasksTable**
   - Stores tasks created from conversation memories
   - Fields: id, conversation_id, title, description, priority, due_date, memory_id, status, created_at, updated_at

## Memory Lifecycle

### 1. Memory Extraction

1. **Artifact Detection**: Quick scan of latest message for important artifacts
2. **Memory Gating**: Determines if conversation is worth processing
3. **Duplicate Check**: Compares with existing memories to avoid duplicates
4. **Structured Extraction**: Uses AI to extract structured memories with metadata
5. **Salience Calculation**: Scores memories based on importance and relevance

### 2. Memory Storage

1. **Conversation Memories**: Stored in conversationMemoriesTable
2. **User Memories**: Important memories promoted to userMemoriesTable
3. **Deduplication**: Uses novelty_hash to prevent duplicate memories
4. **Pruning**: Enforces limits on number of memories per conversation/user

### 3. Memory Retrieval

1. **Relevance Filtering**: Memories filtered based on relevance to current message
2. **Context Building**: Formatted for injection into conversation context
3. **Access Tracking**: Updates last_used_at timestamp for retrieved memories

## UI Components

### 1. MemoryCard (`/components/memory/memory-card.tsx`)
- Displays individual memories with metadata
- Supports editing, deleting, and copying memory content
- Shows fact type, importance, confidence, and timestamps
- Uses color-coded badges for different fact types

### 2. MemoryList (`/components/memory/memory-list.tsx`)
- Displays a list of memories with filtering and sorting
- Includes search functionality and statistics
- Integrates with MemoryCard for individual memory display

### 3. TaskManager (`/components/memory/task-manager.tsx`)
- Kanban-style board for managing tasks based on memories
- Supports creating, editing, and deleting tasks
- Allows linking tasks to specific memories for context

### 4. MemoryDashboard (`/components/memory/memory-dashboard.tsx`)
- Provides analytics and insights for conversation memories
- Shows memory statistics, distribution, and activity
- Includes filtering, sorting, and search capabilities

## API Endpoints

### Memory Management

1. **GET** `/api/embedded-chat/[uuid]/conversations/[conversationId]/memories`
   - Retrieves memories with filtering, sorting, and pagination
   - Supports filtering by fact type and searching by content

2. **POST** `/api/embedded-chat/[uuid]/conversations/[conversationId]/memories`
   - Creates new memories
   - Validates and stores memory data

3. **PUT** `/api/embedded-chat/[uuid]/conversations/[conversationId]/memories/[memoryId]`
   - Updates existing memories
   - Allows editing memory content and metadata

4. **DELETE** `/api/embedded-chat/[uuid]/conversations/[conversationId]/memories/[memoryId]`
   - Deletes memories
   - Removes from database

### Task Management

1. **GET** `/api/embedded-chat/[uuid]/conversations/[conversationId]/tasks`
   - Retrieves all tasks for a conversation
   - Returns tasks with status and metadata

2. **POST** `/api/embedded-chat/[uuid]/conversations/[conversationId]/tasks`
   - Creates new tasks
   - Links tasks to memories for context

3. **PUT** `/api/embedded-chat/[uuid]/conversations/[conversationId]/tasks/[taskId]`
   - Updates existing tasks
   - Allows changing task status and properties

4. **DELETE** `/api/embedded-chat/[uuid]/conversations/[conversationId]/tasks/[taskId]`
   - Deletes tasks
   - Removes from database

### Diagnostics

1. **GET** `/api/embedded-chat/[uuid]/conversations/[conversationId]/memories/diagnostics`
   - Provides diagnostics for memory system status
   - Analyzes conversation, messages, and memories

2. **GET** `/api/embedded-chat/[uuid]/conversations/[conversationId]/memories/extraction-test`
   - Tests memory extraction functionality
   - Verifies extraction is working properly

3. **GET** `/api/embedded-chat/[uuid]/conversations/[conversationId]/memories/injection-test`
   - Tests memory injection into conversation context
   - Verifies context building and injection

4. **GET** `/api/embedded-chat/[uuid]/conversations/[conversationId]/memories/async-test`
   - Tests asynchronous memory processing
   - Checks for silent failures in async operations

## Integration with Chat UI

The memory system is integrated into the chat UI through:

1. **Memory Panel**: Toggle button to show/hide conversation memories
2. **Task Manager**: Toggle button to show/hide task management board
3. **Memory Dashboard**: Toggle button to show/hide memory analytics
4. **Memory Handlers**: Functions for editing and deleting memories
5. **State Management**: React state for managing memories and UI state

## Memory Types

The system categorizes memories into different types:

1. **personal_info**: Personal information about the user
2. **preference**: User preferences and settings
3. **relationship**: Information about relationships
4. **work_info**: Work-related information
5. **technical_detail**: Technical specifications and details
6. **event**: Events and occurrences
7. **goal**: Goals and objectives
8. **problem**: Problems and issues
9. **solution**: Solutions and resolutions
10. **context**: Contextual information

## Task Management

The task management system allows users to:

1. **Create Tasks**: From conversation memories with titles, descriptions, and priorities
2. **Organize Tasks**: Using Kanban-style board with todo, in_progress, and completed columns
3. **Link Tasks**: Connect tasks to specific memories for context
4. **Track Progress**: Monitor task status and due dates

## Error Handling

The memory system includes comprehensive error handling:

1. **Error Logging**: All memory operations are logged with detailed error information
2. **Silent Failure Detection**: Async operations are monitored for silent failures
3. **Graceful Degradation**: System continues to function even if some operations fail
4. **Error Recovery**: Automatic retry and recovery mechanisms for transient errors

## Performance Considerations

1. **Memory Limits**: Enforced limits on number of memories per conversation/user
2. **Pruning**: Automatic removal of old, less important memories
3. **Caching**: Efficient caching of frequently accessed memories
4. **Indexing**: Database indexes for efficient memory retrieval

## Security and Privacy

1. **User Isolation**: Memories are isolated by user ID
2. **Data Encryption**: Sensitive memory data is encrypted
3. **Access Control**: API endpoints require authentication
4. **GDPR Compliance**: Support for data deletion and export

## Future Enhancements

1. **Advanced Analytics**: More sophisticated memory analytics and visualizations
2. **Memory Sharing**: Ability to share memories between conversations
3. **Memory Templates**: Pre-defined memory structures for common use cases
4. **Memory Export**: Export memories in various formats
5. **Memory Import**: Import memories from external sources

## Testing

The memory system includes comprehensive testing:

1. **Unit Tests**: Individual component testing
2. **Integration Tests**: Testing component interactions
3. **End-to-End Tests**: Testing complete memory workflows
4. **Performance Tests**: Testing system performance under load

## Troubleshooting

Common issues and solutions:

1. **Memories Not Being Stored**: Check error logs and diagnostic endpoints
2. **Memory Extraction Failures**: Verify API keys and model availability
3. **UI Not Showing Memories**: Check state management and API responses
4. **Task Management Issues**: Verify database schema and API endpoints

## Conclusion

The memory system provides a robust solution for managing conversation memories with a focus on preventing memory loss and providing users with comprehensive tools for memory management. The system is designed to be scalable, performant, and user-friendly, with extensive error handling and diagnostic capabilities.