# Registry Feedback/Comments Implementation Request

## Overview

The PluggedIn app needs to support user comments/reviews alongside numeric ratings for MCP servers. Currently, the registry VP API only supports numeric ratings through the `/vp/servers/{id}/rate` endpoint. We need to extend this to support full feedback functionality.

## Current State

### What Works
- Numeric ratings (1-5) via `POST /vp/servers/{id}/rate`
- Rating statistics (average rating, count) via `GET /vp/servers/{id}/stats`
- Installation tracking via `POST /vp/servers/{id}/install`

### What's Missing
- User comments/reviews storage
- Comment retrieval endpoints
- User-specific rating/comment history
- Comment moderation capabilities

## Required Implementation

### 1. Extended Rating Request Model

Update the `RatingRequest` model in `/extensions/stats/model.go`:

```go
// RatingRequest represents a request to submit a rating with optional comment
type RatingRequest struct {
    Rating    float64 `json:"rating" validate:"required,min=1,max=5"`
    Comment   string  `json:"comment,omitempty" validate:"max=1000"` // Add this field
    Source    string  `json:"source,omitempty"`
    UserID    string  `json:"user_id,omitempty"`    // Add for tracking
    Timestamp string  `json:"timestamp,omitempty"`   // Add for tracking
}
```

### 2. New Feedback Model

Add a new model for storing complete feedback:

```go
// ServerFeedback represents a user's rating and comment for a server
type ServerFeedback struct {
    ID           string    `json:"id" bson:"_id"`
    ServerID     string    `json:"server_id" bson:"server_id"`
    Source       string    `json:"source" bson:"source"`
    UserID       string    `json:"user_id" bson:"user_id"`
    Rating       float64   `json:"rating" bson:"rating"`
    Comment      string    `json:"comment,omitempty" bson:"comment,omitempty"`
    CreatedAt    time.Time `json:"created_at" bson:"created_at"`
    UpdatedAt    time.Time `json:"updated_at" bson:"updated_at"`
    IsPublic     bool      `json:"is_public" bson:"is_public"`
    
    // Optional fields for display
    Username     string    `json:"username,omitempty" bson:"-"`
    UserAvatar   string    `json:"user_avatar,omitempty" bson:"-"`
}

// FeedbackResponse for API responses
type FeedbackResponse struct {
    Feedback    []*ServerFeedback `json:"feedback"`
    TotalCount  int              `json:"total_count"`
    HasMore     bool             `json:"has_more"`
}
```

### 3. New Endpoints Required

#### A. Submit Feedback (Enhanced Rating Endpoint)
**Endpoint**: `POST /vp/servers/{id}/rate`

Update the existing endpoint to:
- Accept and store comments alongside ratings
- Store user_id for attribution
- Prevent duplicate ratings per user per server
- Return the created/updated feedback

**Request**:
```json
{
  "rating": 4,
  "comment": "Great server! Easy to set up and works perfectly.",
  "source": "REGISTRY",
  "user_id": "user123"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Rating submitted successfully",
  "feedback": {
    "id": "feedback123",
    "server_id": "server123",
    "user_id": "user123",
    "rating": 4,
    "comment": "Great server! Easy to set up and works perfectly.",
    "created_at": "2024-01-04T12:00:00Z"
  },
  "stats": {
    "server_id": "server123",
    "installation_count": 1234,
    "rating": 4.5,
    "rating_count": 79
  }
}
```

#### B. Get Server Feedback
**Endpoint**: `GET /vp/servers/{id}/feedback`

Retrieve all feedback/comments for a server.

**Query Parameters**:
- `limit`: Number of results (default: 20, max: 100)
- `offset`: Pagination offset
- `sort`: Sort order (newest, oldest, rating_high, rating_low)

**Response**:
```json
{
  "feedback": [
    {
      "id": "feedback123",
      "server_id": "server123",
      "user_id": "user123",
      "username": "johndoe",
      "rating": 4,
      "comment": "Great server! Easy to set up and works perfectly.",
      "created_at": "2024-01-04T12:00:00Z",
      "is_public": true
    }
  ],
  "total_count": 45,
  "has_more": true
}
```

#### C. Get User's Rating for a Server
**Endpoint**: `GET /vp/servers/{id}/rating/{user_id}`

Check if a user has already rated a server.

**Response**:
```json
{
  "has_rated": true,
  "feedback": {
    "id": "feedback123",
    "rating": 4,
    "comment": "Great server!",
    "created_at": "2024-01-04T12:00:00Z"
  }
}
```

