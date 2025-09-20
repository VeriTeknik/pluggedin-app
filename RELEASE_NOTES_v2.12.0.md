# Release Notes - v2.12.0

## 🎯 Upload Context Metadata Feature

### Overview
This release introduces comprehensive metadata tracking for uploaded documents, bringing feature parity with AI-generated documents. Users can now add contextual information to their uploads, making document organization and searchability significantly better.

## ✨ New Features

### Upload Context Metadata
- **Purpose Field**: Capture why documents are being uploaded
- **Related To Field**: Link documents to specific projects or topics
- **Notes Field**: Add additional context and documentation
- **Upload Method Detection**: Automatically tracks whether files were uploaded via drag-drop or file picker
- **Metadata Panel**: New UI component displaying upload context in document preview

### Enhanced Document Organization
- Documents now store rich contextual metadata alongside file content
- Improved searchability through structured metadata fields
- Better understanding of document relationships and purpose
- Complete audit trail of how documents entered the system

## 🔒 Security Enhancements

### Input Validation
- **Zod Schema Validation**: All metadata fields validated with strict length constraints
  - Purpose: Maximum 500 characters
  - Related To: Maximum 200 characters
  - Notes: Maximum 1000 characters
- **Empty String Handling**: Proper transformation of empty strings to undefined values

### XSS Prevention
- **Content Sanitization**: All displayed metadata sanitized using `sanitizeToPlainText` utility
- **Safe Rendering**: Protection against malicious script injection in metadata fields

## 🚀 Technical Improvements

### Database Schema
- New `upload_metadata` JSONB column added to `docs` table
- Flexible schema supporting future metadata extensions
- Maintains backward compatibility with existing documents

### Upload Method Detection
- Accurate detection of upload method (drag-drop vs file-picker)
- Proper event handling in React Dropzone integration
- Metadata includes user agent and upload timestamps

### Type Safety
- Full TypeScript definitions for upload metadata
- Consistent type handling across frontend and backend
- Optional field support for progressive enhancement

## 📊 Performance Considerations

### Bundle Impact
- Minimal bundle size increase (~1-2KB)
- Efficient JSONB storage in PostgreSQL
- No performance regression in document operations

### Future Optimizations
- **Identified**: Need for GIN index on `upload_metadata` column for query performance
- **Recommendation**: Add index in future release for improved search capabilities
- **Query Pattern**: Optimized for metadata-based filtering and search

## 🔄 Migration Path

### For Existing Documents
- All existing documents remain unchanged
- Upload metadata is optional and backward compatible
- No data migration required

### For New Uploads
- Metadata capture is automatic but optional
- UI provides intuitive fields without requiring input
- Progressive disclosure of metadata features

## 📝 API Changes

### Server Actions
- `createDoc`: Enhanced to accept and validate upload metadata
- `parseAndValidateFormData`: New metadata extraction and validation

### Type Definitions
- `Doc` interface extended with `upload_metadata` field
- New `UploadMetadata` type for type-safe metadata handling

## 🎨 UI/UX Improvements

### Upload Dialog
- **Collapsible Context Section**: Optional metadata fields in dedicated section
- **Smart Defaults**: Upload method automatically detected
- **Clear Labels**: Intuitive field descriptions with placeholders

### Document Preview
- **Metadata Display**: Clean presentation of upload context
- **Conditional Rendering**: Shows upload panel for uploaded docs, AI panel for generated
- **Consistent Design**: Matches existing AI metadata panel styling

## 🐛 Bug Fixes

- Fixed TypeScript type mismatch in LibraryContent component
- Resolved form state type inconsistencies
- Corrected upload method detection logic

## 📦 Dependencies

No new dependencies added - feature built with existing libraries:
- React Hook Form for form management
- Zod for validation
- Existing UI components from Shadcn

## 🔮 What's Next

- Implement GIN index for improved metadata search performance
- Add metadata-based filtering in document library
- Extend metadata schema based on user feedback
- Advanced search capabilities using metadata fields

## 💡 Developer Notes

### Database Migrations
```sql
-- Migration already applied
ALTER TABLE docs
ADD COLUMN upload_metadata JSONB;
```

### Future Index (Recommended)
```sql
-- To be added in next release for query optimization
CREATE INDEX idx_docs_upload_metadata
ON docs
USING gin (upload_metadata);
```

## 🙏 Acknowledgments

This feature enhances document management capabilities and brings upload documents to feature parity with AI-generated content, improving overall user experience in the Plugged.in ecosystem.

---

**Version**: 2.12.0
**Release Date**: January 2025
**Type**: Minor Release (New Feature)