// src/state/version.js

// bump this string whenever you make breaking frontend changes
export const CLIENT_SCHEMA_VERSION = "v1";

// clear old localStorage if version has changed
if (localStorage.getItem("co_version") !== CLIENT_SCHEMA_VERSION) {
  localStorage.clear();
  localStorage.setItem("co_version", CLIENT_SCHEMA_VERSION);
}

