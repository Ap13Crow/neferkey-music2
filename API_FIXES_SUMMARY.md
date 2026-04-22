# API Fixes Summary

## Issues Fixed

### 1. **404 Error with Empty Response** ✅
**Root Cause**: The Swagger specification had `servers: [{ url: '/api', ... }]` but all endpoints already included `/api` in their paths. This caused requests to be sent to `/api/api/auth/register` instead of `/api/auth/register`.

**Fix**: Changed the server URL to `/` in the Swagger spec since paths already include `/api` prefix.

```javascript
// BEFORE (incorrect)
servers: [{ url: '/api', description: 'Current server' }]

// AFTER (correct)  
servers: [{ url: '/', description: 'Current server (paths include /api prefix)' }]
```

### 2. **JWT Token Not Readable in Swagger** ✅
**Issue**: Users couldn't figure out how to use the JWT token returned from login/register endpoints in Swagger UI.

**Fixes**:
- Updated Swagger description with clear instructions: "Getting a Token: 1) Call POST `/api/auth/register` or `/api/auth/login`, 2) Copy the `token` value from the response, 3) Click the "Authorize" button (top-right), paste the token, 4) Click "Authorize" in the dialog."
- Added `persistAuthorization: true` to Swagger UI config (was already there)
- Improved endpoint descriptions with instructions to copy tokens
- Updated Bearer auth scheme description to explain how to use the token

### 3. **Admin Tracks Shown Publicly After Logout** ✅
**Root Cause**: The `/api/tracks` GET endpoint returned ALL tracks when unauthenticated, with no visibility/privacy flag. Admin tracks were being exposed.

**Fixes**:
- **Added `is_public` column** to the `records` table
  - Migration: `ALTER TABLE records ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false`
  - Default: `false` (private) for security
  - Demo tracks: Set to `true` (public)
  
- **Updated `/api/tracks` GET endpoint**:
  - **Authenticated**: Returns only the user's own tracks (unchanged)
  - **Unauthenticated**: Returns ONLY tracks where `is_public = true` (FIXED)
  
- **Added `/api/tracks/{urlKey}` PATCH endpoint** to update track visibility
  - Allows track owners to make their tracks public/private after upload
  - Requires authentication
  
- **Updated `/api/tracks/upload` POST endpoint**:
  - New optional `is_public` parameter (defaults to `false`)
  - Allows users to set visibility when uploading

## Files Modified

1. **`backend/src/db.js`**
   - Added migration to create `is_public` column
   - Updated table schema to include `is_public BOOLEAN NOT NULL DEFAULT false`
   - Updated demo seed data to have `is_public = true`

2. **`backend/src/app.js`**
   - Fixed Swagger server URL from `/api` to `/`
   - Added clear JWT token usage instructions in API description
   - Updated Bearer auth scheme description
   - Added `is_public` field to Track schema definition

3. **`backend/src/routes/auth.js`**
   - Improved `/api/auth/register` endpoint documentation with token instructions
   - Improved `/api/auth/login` endpoint documentation with token instructions
   - Added 500 error response code

4. **`backend/src/routes/tracks.js`**
   - Fixed `/api/tracks` GET to filter by `is_public = true` for unauthenticated users
   - Updated upload endpoint to accept `is_public` parameter
   - Added new PATCH `/api/tracks/{urlKey}` endpoint to update track visibility
   - Updated Swagger documentation for all endpoints

## How to Test

### Test 1: Register and Get Token
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'
```
Response will include a `token` field. Copy this value.

### Test 2: Use Token in Swagger
1. Open http://localhost:3000/api/docs
2. Call POST `/api/auth/register` or `/api/auth/login`
3. From the response, copy the `token` value
4. Click "Authorize" button (top-right)
5. Paste the token (just the token, no "Bearer " prefix needed in Swagger)
6. Click "Authorize" button in dialog
7. Now you can call protected endpoints like `/api/tracks` (GET) which will return only your tracks

### Test 3: Public vs Private Tracks
```bash
# As admin, upload a private track (default)
curl -X POST http://localhost:3000/api/tracks/upload \
  -H "Authorization: Bearer <TOKEN>" \
  -F "audio=@song.mp3" \
  -F "title=My Private Song" \
  -F "artist=Me"

# Get all tracks (unauthenticated) - should only see demo tracks and any is_public=true tracks
curl http://localhost:3000/api/tracks

# Get your tracks (authenticated) - should see all your tracks including private ones
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/tracks

# Make a track public
curl -X PATCH http://localhost:3000/api/tracks/{urlKey} \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"is_public":true}'
```

## Security Notes

- Default `is_public = false` ensures new tracks are private by default
- Only track owners can change visibility or delete tracks
- Admin tracks won't leak publicly unless explicitly marked with `is_public = true`
- JWT token must be sent in Authorization header for protected endpoints
