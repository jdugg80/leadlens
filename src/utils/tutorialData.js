// Tutorial step definitions for LeadLens
// region: { top, left, width, height } as 0-1 fractions of screen height/width

export const TUTORIAL_STEPS = {

  scan: [
    {
      title: '📷 Scan a Prospect',
      body: 'Tap Scan to capture a prospect from a business card, storefront sign, or your photo gallery.',
      region: { top: 0.28, left: 0.04, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '⚡ LeadLock™',
      body: 'LeadLock uses your camera + GPS to identify the business in front of you and auto-fill address details. Point at a storefront and tap capture.',
      region: { top: 0.28, left: 0.04, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '🌐 GeoTarget Assist',
      body: 'GeoTarget scans the area around your GPS location to find nearby business matches. Best for dense areas like strip malls.',
      region: { top: 0.28, left: 0.04, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '📸 Multi-Photo Capture',
      body: 'After each photo, you\'ll be asked "Do you have more photos?" — keep adding until you\'re done. All photos are processed together and sent to Batch Review.',
      region: { top: 0.28, left: 0.04, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
  ],

  manual: [
    {
      title: '✏️ Manual Entry',
      body: 'Type in prospect details by hand — great for when you\'re talking to someone and don\'t have a card.',
      region: { top: 0.28, left: 0.52, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '🎤 Voice Input',
      body: 'Tap the 🎤 mic icon next to any field label to switch to voice mode. Speak the value and it\'ll appear in the field.',
      region: { top: 0.28, left: 0.52, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '→ Review Before Saving',
      body: 'Tap "Review Prospect" to check the extracted data, assign a status and industry, and optionally look up their business profile before adding to the queue.',
      region: { top: 0.28, left: 0.52, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
  ],

  territory: [
    {
      title: '🗺️ Territory Manager',
      body: 'Add and manage the ZIP codes that make up your territory. All prospect data is mapped against your ZIPs to show coverage.',
      region: { top: 0.46, left: 0.04, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '🔥 Heat Map',
      body: 'The heat map shows how active you\'ve been in each ZIP over the past 30 days. Colors are based on your personal daily goal set in Settings.',
      region: { top: 0.46, left: 0.04, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '🟢 Color Guide',
      body: 'Green = at or above your goal · Blue = 70–99% · Yellow = 40–69% · Orange = 10–39% · Gray = under 10%. Zones pulse faster the hotter they are.',
      region: { top: 0.46, left: 0.04, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '🎯 Daily Goal',
      body: 'Go to Settings → Expectations & Goals to set your personal daily prospects target. This number drives all heat map thresholds across your territory.',
      region: { top: 0.46, left: 0.04, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
  ],

  export: [
    {
      title: '📤 Export Prospects',
      body: 'Export sends your queue as a formatted CSV or email. You control exactly which fields are included and how they\'re mapped.',
      region: { top: 0.46, left: 0.52, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '📋 Export Templates',
      body: 'Save your field selection and format as a named template. Next time, just pick the template and tap send — no reconfiguring needed.',
      region: { top: 0.46, left: 0.52, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '📧 Auto-Export',
      body: 'Turn on Auto-Export in Settings to automatically send your queue on a schedule — daily, weekly, or on specific days of the week.',
      region: { top: 0.46, left: 0.52, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
  ],

  gallery: [
    {
      title: '🖼️ Card Gallery',
      body: 'Every image you capture is saved here — business cards, storefronts, and multi-photo scans. Tap any image to preview it full-screen.',
      region: { top: 0.62, left: 0.04, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '🔗 Link to Prospect',
      body: 'Tap an image and press "View Lead →" to jump directly to that prospect\'s record in your queue.',
      region: { top: 0.62, left: 0.04, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '🗑️ Delete Images',
      body: 'Deleting an image here only removes the photo file — your prospect record stays in the queue untouched.',
      region: { top: 0.62, left: 0.04, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
  ],

  settings: [
    {
      title: '⚙️ Settings',
      body: 'Configure your outreach templates, export settings, auto-intro messages, Supabase sync, and notification preferences all in one place.',
      region: { top: 0.62, left: 0.52, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '🎯 Expectations & Goals',
      body: 'Set your personal daily prospecting goal here. This number is used by the Territory Map heat map to show how your activity compares to your target.',
      region: { top: 0.62, left: 0.52, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
    {
      title: '🤖 AI Intro Templates',
      body: 'Customize the auto-intro message that appears when you open a new prospect record. Use tokens like {businessName} and {repName} for personalization.',
      region: { top: 0.62, left: 0.52, width: 0.44, height: 0.16 },
      arrow: 'up',
    },
  ],

  queue: [
    {
      title: '📋 Prospect Queue',
      body: 'Every prospect you capture or enter lands here. Tap a card to open the full record, edit details, or update their status.',
      region: { top: 0.78, left: 0.04, width: 0.92, height: 0.14 },
      arrow: 'up',
    },
    {
      title: '⚡ Quick Actions',
      body: 'The action buttons below each prospect let you call 📞, text 💬, email ✉️, or map 📍 them instantly — no opening the record needed.',
      region: { top: 0.78, left: 0.04, width: 0.92, height: 0.14 },
      arrow: 'up',
    },
    {
      title: '✨ Enrichment',
      body: 'If a prospect is missing phone, email, or address, the ✨ button appears. Tap it and AI will try to fill in the gaps automatically.',
      region: { top: 0.78, left: 0.04, width: 0.92, height: 0.14 },
      arrow: 'up',
    },
    {
      title: '🔴 Missing Field Badges',
      body: '"no phone", "no email", and "no address" badges tell you at a glance which prospects need more info before they\'re export-ready.',
      region: { top: 0.78, left: 0.04, width: 0.92, height: 0.14 },
      arrow: 'up',
    },
    {
      title: '☑️ Select & Delete',
      body: 'Tap "Select" to enter multi-select mode. Long-press any card to start selecting. Tap Delete to remove selected prospects from your queue.',
      region: { top: 0.78, left: 0.04, width: 0.92, height: 0.14 },
      arrow: 'up',
    },
  ],

};
