export const IS_STAGING_BRAND = import.meta.env.VITE_APP_ENV === "staging";

export const BRAND_NAME = IS_STAGING_BRAND ? "Demo CRM" : "Automotive CRM";
export const BRAND_FULL_NAME = IS_STAGING_BRAND ? "Automotive Service CRM — Demo" : "Automotive Service CRM";
export const BRAND_LOGO_PATH = "/app-mark.svg";
export const BRAND_ENV_BADGE = IS_STAGING_BRAND ? "STAGING" : null;
