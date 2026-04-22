export const FLUENT_PLUGIN_ID = 'fluent';
export const FLUENT_SERVER_ID = 'fluent';
export const DEFAULT_PROFILE_NAME = 'default';
export const DEFAULT_WARN_BEFORE_EXPIRY_MINUTES = 10;
export const CALLBACK_HOST = '127.0.0.1';
export const CALLBACK_PORT = 8976;
export const CALLBACK_PATH = '/callback';
export const AUTH_STATE_VERSION = 1;
export const FLUENT_OSS_TOKEN_ENV = 'FLUENT_OSS_TOKEN';
export const FLUENT_LOCAL_TOKEN_ENV = 'FLUENT_LOCAL_TOKEN';
export const FLUENT_REQUIRED_HOSTED_SCOPES = [
  'meals:read',
  'meals:write',
  'health:read',
  'health:write',
  'style:read',
  'style:write',
  'offline_access',
];
export const FLUENT_REQUIRED_HOSTED_SCOPE = FLUENT_REQUIRED_HOSTED_SCOPES.join(' ');

export const PACKAGED_TEMPLATE_FILES = {
  cloud: ['.mcp.hosted.json', '.mcp.json'],
  oss: ['.mcp.oss.json', '.mcp.local.json', '.mcp.json'],
};
