export const COLORS = {
  bg:        '#080A0F',
  surface:   '#0E1018',
  surface2:  '#141720',
  surface3:  '#1C2030',
  border:    '#252A3A',
  borderLit: '#3A4060',
  accent:    '#00C9FF',
  accentDim: 'rgba(0,201,255,0.15)',
  accent2:   '#CC1040',
  accent2Dim:'rgba(204,16,64,0.15)',
  purple:    '#7B3FBE',
  purpleDim: 'rgba(123,63,190,0.15)',
  chrome:    '#B8BDD0',
  chromeDim: 'rgba(184,189,208,0.12)',
  danger:    '#FF3B5C',
  success:   '#00E5A0',
  warning:   '#FFC800',
  text:      '#E8EAF2',
  textDim:   '#A0A8C0',
  muted:     '#5A6080',
  label:     '#7A85A8',
};

export const STATUS_OPTIONS = [
  'Suspect',
  'New',
  'Contacted',
  'In Progress',
  'Not Interested',
  'Closed',
];

export const INDUSTRY_VERTICALS = [
  'HVAC / Mechanical',
  'Security / Access Control',
  'Solar & Energy',
  'Real Estate / Property Services',
  'Pest Control',
  'Warehousing',
  'Food & Beverage Processing',
  'Schools / Daycares',
  'Medical',
  'Retail',
  'Office Buildings',
  'Hotels / Motels / Apartments',
  'Government',
  'Logistics / Distribution',
  'Restaurants',
  'Other',
];

export const TARGET_LENS_PROFILES_KEY = '@leadlens_target_lens_profile';
export const TARGET_LENS_SEARCH_MODE_KEY = '@leadlens_target_lens_search_mode';

export const PROPERTY_TYPES = ['Commercial'];

export const ROLES = {
  ACCOUNT_MANAGER: 'Account Manager',
  BRANCH_MANAGER: 'Branch Manager',
  REGIONAL_MANAGER: 'Regional Manager',
};

export const EMPTY_LEAD = {
  id: null,
  businessName: '',
  pocFirst: '',
  pocLast: '',
  phone: '',
  email: '',
  website: '',
  facebookUrl: '',
  instagramUrl: '',
  linkedinUrl: '',
  tiktokUrl: '',
  youtubeUrl: '',
  xUrl: '',
  socialConfidence: 'none',
  socialSource: '',
  streetNumber: '',
  streetName: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
  status: 'Suspect',
  propertyType: 'Commercial',
  vertical: 'Retail',
  captureMethod: 'manual',
  imageUri: null,
  notes: '',
};

export const USER_STORAGE_KEY = '@leadlens_user';
export const LEADS_STORAGE_KEY = '@leadlens_leads';
export const GOALS_STORAGE_KEY = '@leadlens_user_goals';
export const ALL_LEADS_KEY = '@leadlens_all_leads';
export const AUTO_INTRO_KEY = '@leadlens_auto_intro';
export const INTRO_TEMPLATE_SETTINGS_KEY = '@leadlens_intro_template_settings';
export const EXPORT_SETTINGS_KEY = '@leadlens_export_settings';
export const AUTO_EXPORT_SETTINGS_KEY = '@leadlens_auto_export_settings';
export const AUTO_EXPORT_PROFILE_KEY = '@leadlens_auto_export_profile';
export const SUPABASE_SETTINGS_KEY = '@leadlens_supabase_settings';
export const AUTOMATION_SETTINGS_KEY = '@leadlens_automation_settings';
export const LAST_AUTOMATION_RUN_KEY = '@leadlens_last_automation_run';
export const LEGAL_ACCEPTANCE_KEY = '@leadlens_legal_acceptance';
export const DAILY_GOAL_CHIME_KEY_PREFIX = 'dailyGoalChimePlayed:';
export const DAILY_GOAL_CHIME_ENABLED_KEY = '@leadlens_daily_goal_chime_enabled';

export const AI_PERSONALITY_STYLE_KEY = '@leadlens_ai_personality_style';
export const AI_VOICE_PROFILE_KEY = '@leadlens_ai_voice_profile';

