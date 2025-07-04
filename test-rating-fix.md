# Rating Submission Fix

## Issue Identified
The rating submission was splitting the rating and comment into two separate API calls:
1. Rating → Registry VP endpoint (`/vp/servers/{serverId}/rate`)
2. Comment → Analytics API endpoint (separate system)

This caused ratings to appear in the "events" index but not properly in a "feedback" index in Elasticsearch.

## Fix Applied
Updated the registry VP client to include comments in the rating submission:

1. **Updated `RatingRequest` interface** to include a `comment` field
2. **Updated `submitRating` method** to accept and send comments
3. **Updated `submitRatingToRegistry` function** to pass comments
4. **Updated `rateServer` action** to pass comments to the registry

Now the comment is sent along with the rating in a single request to the registry VP endpoint.

## Testing Steps
1. Try rating a server again with a comment
2. Check the console logs for the full request payload including the comment
3. Verify the registry receives both rating and comment together
4. Check if the feedback now appears in the proper Elasticsearch index

## Expected Request Body
```json
{
  "rating": 4,
  "source": "REGISTRY",
  "user_id": "your-user-id",
  "timestamp": "2025-07-04T...",
  "comment": "test123"
}
```

The registry should now process this as a complete feedback submission rather than just a rating event.