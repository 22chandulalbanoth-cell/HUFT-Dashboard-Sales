// Public configuration only. Set these values before deployment.
window.HUFT_CONFIG = {
  supabaseUrl: 'https://wyqksfncdlwjduyispmb.supabase.co',
  supabasePublishableKey: 'sb_publishable_aWp9LDntXl0nRVMS3laNJQ_ycDrJK7Z',
  appVersion: '2.0.0',
  sentryOrg: 'huft-sales-dashboard',
  sentryDsn: window.HUFT_CONFIG?.sentryDsn || '' // Paste your Sentry DSN here to activate monitoring
};