export const AI_PERSONALITY_STYLES = {
  PROFESSIONAL: 'Professional',
  FRIENDLY_COACH: 'Friendly Coach',
  MOTIVATOR: 'Motivator',
  SARCASTIC: 'Sarcastic / Ornery',
  MINIMAL: 'Minimal',
  PREMIUM_EXECUTIVE: 'Premium Executive',
};

export const AI_VOICE_PROFILES = {
  SIRIUS: 'Sirius (Neutral)',
  NOVA: 'Nova (Warm)',
  ECHO: 'Echo (Deep)',
  SHIMMER: 'Shimmer (Bright)',
  ONYX: 'Onyx (Bold)',
};

export const DISABLED_USERS_KEY = '@leadlens_disabled_users';
export const STOREFRONT_SCAN_LIMIT = 25;

export const STOREFRONT_SCAN_HISTORY_KEY = '@leadlens_storefront_scan_history';
export const AUTH_PROFILE_KEY = '@leadlens_auth_profile';
export const AUTH_REDIRECT_PATH = 'auth/callback';
export const AUTH_RESET_PATH = 'auth/reset-password';

export const EXPORT_MODES = {
  SALES_TEMPLATE: 'sales_template',
  TEMPLATE: 'template',
  STANDARD: 'standard',
  CUSTOM: 'custom',
};

export const DEFAULT_INTRO_TEMPLATES = {
  emailSubject: 'Introduction from {repName}',
  emailBody:
    'Hi {contactName},\n\nMy name is {repName} and I just had the pleasure of visiting {businessName}. I wanted to reach out and introduce myself properly.\n\nI\'d love the opportunity to connect and learn more about your business needs. Please don\'t hesitate to reach out at any time.\n\nBest regards,\n{repName}\nBranch {branchNum}',
  smsBody:
    'Hi {firstName}, this is {repName}! I just stopped by {businessName} and wanted to connect. Feel free to reach out anytime!',
};

export const DEFAULT_EXPORT_SETTINGS = {
  mode: EXPORT_MODES.STANDARD,
  profileName: '',
};

export const DEFAULT_BACKEND_EMAIL_SETTINGS = {
  enabled: true,
  endpoint: 'https://okayestmedia.netlify.app/.netlify/functions/send-email',
  recipient: '',
  subject: 'LeadLens Export',
  htmlBody: '<strong>Your LeadLens export is ready.</strong>',
};

export const APP_VERSION = '1.14.0';
export const PRIVACY_POLICY_VERSION = '1.1';
export const TERMS_VERSION = '1.1';
export const SUPPORT_EMAIL = 'theokaymediafam@gmail.com';

export const FAQ_ITEMS = [
  {
    category: 'Getting Started',
    question: 'What is LeadLens for?',
    answer:
      'LeadLens helps capture prospect information from photos, manual entry, and imports, then review, queue, and export those leads for follow-up.',
  },
  {
    category: 'Capture',
    question: 'Can I scan more than one prospect from an image?',
    answer:
      'Yes. When multiple prospects are detected from the same image, LeadLens sends them to Batch Review so you can inspect and save only the ones you want.',
  },
  {
    category: 'Capture',
    question: 'Why is property type always Commercial?',
    answer:
      'For the current beta configuration, property type is locked to Commercial to keep exports and classification consistent.',
  },
  {
    category: 'Queue',
    question: 'Why is a lead marked as a possible duplicate?',
    answer:
      'LeadLens compares new captures against leads already in queue using business name, phone, email, address, and other matching clues.',
  },
  {
    category: 'Export',
    question: 'Where do my exported files go?',
    answer:
      'Exports are generated on the device and then shared or handed off using the selected export flow. If an automated export is configured, it can also be queued for later delivery.',
  },
  {
    category: 'Automation',
    question: 'Why did scheduled export not send automatically?',
    answer:
      'Without a fully live backend automation service, mobile scheduled exports are best-effort and usually run when the app is opened or resumed around the scheduled time.',
  },
  {
    category: 'Authentication',
    question: 'How do disabled accounts work?',
    answer:
      'Managers can temporarily disable a user email from the admin view. Disabled users are blocked from continuing through LeadLens until the account is re-enabled.',
  },
  {
    category: 'Storefront Scan',
    question: 'Why does a storefront lead say Needs Review?',
    answer:
      'If LeadLens can confirm the business name but the address or state is not strong enough, it preserves the scan evidence, marks the location as Needs Review, and asks you to confirm it before relying on it.',
  },
  {
    category: 'Support',
    question: 'How do I report a bug?',
    answer:
      'Use the Support & Feedback page to describe the issue and attach screenshots or short screen recordings from your device.',
  },
];

