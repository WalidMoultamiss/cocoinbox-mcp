const fs = require('fs');
const b = fs.readFileSync('api/logo.png');
const d = 'data:image/png;base64,' + b.toString('base64');
const out = `/** Auto-generated CocoInbox logo as data URI — do not edit by hand */
export const ICON_DATA_URI = ${JSON.stringify(d)};
export const ICON_PNG_URL = 'https://cocoinbox-mcp.vercel.app/icon.png';
export const SITE_LOGO_URL = 'https://www.cocoinbox.com/imgForLandingPage/Logo.png';
export const WEBSITE_URL = 'https://www.cocoinbox.com/';
`;
fs.writeFileSync('src/brand-icon.ts', out);
console.log('wrote src/brand-icon.ts', out.length);
