## BETA-47 | 2026-05-21

- Login Authentication Fix: Fixed login button hanging issue - authentication now completes properly
- BetaTracker Database Fix: Fixed null value constraint on metadata column - beta event tracking now works reliably
- Complete Release Automation: Implemented one-shot release script that builds, uploads to GitHub, and updates Scarlett app_config
- GitHub Release Integration: Automated APK upload to GitHub Releases for each build
- Scarlett Auto-Update: Configured automatic app_config updates on every release for seamless OTA updates
- Git Workflow Automation: Full git commit, tag, and push automation in release process
- Environment Configuration: Added support for GITHUB_TOKEN and SUPABASE credentials for automated deployment

## BETA-46 | 2026-05-21

- Territory Polygons Rendering: Fully restored and fixed ZIP code boundary polygon rendering with activity-based color coding
- 90-Day Activity Heat Mapping: Intelligent 90-day prospect count calculation per ZIP code territory with color-coded heat levels
- Intuitive Color Scheme: Reversed color logic - green/blue for high activity, orange for low, red for no activity
- Nominatim API Rate Limiting: Fixed 429 errors with intelligent request queue respecting rate limits
- Multi-Tier Caching System: Implemented Supabase, MMKV, Nominatim caching hierarchy for blazing-fast loads
- Supabase ZIP Boundary Cache: Persistent cloud cache - first load 20-30 sec, subsequent loads under 1 second
- MMKV Local Caching: Rapid local offline caching and instant Territory Map polygon loads via storageBridge
- All FAB Buttons Restored: Location, Search, Target, Settings, and Reload buttons fully functional
- Filter Modal Complete: Restored LensSignal and Prospecting filter tabs with all business types
- Support Email Notifications: Integrated Resend email service for automatic support ticket confirmations
- TerritoryManagerScreen Fixes: Fixed undefined color function calls with safe defaults

## BETA-45 | 2026-05-20

- Territory Map Restoration: Restored ZIP code boundary polygon rendering on Territory Map screen
- Heat Map Color Coding: Implemented prospect activity-based color coding for territories
- Reversed Color Scheme: Changed from red=high to intuitive green=high activity visualization
- Rate Limiting Fixes: Fixed Nominatim API 429 rate-limit errors with request queue
- Fallback Polygons: Added 2.5-mile radius circle boundaries when GeoJSON unavailable
- Supabase Caching Layer: Added persistent cloud cache for ZIP boundaries
- MMKV Integration: Switched from AsyncStorage to MMKV for faster local caching
- Filter UI Restoration: Restored complete filter modal with all business types and alert levels
- FAB Button Recovery: Restored all 5 action buttons on Territory Map

## BETA-44 | 2026-05-19

- LensSignal Push Alerts: Fully deployed real-time push notifications for new leads in territory
- PostGIS Spatial Queries: Implemented PostGIS triggers for geographic-based alert routing
- Edge Function Pipeline: Deployed signal-ingest and send-push-alert Edge Functions
- Push Token Management: Automatic push token registration on login/logout
- 30-Day Dedup Guard: Implemented deduplication to prevent duplicate alerts within 30-day window
- LensSignal Details Card: Added detailed signal information display in prospect queue
- Alert Filtering: Added Alert Level filters for priority management

## BETA-43 | 2026-05-18

- LeadLock Multi-Business Detection: Detects multiple storefronts in single photo
- Batch Business Enrichment: Enriches all detected businesses simultaneously with risk badges
- Risk Assessment: Added risk indicators for multi-business properties
- Camera Improvements: Enhanced LeadLockCameraScreen for multi-business targeting
- Prospect Matching: Improved matching algorithm for multiple businesses per location

## BETA-42 | 2026-05-17

- JWT Authentication Fix: Fixed SupportScreen authentication token handling
- Territory Map Crash Fix: Fixed polygon rendering crash via makeSafePolygons safety check
- Dark Theme FAB Buttons: Restored all 5 FAB buttons with dark theme and cyan borders
- Login Screen Redesign: Refactored to 3 animated provider cards (Google, Microsoft, Email)
- MMKV Storage Upgrade: Downgraded to v2.12.2 with stable AsyncStorage fallback
- Storage Bridge Implementation: Migrated all screens to storageBridge for resilient local storage
- Google Maps API Fix: Corrected literal placeholder string in AndroidManifest.xml
- Batch Review Virtualization: Migrated BatchReviewScreen to virtualized FlatList for performance
- Excel Import Optimization: Chunked async processing with O(1) column lookups via buildColumnIndex
- Push Notification Framework: Implemented push token registration and pushNotifications utility

## BETA-41 | 2026-05-16

- Prospect Queue Refinements: Improved lead card rendering and interactions
- Export Configuration: Enhanced export options with configurable templates
- Field Sales UI Polish: Minor UI improvements across prospecting screens
- Performance Tuning: Optimized screen navigation and state management
- Error Handling: Improved error messages and validation feedback
- Data Sync Stability: Fixed intermittent Supabase sync issues

## BETA-40 | 2026-05-15

- Batch Processing Framework: Added foundation for batch lead operations
- Dashboard Analytics: Initial metrics dashboard with working days and prospect counts
- Territory Heat Map: Basic heat map visualization with activity levels
- Prospect Export: CSV export functionality for captured leads
- Multi-Photo Capture: Gallery support for batch image selection
- Business Card Recognition: AI-powered OCR for business card scanning via Claude API
- Location Tracking: GPS-based prospect capture with address lookup
- Push Notifications: Expo Push integration for beta event notifications