export const PRIVACY_POLICY_TEXT = `Privacy Policy

Effective Date: [Insert Date]
Operator: O-Kay-est Media
App: LeadLens
Contact: theokaymediafam@gmail.com

LeadLens is a business productivity application operated by O-Kay-est Media. This Privacy Policy explains how LeadLens collects, uses, stores, and shares information when you use the app.

1. Information Collected
LeadLens may collect and process images uploaded or captured in the app, OCR-extracted text, manually entered lead information, business names, contact names, phone numbers, email addresses, addresses, vertical classifications, notes, screenshots, short support recordings, account sign-in details, and support or feedback submissions.

2. How Information Is Used
LeadLens uses information to capture, organize, review, enrich, classify, queue, export, troubleshoot, and automate lead workflows; support FAQ and feedback flows; improve storefront matching accuracy; and provide oversight dashboards for authorized management roles.

3. Device Permissions
LeadLens may request access to the camera, photo library, microphone, location, and files in order to support capture, voice input, storefront scanning, support attachments, import, export, and related workflow features.

4. Data Storage
LeadLens may store data locally on the device for speed, offline access, and workflow continuity. LeadLens may also store or sync certain data to backend or cloud services, including Supabase and related infrastructure, to support authentication, synchronization, automation, logging, export delivery, support workflows, and future backup features.

5. Account Access and Authentication
LeadLens may support sign-in using email and password, Google, Microsoft, and similar account providers. Authentication data may be processed by O-Kay-est Media and its service providers solely as needed to support secure login, account access, and account recovery.

6. Management Visibility
Users with authorized management roles, such as branch and regional managers, may be able to view prospecting activity, status summaries, filters, and reporting dashboards that are reasonably necessary to oversee team activity and operational performance.

7. Automated Messaging and Exports
LeadLens may support automated email or text workflows and scheduled or manual exports based on user-configured settings. Users remain responsible for ensuring that any outreach, communications, or exported data are used in compliance with applicable privacy, consent, anti-spam, telemarketing, and communications laws.

8. Support Submissions
If you use the Support & Feedback features, LeadLens may collect issue descriptions, optional screenshots, optional short recordings, device context, app version information, and similar troubleshooting details to investigate and respond to support requests.

9. Storefront Scanning and Accuracy
LeadLens may retain storefront scan context such as images, OCR summaries, timestamps, location clues, and debugging metadata to improve matching accuracy, support review workflows, and troubleshoot scan issues. OCR, enrichment, and location-based matching may still produce incomplete or inaccurate results, and users remain responsible for review before relying on them.

10. Sharing of Information
O-Kay-est Media does not sell personal information collected through LeadLens. Information may be shared with service providers or infrastructure providers only as reasonably necessary to operate the app, including authentication, storage, synchronization, export generation, communications, analytics, support, and hosting services.

11. Retention
Information may be retained for as long as reasonably necessary to operate the app, support workflows, maintain records, respond to support matters, improve reliability, comply with legal obligations, resolve disputes, and enforce agreements.

12. Security
O-Kay-est Media takes reasonable steps to protect information used by LeadLens. However, no method of storage, transmission, or processing is completely secure, and absolute security cannot be guaranteed.

13. Future Business Use
LeadLens is currently used internally, but O-Kay-est Media may expand the app for use by additional individuals, companies, or business customers. This Privacy Policy is intended to support that future use, subject to updates as the product evolves.

14. Changes to This Policy
O-Kay-est Media may update this Privacy Policy from time to time. Updated versions may be presented in the app and may require renewed acknowledgment where appropriate.

15. Contact
Questions about this Privacy Policy may be sent to theokaymediafam@gmail.com.`;