#### D. Update User's Feedback
**Endpoint**: `PUT /vp/servers/{id}/feedback/{feedback_id}`

Allow users to update their own feedback.

**Request**:
```json
{
  "rating": 5,
  "comment": "Updated: Even better than I initially thought!",
  "user_id": "user123"
}
```

#### E. Delete User's Feedback
**Endpoint**: `DELETE /vp/servers/{id}/feedback/{feedback_id}`

Allow users to delete their own feedback.

### 4. Database Schema Updates

Add a new MongoDB collection `server_feedback`:

```javascript
{
  "_id": "feedback123",
  "server_id": "server123",
  "source": "REGISTRY",
  "user_id": "user123",
  "rating": 4,
  "comment": "Great server! Easy to set up and works perfectly.",
  "created_at": ISODate("2024-01-04T12:00:00Z"),
  "updated_at": ISODate("2024-01-04T12:00:00Z"),
  "is_public": true
}

// Indexes needed:
// - Compound index on (server_id, source) for querying feedback
// - Unique compound index on (server_id, user_id, source) to prevent duplicates
// - Index on user_id for user's feedback history
// - Index on created_at for sorting
```

### 5. Implementation Details

#### Handler Updates

In `/extensions/vp/handlers/stats.go`, update `SubmitRatingHandler`:

```go
func (h *VPHandlers) SubmitRatingHandler(w http.ResponseWriter, r *http.Request) {
    // ... existing validation ...
    
    // Check for existing feedback from this user
    existingFeedback, err := h.feedbackDB.GetUserFeedback(r.Context(), serverID, ratingReq.UserID)
    if err != nil && err != ErrNotFound {
        http.Error(w, "Failed to check existing feedback", http.StatusInternalServerError)
        return
    }
    
    // Create or update feedback
    feedback := &ServerFeedback{
        ServerID:  serverID,
        Source:    ratingReq.Source,
        UserID:    ratingReq.UserID,
        Rating:    ratingReq.Rating,
        Comment:   ratingReq.Comment,
        IsPublic:  true,
    }
    
    if existingFeedback != nil {
        feedback.ID = existingFeedback.ID
        feedback.CreatedAt = existingFeedback.CreatedAt
        feedback.UpdatedAt = time.Now()
        err = h.feedbackDB.UpdateFeedback(r.Context(), feedback)
    } else {
        feedback.ID = generateID()
        feedback.CreatedAt = time.Now()
        feedback.UpdatedAt = time.Now()
        err = h.feedbackDB.CreateFeedback(r.Context(), feedback)
    }
    
    // ... update stats as before ...
    // ... invalidate caches ...
    
    // Return feedback with stats
    response := map[string]interface{}{
        "success":  true,
        "message":  "Rating submitted successfully",
        "feedback": feedback,
        "stats":    updatedStats,
    }
}
```

### 6. Analytics Integration

When feedback is submitted, send events to the analytics service:

```go
// Send to analytics for tracking
if h.analyticsClient != nil {
    h.analyticsClient.TrackEvent(AnalyticsEvent{
        EventType: "feedback_submitted",
        ServerID:  serverID,
        UserID:    feedback.UserID,
        Metadata: map[string]interface{}{
            "rating":    feedback.Rating,
            "has_comment": feedback.Comment != "",
            "source":    feedback.Source,
        },
    })
}
```

### 7. Caching Considerations

- Cache feedback lists with 5-minute TTL
- Invalidate feedback cache when new feedback is submitted
- Cache user's feedback status to avoid duplicate checks

### 8. Security Considerations

- Validate user_id from authentication token (don't trust client)
- Rate limit feedback submissions (max 1 per user per server per hour)
- Sanitize comments to prevent XSS
- Implement comment length limits (e.g., 1000 characters)
- Add moderation flags for inappropriate content

## Expected Timeline

This implementation would enable:
1. Full feedback functionality in the registry
2. User comments visible to all users
3. Prevention of duplicate ratings
4. Rich review system for MCP servers

## Benefits

- Single source of truth for all rating/feedback data
- No need for local storage in client apps
- Consistent feedback across all registry consumers
- Better user engagement with detailed reviews

## Testing Requirements

1. Unit tests for all new endpoints
2. Integration tests for feedback CRUD operations
3. Load tests for feedback retrieval at scale
4. Security tests for user validation and rate limiting

## Migration Notes

For existing ratings without comments:
- Keep existing stats intact
- New feedback entries can be created when users add comments
- Backfill user_id where possible from authentication logs