export const TERMS_OF_USE_TEXT = `Terms of Use

Effective Date: [Insert Date]
Operator: O-Kay-est Media
App: LeadLens
Contact: theokaymediafam@gmail.com

These Terms of Use govern access to and use of LeadLens, a software application operated by O-Kay-est Media.

1. Acceptance
By accessing or using LeadLens, you agree to be bound by these Terms of Use. If you do not agree, do not use the app.

2. Purpose of the App
LeadLens is intended to assist with business lead capture, review, enrichment, export, team visibility, support reporting, and related workflow automation.

3. Authorized Use
You agree to use LeadLens only for lawful purposes and in compliance with all applicable laws, regulations, contractual obligations, and communication requirements.

4. User Responsibility
You are responsible for the accuracy and legality of data you upload, capture, enter, export, or send; for reviewing OCR, enrichment, storefront matching, automated categorizations, and generated outputs before relying on them; and for ensuring that any outreach, export, text, or email activity conducted through or in connection with LeadLens complies with applicable law.

5. Role-Based Access
LeadLens may provide different levels of access to account managers, branch managers, regional managers, administrators, or similar users. Management and administrative users may have broader visibility into team activity, dashboards, queues, and related records as reasonably necessary for operational oversight.

6. Automated Features
LeadLens may include automated exports, automated outreach, scheduling tools, duplicate detection, support reporting, and similar conveniences. These features are provided for convenience only. O-Kay-est Media does not guarantee that such outputs are complete, accurate, error-free, or legally sufficient for any specific use.

7. Authentication and Account Access
LeadLens may support sign-in using email/password and approved third-party login providers such as Google or Microsoft. Users are responsible for maintaining the confidentiality of their credentials and for activity conducted through their accounts. Managers and administrators may be able to trigger password reset workflows, but they are not provided access to users' passwords.

8. No Guarantee of Accuracy
LeadLens may rely on OCR, user input, device location, automation logic, or third-party services. Results may be inaccurate, incomplete, delayed, duplicated, or misclassified. You are solely responsible for final review and use of all data.

9. Support Materials
If you submit a support or feedback request, including screenshots or short recordings, you represent that you have the right to provide that material and that doing so does not violate applicable law, confidentiality obligations, or the rights of others.

10. Intellectual Property
LeadLens, including its software, branding, design, features, and related materials, is owned by or licensed to O-Kay-est Media and is protected by applicable intellectual property laws. These Terms do not transfer ownership of the app or its underlying technology.

11. Restrictions
You may not use LeadLens for unlawful, deceptive, abusive, or unauthorized purposes; interfere with app operation, security, or availability; or reverse engineer, copy, resell, or redistribute LeadLens except as expressly authorized by O-Kay-est Media.

12. Suspension or Termination
O-Kay-est Media may suspend, restrict, or terminate access to LeadLens at any time, with or without notice, if necessary to protect the app, comply with legal obligations, or address misuse.

13. Changes to the App
LeadLens may be updated, modified, restricted, or discontinued at any time. Features may be added, removed, or changed without guarantee of continued availability.

14. Future Paid Features
LeadLens may include paid plans, subscriptions, or commercial licensing in the future. Any such offerings will be governed by additional pricing or subscription terms when introduced.

15. Disclaimer
LeadLens is provided on an "as is" and "as available" basis to the fullest extent permitted by law. O-Kay-est Media disclaims warranties of any kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, and availability.

16. Limitation of Liability
To the fullest extent permitted by law, O-Kay-est Media shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of data, profits, business opportunities, goodwill, or use arising out of or related to LeadLens.

17. Changes to These Terms
O-Kay-est Media may revise these Terms of Use from time to time. Updated terms may be presented in the app and may require renewed acceptance.

18. Contact
Questions regarding these Terms of Use may be sent to theokaymediafam@gmail.com.`;
